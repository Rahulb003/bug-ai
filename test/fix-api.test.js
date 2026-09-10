import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeWithEngine } from "../server/services/engine/analysisPipeline.js";
import { proposeFixes } from "../server/services/engine/ai/aiFixer.js";

// The fix endpoint can call Gemini. Keep the suite hermetic by default and opt
// in to a live call only with BUG_AI_TEST_LIVE_AI=1, so `node --test` never
// depends on a key, a network, or paid quota.
const liveAi = process.env.BUG_AI_TEST_LIVE_AI === "1";

const testDirectory = await mkdtemp(path.join(tmpdir(), "bug-ai-fix-"));
process.env.BUG_AI_DB_PATH = path.join(testDirectory, "db.json");
const { default: app } = await import("../server/app.js");
// Importing the app runs dotenv, so drop the key afterwards, not before.
if (!liveAi) delete process.env.GEMINI_API_KEY;

test("BUGAI-PY-001 still carries a mechanical suggestedFix", async () => {
  const result = await analyzeWithEngine({ source: "def run(x)\n    return x", language: "python", sourceName: "unsafe.py", includeAi: false });
  const colon = result.findings.find((item) => item.rule === "BUGAI-PY-001");
  assert.ok(colon, "expected a missing-colon finding");
  assert.equal(colon.fixable, true);
  assert.equal(colon.suggestedFix, "def run(x):");
});

test("proposeFixes reports not_configured instead of fabricating a fix without a key", async (t) => {
  if (liveAi) return t.skip("live AI enabled");
  const result = await proposeFixes({ source: "eval(input)", language: "javascript", sourceName: "a.js", findings: [{ id: "x", category: "security", severity: "CRITICAL", line: 1, rule: "BUGAI-SEC-001", title: "Dynamic code execution", evidence: ["eval("] }] });
  assert.equal(result.status, "not_configured");
  assert.deepEqual(result.fixes, []);
});

test("proposeFixes short-circuits before any network call when no finding qualifies", async (t) => {
  // A key is present but unusable here; the filter must return first, proving
  // low-severity and non-security findings never reach the API.
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "unusable-test-key";
  t.after(() => { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; });
  const result = await proposeFixes({ source: "let a = 1;", language: "javascript", sourceName: "a.js", findings: [
    { id: "y", category: "quality", severity: "INFO", line: 1, rule: "BUGAI-QUAL-001", title: "TODO", evidence: ["TODO"] },
    { id: "z", category: "security", severity: "MEDIUM", line: 1, rule: "BUGAI-SEC-006", title: "Path traversal", evidence: [".."] }
  ] });
  assert.equal(result.status, "completed");
  assert.deepEqual(result.fixes, []);
});

test("POST /api/fix returns tagged fix proposals and never fabricates AI output", async (t) => {
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
  const session = await request("/auth/register", { method: "POST", body: { username: "fixuser", email: "fix@example.test", password: "safe-password" } });

  // A snippet carrying both a mechanically fixable finding (missing colon) and
  // an AI-only one (eval), so `fixes` is non-empty with or without a key.
  const mixed = await request("/fix", { method: "POST", token: session.token, body: { language: "python", filename: "unsafe.py", code: "def run(x)\n    return eval(x)" } });
  assert.equal(mixed.status, "completed");
  assert.ok(mixed.fixes.length > 0, "expected at least the mechanical fix");
  assert.ok(mixed.fixes.every((item) => typeof item.source === "string" && item.source), "every fix must declare its origin");
  assert.ok(mixed.fixes.every((item) => String(item.suggestedFix || "").trim()), "no fix may be empty");
  const mechanical = mixed.fixes.find((item) => item.source === "deterministic");
  assert.equal(mechanical.suggestedFix, "def run(x):");
  assert.equal(mechanical.verification, "NOT_RUN");

  const evalOnly = await request("/fix", { method: "POST", token: session.token, body: { language: "javascript", filename: "add.js", code: "function add(a,b){ eval(a); return a+b }" } });
  assert.ok(evalOnly.fixes.every((item) => typeof item.source === "string" && item.source));

  if (liveAi) {
    assert.equal(mixed.aiStatus, "completed");
    assert.ok(evalOnly.fixes.length > 0, "a live key should yield an AI proposal for eval()");
    assert.ok(evalOnly.fixes.every((item) => item.source === "ai"));
  } else {
    // No key: the AI path must say so rather than invent a patch.
    assert.equal(mixed.aiStatus, "not_configured");
    assert.ok(mixed.fixes.every((item) => item.source === "deterministic"));
    assert.equal(evalOnly.aiStatus, "not_configured");
    assert.deepEqual(evalOnly.fixes, [], "eval() has no safe mechanical fix, so nothing may be proposed");
  }
});
