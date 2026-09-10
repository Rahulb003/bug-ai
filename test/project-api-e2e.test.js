import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const testDirectory = await mkdtemp(path.join(tmpdir(), "bug-ai-e2e-"));
process.env.BUG_AI_DB_PATH = path.join(testDirectory, "db.json");
const { default: app } = await import("../server/app.js");

test("authenticated project workflow persists files, metadata, and analysis without executing code", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(testDirectory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (route, options = {}) => {
    const response = await fetch(`${base}${route}`, { headers: { "Content-Type": "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) }, method: options.method || "GET", body: options.body ? JSON.stringify(options.body) : undefined });
    const payload = await response.json();
    assert.ok(response.ok, payload.error || `${route} failed`);
    return payload;
  };
  const session = await request("/auth/register", { method: "POST", body: { username: "e2euser", email: "e2e@example.test", password: "safe-password" } });
  const created = await request("/projects", { method: "POST", token: session.token, body: { name: "E2E Project", files: [
    { name: "package.json", content: JSON.stringify({ dependencies: { express: "1.0.0" } }) },
    { name: "src/app.js", content: "const query = 'SELECT * FROM users ' + id;" }
  ] } });
  const id = created.project.id;
  const files = await request(`/projects/${id}/files`, { token: session.token });
  assert.equal(files.files.length, 2);
  const dependencies = await request(`/projects/${id}/dependencies`, { token: session.token });
  assert.ok(dependencies.dependencies.declared.includes("express"));
  const analysis = await request(`/projects/${id}/analyze`, { method: "POST", token: session.token, body: { includeAi: false } });
  assert.ok(analysis.analysis.findings.some((item) => item.rule === "BUGAI-SEC-003"));
  assert.equal(analysis.analysis.verification.status, "PARTIALLY_VERIFIED");
});
