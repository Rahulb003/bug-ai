import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// BUG_AI_DB_PATH must be set before any server module loads.
const testDirectory = await mkdtemp(path.join(tmpdir(), "bug-ai-stage-d-"));
process.env.BUG_AI_DB_PATH = path.join(testDirectory, "db.json");
process.env.EXECUTION_SANDBOX_ENABLED = process.env.EXECUTION_SANDBOX_ENABLED || "false";
process.env.GEMINI_API_KEY = "abc123-test-key-xy";
const { default: app } = await import("../server/app.js");
const { buildTechnicalDebt } = await import("../server/services/engine/debtAnalyzer.js");
const { translateCode } = await import("../server/services/engine/ai/aiTranslator.js");
const { generateDocs, DOC_KINDS } = await import("../server/services/engine/ai/aiDocs.js");
const { EXPLAIN_MODES } = await import("../server/services/engine/ai/aiExplainer.js");
// Hermetic from here on: no request may reach the AI provider.
delete process.env.GEMINI_API_KEY;

async function withServer(run) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (route, options = {}) => {
    const response = await fetch(`${base}${route}`, { headers: { "Content-Type": "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) }, method: options.method || "GET", body: options.body ? JSON.stringify(options.body) : undefined });
    return { status: response.status, payload: await response.json().catch(() => ({})) };
  };
  const unique = Math.random().toString(36).slice(2, 8);
  const session = (await call("/auth/register", { method: "POST", body: { username: "staged" + unique, email: `staged-${unique}@example.test`, password: "safe-password" } })).payload;
  try { await run(call, session.token); } finally { server.close(); }
}

test("capabilities endpoint reports configuration honestly and never leaks the key", async () => {
  await withServer(async (call, token) => {
    assert.equal((await call("/system/capabilities")).status, 401);
    const { status, payload } = await call("/system/capabilities", { token });
    assert.equal(status, 200);
    assert.equal(payload.ai.configured, false, "key was deleted before the request");
    assert.equal(payload.ai.keyHint, null);
    assert.deepEqual(payload.ai.explainModes, EXPLAIN_MODES);
    assert.equal(EXPLAIN_MODES.length, 6);
    assert.equal(payload.sandbox.enabled, process.env.EXECUTION_SANDBOX_ENABLED === "true", "mirrors the environment, never a hard-coded claim");
    assert.equal(typeof payload.jwtSecretConfigured, "boolean");
    assert.ok(!JSON.stringify(payload).includes("abc123-test-key"), "the key value must never appear in the response");
  });
});

test("technical debt is derived from stored analyses; trend only when a previous run exists", async () => {
  const project = (rules, previous) => ({
    id: "p1", name: "P",
    lastAnalysis: { createdAt: "2026-09-13T00:00:00Z", findings: rules.map(([rule, file, line]) => ({ rule, title: rule, category: "security", severity: "HIGH", file, line, source: "deterministic" })) },
    previousAnalysis: previous ? { createdAt: "2026-09-12T00:00:00Z", findings: previous.map(([rule, file, line]) => ({ rule, title: rule, severity: "HIGH", file, line })) } : undefined
  });
  const single = buildTechnicalDebt(project([["SEC-1", "a.js", 1], ["SEC-1", "b.js", 2]]));
  assert.equal(single.items.length, 1);
  assert.equal(single.items[0].occurrences, 2);
  assert.equal(single.trend.status, "not_available");
  assert.match(single.note, /No time or cost estimates/);
  const withPrev = buildTechnicalDebt(project([["SEC-1", "a.js", 1]], [["SEC-1", "a.js", 1], ["SEC-1", "b.js", 2], ["OLD", "c.js", 3]]));
  assert.equal(withPrev.trend.status, "measured");
  assert.equal(withPrev.items[0].trend.delta, -1);
  assert.deepEqual(withPrev.resolved.map((r) => r.id), ["OLD"]);
  assert.equal(buildTechnicalDebt({ id: "x", name: "empty" }).status, "not_available");
});

test("GET /projects/:id/debt is owner-only and keeps the previous analysis for a trend", async () => {
  await withServer(async (call, token) => {
    const created = (await call("/projects", { method: "POST", token, body: { name: "debt", files: [{ name: "a.js", content: "eval(x)\nvar y = 1\n" }] } })).payload;
    const id = created.project.id;
    assert.equal((await call(`/projects/${id}/debt`, { token })).payload.debt.status, "not_available", "no analysis yet");
    assert.equal((await call(`/projects/${id}/analyze`, { method: "POST", token })).status, 200);
    const first = (await call(`/projects/${id}/debt`, { token })).payload.debt;
    assert.equal(first.status, "derived");
    assert.ok(first.items.length >= 1);
    assert.equal(first.trend.status, "not_available");
    assert.equal((await call(`/projects/${id}/analyze`, { method: "POST", token })).status, 200);
    const second = (await call(`/projects/${id}/debt`, { token })).payload.debt;
    assert.equal(second.trend.status, "measured");
    assert.equal(second.items[0].trend.delta, 0);
    assert.equal((await call(`/projects/${id}/debt`)).status, 401);
  });
});

test("translation refuses unsupported targets and reports not_configured without a key", async () => {
  assert.equal((await translateCode({ source: "x", from: "javascript", to: "cobol" })).status, "not_available");
  assert.equal((await translateCode({ source: "  ", from: "javascript", to: "python" })).status, "not_available");
  const nc = await translateCode({ source: "const a = 1;", from: "javascript", to: "python" });
  assert.equal(nc.status, "not_configured");
  assert.equal(nc.translatedCode, undefined, "no fabricated translation");
  await withServer(async (call, token) => {
    assert.equal((await call("/translate", { method: "POST", body: { code: "x", to: "python" } })).status, 401);
    assert.equal((await call("/translate", { method: "POST", token, body: { code: "", to: "python" } })).status, 400);
    const r = await call("/translate", { method: "POST", token, body: { code: "const a = 1 < 2;", filename: "a.js", to: "python" } });
    assert.equal(r.status, 200);
    assert.equal(r.payload.status, "not_configured");
  });
});

test("documentation generator is bounded, honest and owner-scoped", async () => {
  assert.deepEqual(DOC_KINDS, ["readme", "api", "functions", "architecture"]);
  assert.equal((await generateDocs({ kind: "readme", projectName: "x", files: [] })).status, "not_available");
  const nc = await generateDocs({ kind: "bogus", projectName: "x", files: [{ name: "a.js", content: "1" }] });
  assert.equal(nc.status, "not_configured");
  assert.equal(nc.kind, "readme", "unknown kinds fall back rather than erroring");
  await withServer(async (call, token) => {
    assert.equal((await call("/docs", { method: "POST", body: { kind: "readme" } })).status, 401);
    assert.equal((await call("/docs", { method: "POST", token, body: { projectId: "missing" } })).status, 404);
    const r = await call("/docs", { method: "POST", token, body: { kind: "api", files: [{ name: "a.js", content: "export const f = () => 1;" }] } });
    assert.equal(r.status, 200);
    assert.equal(r.payload.status, "not_configured");
    assert.equal(r.payload.markdown, undefined);
  });
});
