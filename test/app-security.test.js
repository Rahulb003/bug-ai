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

test("browser sessions: httpOnly cookie, CSRF header on cookie writes, logout clears, bearer still works", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const u = Math.random().toString(36).slice(2, 8);
  const reg = await fetch(`${base}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "ck" + u, email: `ck${u}@example.test`, password: "safe-password" }) });
  assert.equal(reg.status, 201);
  const setCookie = reg.headers.get("set-cookie") || "";
  assert.match(setCookie, /bugai_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(";")[0];
  const { token } = await reg.json();

  // Cookie alone authenticates reads.
  assert.equal((await fetch(`${base}/auth/me`, { headers: { cookie } })).status, 200);
  // Cookie-authenticated writes need the custom header (cross-site forms cannot send it).
  const noHeader = await fetch(`${base}/projects`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ name: "x", files: [] }) });
  assert.equal(noHeader.status, 403);
  const withHeader = await fetch(`${base}/projects`, { method: "POST", headers: { cookie, "Content-Type": "application/json", "X-Requested-With": "BugAI" }, body: JSON.stringify({ name: "x", files: [{ name: "a.js", content: "1" }] }) });
  assert.equal(withHeader.status, 201);
  // Bearer clients are unaffected and need no CSRF header.
  assert.equal((await fetch(`${base}/projects`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "y", files: [{ name: "b.js", content: "1" }] }) })).status, 201);
  // Query-string tokens are no longer accepted.
  assert.equal((await fetch(`${base}/auth/me?token=${encodeURIComponent(token)}`)).status, 401);
  // Logout clears the cookie.
  const out = await fetch(`${base}/auth/logout`, { method: "POST", headers: { cookie, "X-Requested-With": "BugAI" } });
  assert.match(out.headers.get("set-cookie") || "", /Max-Age=0/);
  // Bearer -> cookie exchange.
  const ex = await fetch(`${base}/auth/session`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(ex.status, 200);
  assert.match(ex.headers.get("set-cookie") || "", /bugai_session=/);
});

test("rate limiter keys authenticated traffic per account, anonymous per IP", async (t) => {
  const { requestRateLimiter } = await import("../server/middleware/rateLimiter.js");
  const { signJwt } = await import("../server/utils/jwt.js");
  const run = (headers) => new Promise((resolve) => { const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status() { return { json: () => resolve({ limited: true }) }; } }; requestRateLimiter({ headers, ip: "9.9.9.9" }, res, () => resolve({ limited: false, remaining: Number(res.headers["X-RateLimit-Remaining"]), limit: Number(res.headers["X-RateLimit-Limit"]) })); });
  const a = await run({ authorization: `Bearer ${signJwt({ sub: "user-a" })}` });
  const b = await run({ authorization: `Bearer ${signJwt({ sub: "user-b" })}` });
  assert.equal(a.limit, 120); assert.equal(b.limit, 120);
  assert.equal(a.remaining, b.remaining, "two accounts from one IP have independent budgets");
  const anon = await run({});
  assert.equal(anon.limit, 60, "anonymous traffic gets the smaller per-IP budget");
});
