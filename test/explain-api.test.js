import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Hermetic by default; opt in to a live Gemini call with BUG_AI_TEST_LIVE_AI=1.
const liveAi = process.env.BUG_AI_TEST_LIVE_AI === "1";

// BUG_AI_DB_PATH must be set before any server module loads.
const testDirectory = await mkdtemp(path.join(tmpdir(), "bug-ai-explain-"));
process.env.BUG_AI_DB_PATH = path.join(testDirectory, "db.json");
const { explainCode, EXPLAIN_MODES } = await import("../server/services/engine/ai/aiExplainer.js");
const { default: app } = await import("../server/app.js");
if (!liveAi) delete process.env.GEMINI_API_KEY;

const SNIPPET = "function add(a, b) {\n  return a + b;\n}";

test("explainCode reports not_configured instead of inventing an explanation", async (t) => {
  if (liveAi) return t.skip("live AI enabled");
  const result = await explainCode({ source: SNIPPET, language: "javascript", sourceName: "a.js", mode: "beginner" });
  assert.equal(result.status, "not_configured");
  assert.equal(result.mode, "beginner");
  assert.equal(result.explanation, undefined, "no explanation may be produced without a key");
});

test("explainCode refuses empty input before touching the key or the API", async (t) => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "unusable-test-key";
  t.after(() => { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; });
  const result = await explainCode({ source: "   ", language: "javascript", sourceName: "a.js", mode: "technical" });
  assert.equal(result.status, "not_available");
  assert.match(result.reason, /No code was supplied/);
});

test("explainCode falls back to a known mode for an unknown one", async () => {
  const result = await explainCode({ source: SNIPPET, language: "javascript", sourceName: "a.js", mode: "interpretive-dance" });
  assert.equal(result.mode, "technical");
  assert.ok(EXPLAIN_MODES.includes(result.mode));
});

test("POST /api/explain answers with a valid shape and keeps ownership rules", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(testDirectory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (route, options = {}) => {
    const response = await fetch(`${base}${route}`, { headers: { "Content-Type": "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) }, method: options.method || "GET", body: options.body ? JSON.stringify(options.body) : undefined });
    return { status: response.status, payload: await response.json() };
  };
  const request = async (route, options) => { const r = await call(route, options); assert.ok(r.status < 400, r.payload.error || `${route} failed`); return r.payload; };

  const session = await request("/auth/register", { method: "POST", body: { username: "expuser", email: "exp@example.test", password: "safe-password" } });

  const out = await request("/explain", { method: "POST", token: session.token, body: { language: "javascript", filename: "a.js", code: SNIPPET, mode: "beginner" } });
  assert.ok(["completed", "not_configured", "unavailable"].includes(out.status), `unexpected status ${out.status}`);
  assert.equal(out.mode, "beginner");
  if (out.status === "completed") {
    assert.ok(String(out.explanation || "").trim(), "a completed explanation must have text");
    assert.ok(Array.isArray(out.keyPoints));
  } else {
    assert.equal(out.explanation, undefined);
    assert.ok(String(out.reason || "").trim(), "a non-completed result must say why");
  }

  // Unauthenticated access is refused, like every other scan route.
  const anon = await call("/explain", { method: "POST", body: { language: "javascript", code: SNIPPET } });
  assert.equal(anon.status, 401);

  // Empty body is a 400 from transientAnalysis, not a crash.
  const empty = await call("/explain", { method: "POST", token: session.token, body: { language: "javascript", code: "  " } });
  assert.equal(empty.status, 400);

  // Regression: phase 8 only adds UI for notifications; the endpoints are unchanged.
  const notes = await request("/notifications", { token: session.token });
  assert.ok(Array.isArray(notes.notifications), "notifications must still return an array");
  await request("/scan-code", { method: "POST", token: session.token, body: { language: "javascript", filename: "x.js", code: "eval(userInput)" } });
  const after = await request("/notifications", { token: session.token });
  assert.ok(after.notifications.length >= notes.notifications.length, "a scan should not lose notifications");
  if (after.notifications.length) {
    const first = after.notifications[0];
    const read = await request(`/notifications/${first.id}/read`, { method: "POST", token: session.token });
    assert.ok(read.notification, "marking a notification read must still return it");
    assert.equal(read.notification.read, true);
  }

  // Regression: admin.html is now linked in the nav; its route must still behave.
  const adminAttempt = await call("/admin/overview", { token: session.token });
  assert.ok([200, 403, 404].includes(adminAttempt.status), `admin route should respond, got ${adminAttempt.status}`);
});
