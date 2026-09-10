import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
// Hermetic by default; opt in to a live Gemini call with BUG_AI_TEST_LIVE_AI=1.
const liveAi = process.env.BUG_AI_TEST_LIVE_AI === "1";

// BUG_AI_DB_PATH must be set before ANY server module loads: database.js resolves
// its file at import time, so a static import here would write to the real db.json.
const testDirectory = await mkdtemp(path.join(tmpdir(), "bug-ai-assistant-"));
process.env.BUG_AI_DB_PATH = path.join(testDirectory, "db.json");
const { selectRelevantFiles, buildProjectIndex, keywordAssistantReply } = await import("../server/services/workspaceService.js");
const { default: app } = await import("../server/app.js");
// Importing the app runs dotenv, so drop the key afterwards, not before.
if (!liveAi) delete process.env.GEMINI_API_KEY;

const PROJECT_FILES = [
  { name: "src/authService.js", content: "export function login(user, password){ return verify(user, password); }" },
  { name: "src/payment.js", content: "export function charge(amount){ return amount; }" }
];

test("selectRelevantFiles ranks the auth file first for an auth question", () => {
  const project = { files: [
    { name: "src/payment.js", language: "javascript", content: "" },
    { name: "src/authService.js", language: "javascript", content: "" }
  ] };
  const picked = selectRelevantFiles("where is authentication implemented", project);
  assert.ok(picked.length > 0, "expected at least one candidate");
  assert.equal(picked[0].name, "src/authService.js");
  assert.ok(!picked.some((f) => f.name === "src/payment.js"), "unrelated files must not be sent");
});

test("selectRelevantFiles sends nothing rather than guessing when no name matches", () => {
  const project = { files: [{ name: "src/payment.js", language: "javascript", content: "" }] };
  assert.deepEqual(selectRelevantFiles("what is the deployment topology", project), []);
});

test("buildProjectIndex projects stored metadata without file contents", () => {
  const project = {
    name: "P", files: [{ name: "a.js", language: "javascript", content: "secret body" }],
    metadata: { languages: ["javascript"], manifests: [], architecture: { components: [{ file: "a.js", layer: "module", language: "javascript" }] } },
    lastAnalysis: { summary: { totalFindings: 2 } }
  };
  const index = buildProjectIndex(project);
  assert.deepEqual(index.fileList, [{ name: "a.js", language: "javascript" }]);
  assert.equal(index.lastAnalysisSummary.totalFindings, 2);
  assert.ok(!JSON.stringify(index).includes("secret body"), "the index must not carry file contents");
});

test("the keyword fallback never prints a null quality score", () => {
  const scan = { riskScore: 40, riskLevel: "Medium", codeQualityScore: null, bugs: [{ title: "T", severity: "HIGH", category: "security", whyItHappens: "w", fix: "f" }], suggestedFixes: [] };
  const reply = keywordAssistantReply(scan, "how can I improve quality?");
  assert.ok(!/null/.test(reply), `quality reply must not contain "null": ${reply}`);
  assert.match(reply, /not computed/);
  // A real score is still reported when one exists.
  assert.match(keywordAssistantReply({ ...scan, codeQualityScore: 82 }, "improve quality"), /82/);
});

test("assistant endpoint answers, tags its source, and enforces project ownership", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(testDirectory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (route, options = {}) => {
    const response = await fetch(`${base}${route}`, { headers: { "Content-Type": "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) }, method: options.method || "GET", body: options.body ? JSON.stringify(options.body) : undefined });
    return { status: response.status, payload: await response.json() };
  };
  const request = async (route, options) => { const r = await call(route, options); assert.ok(r.status < 400, r.payload.error || `${route} failed`); return r.payload; };

  const owner = await request("/auth/register", { method: "POST", body: { username: "asstowner", email: "asst@example.test", password: "safe-password" } });
  const other = await request("/auth/register", { method: "POST", body: { username: "asstother", email: "asst2@example.test", password: "safe-password" } });
  const created = await request("/projects", { method: "POST", token: owner.token, body: { name: "Auth Project", files: PROJECT_FILES } });
  const projectId = created.project.id;

  const answer = await request("/assistant/chat", { method: "POST", token: owner.token, body: { message: "where is authentication implemented?", projectId } });
  assert.ok(String(answer.reply || "").trim(), "a reply is always required");
  assert.ok(["ai", "rule-based"].includes(answer.source), `unexpected source ${answer.source}`);
  assert.ok(Array.isArray(answer.suggestions) && answer.suggestions.length, "suggestions shape preserved");
  assert.ok(Array.isArray(answer.referencedFiles));
  const known = new Set(PROJECT_FILES.map((f) => f.name));
  for (const name of answer.referencedFiles) assert.ok(known.has(name), `referenced a file that is not in the project: ${name}`);
  if (liveAi) {
    assert.equal(answer.source, "ai");
    assert.ok(answer.referencedFiles.includes("src/authService.js"), "a live answer should cite the auth file");
  } else {
    assert.equal(answer.source, "rule-based", "no key must fall back, not fail");
  }

  // Regression: the pre-AI keyword shape still answers without a project.
  const noProject = await request("/assistant/chat", { method: "POST", token: owner.token, body: { message: "why is the risk score high?" } });
  assert.equal(noProject.source, "rule-based");
  assert.ok(String(noProject.reply).trim());

  // Security: another user's project id must not be readable through the assistant.
  const stolen = await call("/assistant/chat", { method: "POST", token: other.token, body: { message: "where is authentication implemented?", projectId } });
  assert.equal(stolen.status, 404, "another user's project must not be accessible");
  assert.ok(!JSON.stringify(stolen.payload).includes("authService"), "no project detail may leak in the error");

  const empty = await call("/assistant/chat", { method: "POST", token: owner.token, body: { message: "   " } });
  assert.equal(empty.status, 400);
});
