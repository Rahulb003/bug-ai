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
