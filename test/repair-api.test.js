import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// BUG_AI_DB_PATH must be set before any server module loads.
const testDirectory = await mkdtemp(path.join(tmpdir(), "bug-ai-repair-"));
process.env.BUG_AI_DB_PATH = path.join(testDirectory, "db.json");
const { fixAndVerifyAll, diffFindings, applyLineFixes } = await import("../server/services/engine/repairPipeline.js");
const { default: app } = await import("../server/app.js");
// Hermetic: the real fixer must not be reached.
delete process.env.GEMINI_API_KEY;

const PY = "def run(x)\n    total = 0\n    for i in range(len(x))\n        total += x[i] / 0\n    return eval(total)\n";
const noAi = async () => ({ status: "not_configured", fixes: [] });

test("diffFindings matches by rule+title so line shifts do not count as changes", () => {
  const f = (rule, title, line) => ({ rule, title, line, severity: "HIGH" });
  const before = [f("A", "one", 1), f("B", "two", 5), f("B", "two", 9)];
  const after = [f("B", "two", 6), f("C", "three", 2)];
  const d = diffFindings(before, after);
  assert.deepEqual(d.resolved.map((x) => x.rule + x.line), ["A1", "B9"]);
  assert.deepEqual(d.remaining.map((x) => x.rule + x.line), ["B5"]);
  assert.deepEqual(d.introduced.map((x) => x.rule), ["C"]);
});

test("applyLineFixes applies bottom-up and reports before/after per line", () => {
  const out = applyLineFixes("a\nb\nc", [{ line: 1, suggestedFix: "A" }, { line: 3, suggestedFix: "C1\nC2" }, { line: 9, suggestedFix: "ignored" }]);
  assert.equal(out.code, "A\nb\nC1\nC2");
  assert.equal(out.applied.length, 2);
  assert.equal(out.applied.find((a) => a.line === 1).before, "a");
});

test("deterministic path: counts come from the rescan, not from patches applied", async () => {
  const r = await fixAndVerifyAll({ source: PY, language: "python", sourceName: "calc.py", propose: noAi });
  assert.equal(r.summary.detected, 4);
  assert.equal(r.summary.applied, 2, "two missing-colon fixes exist");
  assert.equal(r.summary.fixed, 2, "and the rescan confirms both findings are gone");
  assert.equal(r.summary.remaining, 2, "division by zero and eval have no mechanical fix");
  assert.equal(r.summary.introduced, 0);
  assert.equal(r.changed, true);
  assert.match(r.code, /^def run\(x\):/);
  assert.equal(r.verdict, "PARTIALLY_VERIFIED");
  assert.equal(r.tests.status, "not_run", "no key, so tests cannot be generated and are not claimed");
  assert.ok(r.steps.some((s) => s.name === "regression-check" && s.status === "completed"));
});

test("AI proposals are held for review unless explicitly applied", async () => {
  const propose = async ({ findings }) => ({ status: "completed", fixes: findings.filter((f) => f.rule === "BUGAI-RUN-001").map((f) => ({ findingId: f.id, proposedFix: "        total += x[i] / max(len(x), 1)", explanation: "guard the denominator" })) });
  const held = await fixAndVerifyAll({ source: PY, language: "python", sourceName: "calc.py", propose });
  assert.equal(held.summary.requiresReview, 1, "the AI fix is listed for review");
  assert.equal(held.summary.applied, 2, "only the deterministic fixes were applied");
  assert.ok(held.requiresReview[0].suggestedFix.includes("max(len(x), 1)"));

  const applied = await fixAndVerifyAll({ source: PY, language: "python", sourceName: "calc.py", propose, applyAiFixes: true });
  assert.equal(applied.summary.applied, 3);
  assert.equal(applied.summary.fixed, 3, "the rescan confirms division by zero is gone too");
  assert.equal(applied.summary.requiresReview, 0);
  assert.ok(applied.modifications.some((m) => m.source === "ai"));
});

test("a proposal that introduces a CRITICAL finding is rejected and the pipeline backs off", async () => {
  // The "fix" replaces the division with eval() — a CRITICAL regression.
  const propose = async ({ findings }) => ({ status: "completed", fixes: findings.filter((f) => f.rule === "BUGAI-RUN-001").map((f) => ({ findingId: f.id, proposedFix: "        total += eval(x[i])", explanation: "bad idea" })) });
  const r = await fixAndVerifyAll({ source: PY, language: "python", sourceName: "calc.py", propose, applyAiFixes: true });
  assert.equal(r.attempts.length, 2, "round 1 tried everything, round 2 backed off to deterministic only");
  assert.equal(r.attempts[0].accepted, false);
  assert.ok(r.attempts[0].introduced >= 1);
  assert.equal(r.attempts[1].accepted, true);
  assert.equal(r.summary.applied, 2, "the AI proposal was dropped; the two safe fixes landed");
  assert.equal(r.summary.introduced, 0, "the accepted candidate introduced nothing");
  assert.ok(!r.code.includes("eval(x[i])"), "the rejected proposal never reaches the candidate");
  assert.ok(!r.modifications.some((m) => m.source === "ai"));
});

