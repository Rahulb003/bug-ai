import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { proposeOptimization } from "../server/services/engine/ai/aiOptimizer.js";

// Hermetic by default: the optimize endpoint can call Gemini, so the suite must
// not depend on a key, a network, or paid quota. Opt in with BUG_AI_TEST_LIVE_AI=1.
const liveAi = process.env.BUG_AI_TEST_LIVE_AI === "1";

const testDirectory = await mkdtemp(path.join(tmpdir(), "bug-ai-opt-"));
process.env.BUG_AI_DB_PATH = path.join(testDirectory, "db.json");
const { default: app } = await import("../server/app.js");
// Importing the app runs dotenv, so drop the key afterwards, not before.
if (!liveAi) delete process.env.GEMINI_API_KEY;

const NESTED_LOOP = "function f(arr){ let out=[]; for(let i=0;i<arr.length;i++){ for(let j=0;j<arr.length;j++){ if(arr[i]===arr[j] && i!==j) out.push(i); } } return out; }";

test("proposeOptimization returns the source unchanged when no key is configured", async (t) => {
  if (liveAi) return t.skip("live AI enabled");
  const result = await proposeOptimization({ source: NESTED_LOOP, language: "javascript", sourceName: "f.js", mode: "performance", findings: [], strictBehaviorPreservation: true });
  assert.equal(result.status, "not_configured");
  assert.equal(result.optimizedCode, NESTED_LOOP);
  assert.deepEqual(result.changes, []);
});

test("POST /api/optimize never echoes a fabricated diff", async (t) => {
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
  const session = await request("/auth/register", { method: "POST", body: { username: "optuser", email: "opt@example.test", password: "safe-password" } });

  const performance = await request("/optimize", { method: "POST", token: session.token, body: { language: "javascript", filename: "f.js", mode: "performance", code: NESTED_LOOP } });
  assert.equal(performance.status, "completed");
  assert.equal(performance.mode, "performance");
  assert.ok(performance.optimizedVerification, "a verification record must always be present");

  if (liveAi) {
    assert.equal(performance.aiStatus, "completed");
    if (performance.optimizedCode !== NESTED_LOOP) {
      assert.ok(performance.changes.length > 0, "a changed body must explain its changes");
      assert.equal(performance.optimizedVerification.rescan, "completed");
      assert.match(performance.note, /diff/);
    }
  } else {
    assert.equal(performance.aiStatus, "not_configured");
    assert.equal(performance.optimizedCode, NESTED_LOOP, "no key means no transformation may be claimed");
    assert.deepEqual(performance.changes, []);
    assert.match(performance.note, /No safe transformation was produced/);
  }

  // Regression: safe mode must still report the behaviour contract when AI is unavailable.
  const safe = await request("/optimize", { method: "POST", token: session.token, body: { language: "javascript", filename: "f.js", code: NESTED_LOOP } });
  assert.equal(safe.mode, "safe");
  assert.equal(safe.strictBehaviorPreservation, true);

  const relaxed = await request("/optimize", { method: "POST", token: session.token, body: { language: "javascript", filename: "f.js", mode: "safe", strictBehaviorPreservation: false, code: NESTED_LOOP } });
  assert.equal(relaxed.strictBehaviorPreservation, false);
});
