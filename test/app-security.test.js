import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// BUG_AI_DB_PATH must be set before any server module loads.
process.env.BUG_AI_DB_PATH = path.join(await mkdtemp(path.join(tmpdir(), "bug-ai-security-")), "db.json");
const { default: app } = await import("../server/app.js");

test("only explicit browser assets are public", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const { port } = server.address();
  const request = (path) => fetch(`http://127.0.0.1:${port}${path}`, { redirect: "manual" });

  assert.equal((await request("/index.html")).status, 200);
  assert.equal((await request("/style.css")).status, 200);
  assert.equal((await request("/studio.html")).status, 200);
  assert.equal((await request("/workspace.js")).status, 200);
  for (const path of ["/data/db.json", "/server/app.js", "/.env", "/package.json", "/test/engine.test.js"]) {
    assert.equal((await request(path)).status, 404, `${path} must not be public`);
  }
});

test("there is no password-less login path", async (t) => {
  // /auth/google accepted any email and returned a session for the matching
  // user — an authentication bypass. It must stay removed until a real
  // ID-token verification exists.
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/google`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "anyone@example.test", name: "x" }) });
  assert.ok([401, 404].includes(response.status), "the endpoint must not exist (unmatched /api paths fall through to requireAuth)");
  const body = await response.json();
  assert.equal(body.token, undefined, "no session may ever be issued from an email alone");
  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "nobody", password: "" }) });
  assert.ok([400, 401].includes(login.status), "login without a valid password is refused");
});

test("database: concurrent updates never expose a half-written file or lose writes", async () => {
  const { updateDatabase, readDatabase } = await import("../server/models/database.js");
  await updateDatabase((d) => ({ ...d, counter: 0, pad: "x".repeat(300000) }));
  let badReads = 0;
  const readers = (async () => { for (let i = 0; i < 40; i++) { try { await readDatabase(); } catch { badReads++; } } })();
  await Promise.all([readers, ...Array.from({ length: 25 }, () => updateDatabase((d) => ({ ...d, counter: d.counter + 1 })))]);
  assert.equal(badReads, 0, "a reader must never see a truncated database");
  assert.equal((await readDatabase()).counter, 25, "no update was lost to a stale read");
});