test("a proposal that breaks syntax is rejected", async () => {
  const propose = async ({ findings }) => ({ status: "completed", fixes: findings.filter((f) => f.rule === "BUGAI-SEC-001").map((f) => ({ findingId: f.id, proposedFix: "    return ((total", explanation: "unbalanced" })) });
  const r = await fixAndVerifyAll({ source: "def ok(x):\n    total = 1\n    return eval(total)\n", language: "python", sourceName: "s.py", propose, applyAiFixes: true });
  assert.equal(r.attempts[0].syntaxBroken, true);
  assert.equal(r.attempts[0].accepted, false);
  assert.equal(r.changed, false, "nothing safe was available, so the original is kept");
  assert.equal(r.verdict, "REJECTED");
});

test("a clean file reports NOTHING_TO_FIX without inventing work", async () => {
  const r = await fixAndVerifyAll({ source: "def ok(a, b):\n    return a + b\n", language: "python", sourceName: "ok.py", propose: noAi });
  assert.equal(r.verdict, "NOTHING_TO_FIX");
  assert.equal(r.changed, false);
  assert.deepEqual(r.summary, { detected: 0, fixed: 0, remaining: 0, requiresReview: 0, introduced: 0 });
});

test("POST /api/repair returns the report and never saves anything", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(testDirectory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (route, options = {}) => {
    const response = await fetch(`${base}${route}`, { headers: { "Content-Type": "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) }, method: options.method || "GET", body: options.body ? JSON.stringify(options.body) : undefined });
    return { status: response.status, payload: await response.json() };
  };
  const session = (await call("/auth/register", { method: "POST", body: { username: "repairuser", email: "repair@example.test", password: "safe-password" } })).payload;
  assert.equal((await call("/repair", { method: "POST", body: { code: PY } })).status, 401);
  const r = await call("/repair", { method: "POST", token: session.token, body: { code: PY, language: "python", filename: "calc.py" } });
  assert.equal(r.status, 200);
  assert.equal(r.payload.summary.detected, 4);
  assert.equal(r.payload.summary.fixed, 2);
  assert.ok(Array.isArray(r.payload.modifications) && r.payload.modifications.length === 2);
  assert.match(r.payload.note, /Nothing has been saved/);
  const empty = await call("/repair", { method: "POST", token: session.token, body: { code: "  " } });
  assert.equal(empty.status, 400);
});

test("a suite that crashes before any test runs is reported as crashed, never as 0/0 passed", async () => {
  const { runGeneratedTests } = await import("../server/services/engine/verification/testRunner.js");
  const prev = process.env.EXECUTION_SANDBOX_ENABLED; process.env.EXECUTION_SANDBOX_ENABLED = "true";
  try {
    const out = await runGeneratedTests({ language: "javascript", tests: [{ name: "imports the module", code: 'import { test } from "node:test";\nconst { login } = require("./auth");\ntest("x", () => {});' }] });
    assert.equal(out.results[0].status, "crashed");
    assert.equal(out.results[0].failures[0].test, "(suite did not start)");
    assert.match(out.results[0].failures[0].detail, /require|auth/);
    assert.equal(out.totals.suitesFailed, 1);
    assert.equal(out.totals.suitesPassed, 0);
  } finally { if (prev === undefined) delete process.env.EXECUTION_SANDBOX_ENABLED; else process.env.EXECUTION_SANDBOX_ENABLED = prev; }
});

test("the verdict never claims verification when nothing changed or no test passed", async () => {
  // Regression: a run with fixed=0, changed=false and three crashed suites was
  // reported as VERIFIED_STATIC_AND_TESTS because only tests.status was checked.
  const propose = async ({ findings }) => ({ status: "completed", fixes: findings.slice(0, 1).map((f) => ({ findingId: f.id, proposedFix: "held", explanation: "for review" })) });
  const r = await fixAndVerifyAll({ source: "function f(a){ return eval(a); }\n", language: "javascript", sourceName: "f.js", propose });
  assert.equal(r.changed, false, "eval has no mechanical fix and the AI one is held for review");
  assert.equal(r.summary.fixed, 0);
  assert.equal(r.verdict, "NO_SAFE_FIX");
  assert.ok(!/VERIFIED/.test(r.verdict));
});
