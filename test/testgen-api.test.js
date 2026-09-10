import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateTestCode } from "../server/services/engine/ai/aiTestGenerator.js";
import { generateTests } from "../server/services/engine/testGenerator.js";
import { analyzeWithEngine } from "../server/services/engine/analysisPipeline.js";

// Hermetic by default; opt in to a live Gemini call with BUG_AI_TEST_LIVE_AI=1.
const liveAi = process.env.BUG_AI_TEST_LIVE_AI === "1";

const testDirectory = await mkdtemp(path.join(tmpdir(), "bug-ai-testgen-"));
process.env.BUG_AI_DB_PATH = path.join(testDirectory, "db.json");
const { default: app } = await import("../server/app.js");
// Importing the app runs dotenv, so drop the key afterwards, not before.
if (!liveAi) delete process.env.GEMINI_API_KEY;

const EVAL_SNIPPET = "function add(a,b){ eval(a); return a+b }";
const FINDING = { id: "f1", category: "security", severity: "CRITICAL", line: 1, rule: "BUGAI-SEC-001", title: "Dynamic code execution", recommendation: "Avoid dynamic execution." };

test("unsupported language returns not_available before any key or API is touched", async (t) => {
  // A usable-looking key is present: reaching the API would be the bug.
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "unusable-test-key";
  t.after(() => { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; });
  const result = await generateTestCode({ source: "body { color: red; }", language: "css", sourceName: "a.css", findings: [FINDING], testRunner: null });
  assert.equal(result.status, "not_available");
  assert.deepEqual(result.tests, []);
  assert.match(result.reason, /not configured for css/);
});

test("supported language without a key degrades to a labelled plan, not fake code", async (t) => {
  if (liveAi) return t.skip("live AI enabled");
  const result = await generateTestCode({ source: EVAL_SNIPPET, language: "javascript", sourceName: "add.js", findings: [FINDING], testRunner: "node:test/Jest/Vitest" });
  assert.equal(result.status, "plan_only");
  assert.equal(result.framework, "node:test/Jest/Vitest");
  assert.ok(result.tests.length > 0);
  for (const item of result.tests) {
    assert.ok(item.name && item.intent, "plan entries keep name and intent");
    assert.equal(item.code, undefined, "a plan must not carry code it did not generate");
    assert.equal(item.status, "plan_only");
  }
});

test("/api/scan keeps its cheap embedded test stub with no AI call", async () => {
  const result = await analyzeWithEngine({ source: EVAL_SNIPPET, language: "javascript", sourceName: "add.js", includeAi: false });
  assert.equal(result.generatedTests.status, "generated");
  assert.ok(result.generatedTests.tests.length > 0);
  assert.ok(result.generatedTests.tests.every((item) => item.code === undefined), "the scan stub must stay name/intent only");
  // The embedded generator is still the synchronous, AI-free one.
  const direct = generateTests({ language: "javascript", sourceName: "add.js", findings: result.findings });
  assert.deepEqual(direct.tests, result.generatedTests.tests);
});

test("POST /api/test/generate returns a valid shape for every status", async (t) => {
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
  const session = await request("/auth/register", { method: "POST", body: { username: "tguser", email: "tg@example.test", password: "safe-password" } });

  const out = await request("/test/generate", { method: "POST", token: session.token, body: { language: "javascript", filename: "add.js", code: EVAL_SNIPPET } });
  assert.ok(["generated", "plan_only", "not_available"].includes(out.status), `unexpected status ${out.status}`);
  assert.ok(Array.isArray(out.tests));
  for (const item of out.tests) {
    assert.ok(String(item.name || "").trim(), "every entry needs a name");
    if (out.status === "generated") assert.ok(String(item.code || "").trim(), "generated entries must carry real code");
    if (out.status === "plan_only") assert.equal(item.code, undefined);
  }
  if (!liveAi) assert.equal(out.status, "plan_only");

  // An unsupported language must still refuse cleanly through the endpoint.
  const css = await request("/test/generate", { method: "POST", token: session.token, body: { language: "css", filename: "a.css", code: "body { color: red; }" } });
  assert.equal(css.status, "not_available");
  assert.deepEqual(css.tests, []);
});
