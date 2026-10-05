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

test("profile: update username/email/preferences, change password, passwords keep their characters", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const u = Math.random().toString(36).slice(2, 8);
  const pw = "p<ss>w{o}rd'\"1";
  const json = (r) => r.json();
  const reg = await json(await fetch(`${base}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "pf" + u, email: `pf${u}@example.test`, password: pw }) }));
  const H = { "Content-Type": "application/json", Authorization: `Bearer ${reg.token}` };
  assert.equal((await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "pf" + u, password: pw }) })).status, 200, "special characters in a password survive the sanitizer");
  const upd = await json(await fetch(`${base}/auth/me`, { method: "PATCH", headers: H, body: JSON.stringify({ username: "pf" + u + "x", preferences: { density: "compact", accent: "violet", junk: "ignored", editorFontSize: 15 } }) }));
  assert.equal(upd.user.username, "pf" + u + "x");
  assert.deepEqual(upd.user.preferences, { density: "compact", accent: "violet", editorFontSize: 15 }, "only allow-listed preference keys are stored");
  assert.equal((await fetch(`${base}/auth/me`, { method: "PATCH", headers: H, body: JSON.stringify({ email: "not-an-email" }) })).status, 400);
  const other = await json(await fetch(`${base}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "pg" + u, email: `pg${u}@example.test`, password: "safe-password" }) }));
  assert.equal((await fetch(`${base}/auth/me`, { method: "PATCH", headers: H, body: JSON.stringify({ username: other.user.username }) })).status, 409, "cannot take another user's name");
  assert.equal((await fetch(`${base}/auth/password`, { method: "POST", headers: H, body: JSON.stringify({ currentPassword: "wrong", newPassword: "new-password-1" }) })).status, 401);
  assert.equal((await fetch(`${base}/auth/password`, { method: "POST", headers: H, body: JSON.stringify({ currentPassword: pw, newPassword: "short" }) })).status, 400);
  assert.equal((await fetch(`${base}/auth/password`, { method: "POST", headers: H, body: JSON.stringify({ currentPassword: pw, newPassword: "new-password-1" }) })).status, 200);
  assert.equal((await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "pf" + u + "x", password: "new-password-1" }) })).status, 200);
  assert.equal((await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "pf" + u + "x", password: pw }) })).status, 401, "old password no longer works");
});

test("password hashing: PBKDF2 at current guidance, legacy hashes still verify and upgrade on login", async () => {
  const crypto = await import("node:crypto");
  const { hashPassword, verifyPassword, needsRehash, PBKDF2_ITERATIONS } = await import("../server/utils/hash.js");

  assert.ok(PBKDF2_ITERATIONS >= 210000, "iterations meet OWASP guidance for PBKDF2-SHA512");
  const stored = await hashPassword("correct horse battery staple");
  const [scheme, digest, iterations, salt, hash] = stored.split("$");
  assert.equal(scheme, "pbkdf2");
  assert.equal(digest, "sha512");
  assert.equal(Number(iterations), PBKDF2_ITERATIONS, "parameters travel with the hash");
  assert.equal(Buffer.from(salt, "hex").length, 16, "random 16-byte salt");
  assert.equal(Buffer.from(hash, "hex").length, 64);
  assert.equal(await verifyPassword("correct horse battery staple", stored), true);
  assert.equal(await verifyPassword("wrong password", stored), false);
  assert.equal(needsRehash(stored), false);

  // Two hashes of the same password differ (salted).
  assert.notEqual(stored, await hashPassword("correct horse battery staple"));

  // A hash written in the old <salt>:<digest> / 10,000-iteration format.
  const legacySalt = crypto.randomBytes(16).toString("hex");
  const legacy = `${legacySalt}:${crypto.pbkdf2Sync("old-password", legacySalt, 10000, 64, "sha512").toString("hex")}`;
  assert.equal(await verifyPassword("old-password", legacy), true, "legacy hashes keep working");
  assert.equal(await verifyPassword("nope", legacy), false);
  assert.equal(needsRehash(legacy), true, "and are flagged for upgrade");

  // Malformed records are rejected, never thrown on.
  for (const bad of ["", null, "garbage", "pbkdf2$sha512$x$y$z", "onlysalt:", ":onlyhash"]) {
    assert.equal(await verifyPassword("x", bad), false, `rejects ${JSON.stringify(bad)}`);
  }
});

test("logging in with a legacy hash silently re-hashes it at the new cost", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const crypto = await import("node:crypto");
  const { findUserByUsername } = await import("../server/models/userModel.js");
  const { updateUserById } = await import("../server/models/userModel.js");
  const { needsRehash } = await import("../server/utils/hash.js");

  const u = "legacy" + Math.random().toString(36).slice(2, 7);
  await fetch(`${base}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, email: `${u}@example.test`, password: "safe-password" }) });

  // Force the account back to the old format, as an existing database would hold it.
  const salt = crypto.randomBytes(16).toString("hex");
  const record = await findUserByUsername(u);
  await updateUserById(record.id, { passwordHash: `${salt}:${crypto.pbkdf2Sync("safe-password", salt, 10000, 64, "sha512").toString("hex")}` });
  assert.equal(needsRehash((await findUserByUsername(u)).passwordHash), true);

  const login = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: "safe-password" }) });
  assert.equal(login.status, 200, "the old password still logs in");
  const after = (await findUserByUsername(u)).passwordHash;
  assert.ok(after.startsWith("pbkdf2$sha512$"), "stored hash was upgraded in place");
  assert.equal(needsRehash(after), false);

  // And the upgraded hash still accepts the same password.
  assert.equal((await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: "safe-password" }) })).status, 200);
  assert.equal((await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: "wrong" }) })).status, 401);
});
