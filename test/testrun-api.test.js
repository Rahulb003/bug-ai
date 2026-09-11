import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// BUG_AI_DB_PATH must be set before any server module loads.
const testDirectory = await mkdtemp(path.join(tmpdir(), "bug-ai-testrun-"));
process.env.BUG_AI_DB_PATH = path.join(testDirectory, "db.json");
const { runGeneratedTests, runnerCapability, discoverProjectTests } = await import("../server/services/engine/verification/testRunner.js");
const { runInSandbox } = await import("../server/services/engine/verification/sandboxExecutor.js");
const { default: app } = await import("../server/app.js");

const withSandbox = async (fn) => {
  const prev = process.env.EXECUTION_SANDBOX_ENABLED, prevT = process.env.EXECUTION_SANDBOX_TIMEOUT_MS;
  process.env.EXECUTION_SANDBOX_ENABLED = "true"; process.env.EXECUTION_SANDBOX_TIMEOUT_MS = "2500";
  try { return await fn(); } finally {
    if (prev === undefined) delete process.env.EXECUTION_SANDBOX_ENABLED; else process.env.EXECUTION_SANDBOX_ENABLED = prev;
    if (prevT === undefined) delete process.env.EXECUTION_SANDBOX_TIMEOUT_MS; else process.env.EXECUTION_SANDBOX_TIMEOUT_MS = prevT;
  }
};
const withSandboxOff = async (fn) => {
  const prev = process.env.EXECUTION_SANDBOX_ENABLED;
  process.env.EXECUTION_SANDBOX_ENABLED = "false";
  try { return await fn(); } finally { if (prev === undefined) delete process.env.EXECUTION_SANDBOX_ENABLED; else process.env.EXECUTION_SANDBOX_ENABLED = prev; }
};
const suite = (name, body) => ({ name, code: 'import { test } from "node:test";\nimport assert from "node:assert";\n' + body });

test("a failing program is not mislabelled as a timeout", async () => {
  // Regression: the old heuristic treated "non-zero exit, no signal, empty
  // stderr" as a timeout, which is exactly what a failing test suite looks like.
  await withSandbox(async () => {
    const failing = await runInSandbox({ code: "process.exit(3);", language: "javascript" });
    assert.equal(failing.exitCode, 3);
    assert.equal(failing.timedOut, false, "an ordinary non-zero exit must not be reported as a timeout");
    const hanging = await runInSandbox({ code: "while(true){}", language: "javascript" });
    assert.equal(hanging.timedOut, true, "a genuine hang must still be reported as a timeout");
  });
});

test("runner capability is honest per language and per sandbox state", async () => {
  await withSandboxOff(async () => {
    const off = runnerCapability("javascript");
    assert.equal(off.status, "not_available");
    assert.match(off.reason, /disabled by configuration/);
  });
  await withSandbox(async () => {
    assert.equal(runnerCapability("javascript").status, "available");
    const py = runnerCapability("python");
    assert.equal(py.status, "not_available");
    assert.match(py.reason, /not installed/);
    assert.equal(runnerCapability("css").status, "not_available");
  });
});

test("runGeneratedTests reports pass, fail and timeout from real execution", async () => {
  await withSandbox(async () => {
    const out = await runGeneratedTests({ language: "javascript", tests: [
      suite("passes", 'test("adds", () => assert.strictEqual(1 + 1, 2));'),
      suite("fails", 'test("ok", () => assert.strictEqual(1, 1));\ntest("bad", () => assert.strictEqual(2 + 2, 5));'),
      suite("hangs", 'test("spin", () => { while (true) {} });')
    ] });
    assert.equal(out.status, "completed");
    assert.equal(out.runner, "node:test");
    const byName = Object.fromEntries(out.results.map((r) => [r.name, r]));
    assert.equal(byName.passes.status, "passed");
    assert.equal(byName.passes.passed, 1);
    assert.equal(byName.fails.status, "failed");
    assert.equal(byName.fails.passed, 1);
    assert.equal(byName.fails.failed, 1);
    assert.equal(byName.fails.failures[0].test, "bad");
    assert.match(byName.fails.failures[0].detail || "", /AssertionError/);
    assert.equal(byName.hangs.status, "timed_out");
    assert.equal(byName.hangs.timedOut, true);
    assert.equal(out.totals.suitesPassed, 1, "only the suite that really passed counts as passed");
    assert.equal(out.coverage.status, "not_available");
  });
});

test("runGeneratedTests never reports a pass when execution is off", async () => {
  await withSandboxOff(async () => {
    const out = await runGeneratedTests({ language: "javascript", tests: [suite("x", 'test("a", () => {});')] });
    assert.equal(out.status, "not_available");
    assert.deepEqual(out.results, []);
  });
});

test("discoverProjectTests finds test files without executing them", () => {
  const project = { files: [
    { name: "src/a.js", language: "javascript", content: "export const a = 1;" },
    { name: "tests/a.test.js", language: "javascript", content: 'test("adds", () => {});\nit("subtracts", () => {});' }
  ], metadata: { tests: ["tests/a.test.js"] } };
  const found = discoverProjectTests(project);
  assert.equal(found.status, "discovered");
  assert.equal(found.count, 1);
  assert.deepEqual(found.files[0].cases, ["adds", "subtracts"]);
  assert.equal(found.executionStatus, "not_available");
});

test("test endpoints: capability, run, and project discovery", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(testDirectory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (route, options = {}) => {
    const response = await fetch(`${base}${route}`, { headers: { "Content-Type": "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) }, method: options.method || "GET", body: options.body ? JSON.stringify(options.body) : undefined });
    return { status: response.status, payload: await response.json() };
  };
  const request = async (route, options) => { const r = await call(route, options); assert.ok(r.status < 400, r.payload.error || `${route} failed`); return r.payload; };
  const session = await request("/auth/register", { method: "POST", body: { username: "truser", email: "tr@example.test", password: "safe-password" } });
  const other = await request("/auth/register", { method: "POST", body: { username: "trother", email: "tr2@example.test", password: "safe-password" } });

  assert.equal((await call("/test/capability")).status, 401, "capability requires auth");
  const cap = await request("/test/capability?language=javascript", { token: session.token });
  assert.ok(["available", "not_available"].includes(cap.status));

  const run = await request("/test/run", { method: "POST", token: session.token, body: { language: "javascript", tests: [suite("s", 'test("a", () => assert.ok(true));')] } });
  assert.ok(["completed", "not_available"].includes(run.status));
  if (run.status === "not_available") assert.deepEqual(run.results, []);
  else assert.equal(run.results[0].status, "passed");

  const created = await request("/projects", { method: "POST", token: session.token, body: { name: "TR Project", files: [{ name: "src/x.js", content: "1" }, { name: "src/x.test.js", content: 'test("t", () => {})' }] } });
  const found = await request(`/projects/${created.project.id}/tests`, { token: session.token });
  assert.equal(found.count, 1);
  assert.equal(found.files[0].name, "src/x.test.js");
  const stolen = await call(`/projects/${created.project.id}/tests`, { token: other.token });
  assert.equal(stolen.status, 404, "another user's project tests must not be readable");
});
