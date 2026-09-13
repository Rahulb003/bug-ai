import test from "node:test";
import assert from "node:assert/strict";
import app from "../server/app.js";

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
