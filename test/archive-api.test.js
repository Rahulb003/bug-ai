import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";

// BUG_AI_DB_PATH must be set before any server module loads.
const testDirectory = await mkdtemp(path.join(tmpdir(), "bug-ai-archive-"));
process.env.BUG_AI_DB_PATH = path.join(testDirectory, "db.json");
const { extractArchive, stripCommonRoot, buildArchive } = await import("../server/services/archiveService.js");
const { default: app } = await import("../server/app.js");

const zipOf = (entries) => Buffer.from(zipSync(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, v instanceof Uint8Array ? v : strToU8(v)])))).toString("base64");

test("extractArchive turns a zip into the project file list", () => {
  const out = extractArchive(zipOf({ "demo/src/a.js": "const a = 1 < 2;", "demo/README.md": "# hi", "demo/src/": "" }));
  const files = stripCommonRoot(out.files);
  assert.deepEqual(files.map((f) => f.name).sort(), ["README.md", "src/a.js"]);
  assert.equal(files.find((f) => f.name === "src/a.js").content, "const a = 1 < 2;", "source content is byte-exact");
  assert.equal(out.skipped.directories, 1);
});

test("zip-slip paths are dropped and absolute paths are made relative", () => {
  // ".." segments and drive prefixes are dropped outright. A leading "/" is
  // stripped, the same normalisation normalizeProjectFiles applies, because a
  // relative name cannot escape: project files are stored as records, not
  // written to disk at that path.
  const out = extractArchive(zipOf({ "../../etc/passwd": "x", "/abs/file.js": "x", "C:/win/file.js": "x", "ok/safe.js": "y", "a/../b.js": "z" }));
  assert.deepEqual(out.files.map((f) => f.name).sort(), ["abs/file.js", "ok/safe.js"]);
  assert.equal(out.skipped.unsafePath, 3);
  assert.ok(out.files.every((f) => !f.name.includes("..") && !f.name.startsWith("/") && !/^[a-zA-Z]:/.test(f.name)));
});

test("binary entries are skipped and counted", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
  const out = extractArchive(zipOf({ "logo.png": png, "src/a.js": "ok" }));
  assert.deepEqual(out.files.map((f) => f.name), ["src/a.js"]);
  assert.equal(out.skipped.binary, 1);
});

test("a non-zip upload is rejected cleanly", () => {
  assert.throws(() => extractArchive(Buffer.from("this is not a zip").toString("base64")), /not a valid ZIP/);
  assert.throws(() => extractArchive(""), /required/);
});

test("buildArchive produces a zip that round-trips", () => {
  const zip = buildArchive([{ name: "src/x.ts", content: "let a: number = 1;" }, { name: "../evil.js", content: "no" }]);
  const back = unzipSync(new Uint8Array(zip));
  assert.deepEqual(Object.keys(back), ["src/x.ts"], "unsafe names never make it into an export");
  assert.equal(strFromU8(back["src/x.ts"]), "let a: number = 1;");
});

test("import-zip and export endpoints work end to end and respect ownership", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(testDirectory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (route, options = {}) => {
    const response = await fetch(`${base}${route}`, { headers: { "Content-Type": "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) }, method: options.method || "GET", body: options.body ? JSON.stringify(options.body) : undefined });
    return { status: response.status, response };
  };
  const json = async (route, options) => { const r = await call(route, options); const payload = await r.response.json(); assert.ok(r.status < 400, payload.error || `${route} failed`); return payload; };
  const owner = await json("/auth/register", { method: "POST", body: { username: "zipowner", email: "zip@example.test", password: "safe-password" } });
  const other = await json("/auth/register", { method: "POST", body: { username: "zipother", email: "zip2@example.test", password: "safe-password" } });

  const archive = zipOf({
    "myapp/package.json": '{ "name": "myapp", "dependencies": { "express": "^5" } }',
    "myapp/src/server.js": "const x = a < b ? 1 : 2; // preserved\n",
    "myapp/node_modules/dep/index.js": "ignored",
    "myapp/logo.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])
  });
  const imported = await json("/projects/import-zip", { method: "POST", token: owner.token, body: { name: "From Zip", archive } });
  assert.equal(imported.project.name, "From Zip");
  assert.equal(imported.project.fileCount, 2, "package.json and src/server.js; node_modules and the png are dropped");
  assert.equal(imported.import.source, "zip");
  assert.equal(imported.import.skipped.binary, 1);
  const files = await json(`/projects/${imported.project.id}/files`, { token: owner.token });
  assert.equal(files.files.find((f) => f.name === "src/server.js").content, "const x = a < b ? 1 : 2; // preserved\n", "content survives the sanitiser and the archive");

  // Export: a real zip, owner-only.
  const exp = await call(`/projects/${imported.project.id}/export`, { token: owner.token });
  assert.equal(exp.status, 200);
  assert.match(exp.response.headers.get("content-type"), /application\/zip/);
  const back = unzipSync(new Uint8Array(await exp.response.arrayBuffer()));
  assert.deepEqual(Object.keys(back).sort(), ["package.json", "src/server.js"]);
  assert.equal((await call(`/projects/${imported.project.id}/export`, { token: other.token })).status, 404, "another user's project must not be exportable");

  // Bad input is a clean 400, not a crash.
  const bad = await call("/projects/import-zip", { method: "POST", token: owner.token, body: { archive: Buffer.from("nope").toString("base64") } });
  assert.equal(bad.status, 400);
  // GitHub import validates the URL before any network call.
  const badUrl = await call("/projects/import-github", { method: "POST", token: owner.token, body: { repoUrl: "ftp://example.com/x" } });
  assert.equal(badUrl.status, 400);
});
