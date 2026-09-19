import {
  analyzeCodeSnippet,
  analyzeGithubRepository,
  analyzeProjectBundle
} from "../services/scanService.js";
import { analyzeWithEngine } from "../services/engine/analysisPipeline.js";
import { proposeFixes } from "../services/engine/ai/aiFixer.js";
import { proposeOptimization } from "../services/engine/ai/aiOptimizer.js";
import { verifyStatic } from "../services/engine/verification/verificationEngine.js";
import { runInSandbox } from "../services/engine/verification/sandboxExecutor.js";
import { explainCode } from "../services/engine/ai/aiExplainer.js";
import { runGeneratedTests, runnerCapability, discoverProjectTests } from "../services/engine/verification/testRunner.js";
import { sandboxEnabled } from "../services/engine/verification/sandboxExecutor.js";
import { EXPLAIN_MODES } from "../services/engine/ai/aiExplainer.js";
import { translateCode } from "../services/engine/ai/aiTranslator.js";
import { generateDocs, DOC_KINDS } from "../services/engine/ai/aiDocs.js";
import { buildProjectIndex } from "../services/workspaceService.js";
import { requireProject } from "../services/projectService.js";
import { fixAndVerifyAll } from "../services/engine/repairPipeline.js";
import { generateTestCode } from "../services/engine/ai/aiTestGenerator.js";
import { getLanguage } from "../services/engine/languageRegistry.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createAppError } from "../utils/errors.js";
import { findScanById, saveScan } from "../models/scanModel.js";
import { assertScanAccess } from "../services/accessService.js";

function mapLegacyResult(result) {
  return {
    risk_score: result.riskScore,
    risk_level: result.riskLevel,
    errors: result.bugs.map((bug) => ({
      line: bug.line,
      message: bug.title,
      type: bug.category
    })),
    suggestions: result.suggestedFixes,
    total_lines: result.metrics.totalLines,
    error_count: result.bugs.length,
    evaluation: result.evaluation
  };
}

export const scanCodeController = asyncHandler(async (req, res) => {
  const result = await analyzeCodeSnippet({
    userId: req.user.id,
    payload: req.body
  });
  res.status(201).json(result);
});

export const uploadProjectController = asyncHandler(async (req, res) => {
  const result = await analyzeProjectBundle({
    userId: req.user.id,
    payload: req.body
  });
  res.status(201).json(result);
});

export const scanGithubController = asyncHandler(async (req, res) => {
  const result = await analyzeGithubRepository({
    userId: req.user.id,
    payload: req.body
  });
  res.status(201).json(result);
});

async function transientAnalysis(payload, overrides = {}) {
  const code = String(payload.code || payload.source || "");
  if (!code.trim()) throw createAppError(400, "Code input is required.");
  if (code.length > 200000) throw createAppError(413, "Code input exceeds the 200,000-character analysis limit.");
  return analyzeWithEngine({ source: code, language: payload.language || "auto", sourceName: payload.filename || "Live snippet", ...overrides });
}

export const analyzeController = asyncHandler(async (req, res) => {
  res.json(await transientAnalysis(req.body));
});

export const optimizeController = asyncHandler(async (req, res) => {
  const mode = ["safe", "performance", "readability", "maintainability", "security", "full"].includes(req.body.mode) ? req.body.mode : "safe";
  const strictBehaviorPreservation = req.body.strictBehaviorPreservation !== false;
  const originalCode = String(req.body.code || req.body.source || "");
  const result = await transientAnalysis(req.body, { includeAi: false });

  const aiResult = await proposeOptimization({
    source: originalCode,
    language: result.language,
    sourceName: req.body.filename || "Live snippet",
    mode,
    findings: result.findings,
    strictBehaviorPreservation
  });

  const codeChanged = aiResult.optimizedCode !== originalCode;
  const optimizedVerification = codeChanged ? verifyStatic({ source: aiResult.optimizedCode, language: result.language }) : result.verification;

  res.json({
    status: "completed",
    mode,
    strictBehaviorPreservation,
    optimizedCode: aiResult.optimizedCode,
    changes: aiResult.changes.map((item) => ({ category: item.category, explanation: item.explanation, source: "ai" })),
    aiStatus: aiResult.status,
    verification: result.verification,
    optimizedVerification,
    note: codeChanged
      ? "AI-proposed optimization shown as a diff. No patch is applied automatically — review before adopting."
      : "No safe transformation was produced for this mode. This is a review, not a claimed optimization."
  });
});

export const generateTestsController = asyncHandler(async (req, res) => {
  const result = await transientAnalysis(req.body, { includeAi: false });
  const languageInfo = getLanguage(result.language);
  const generated = await generateTestCode({
    source: req.body.code || req.body.source,
    language: result.language,
    sourceName: req.body.filename || "Live snippet",
    findings: result.findings,
    testRunner: languageInfo?.testRunner
  });
  res.json(generated);
});

// Executes generated test code in the sandbox and reports the runner's real
// output. A pass is only ever reported for a suite that actually ran.
export const runTestsController = asyncHandler(async (req, res) => {
  let language = String(req.body.language || "").toLowerCase();
  if (!language || language === "auto") {
    const probe = req.body.code || (req.body.tests || [])[0]?.code || "// no source";
    language = (await transientAnalysis({ code: probe, language: "auto", filename: req.body.filename }, { includeAi: false })).language;
  }
  res.json(await runGeneratedTests({ tests: req.body.tests || [], language }));
});

// Lets the UI state up front whether execution is possible, instead of
// offering a Run button that cannot work.
export const testCapabilityController = asyncHandler(async (req, res) => {
  res.json(runnerCapability(String(req.query.language || "javascript").toLowerCase()));
});

export const projectTestsController = asyncHandler(async (req, res) => {
  const project = await requireProject(req.user, req.params.projectId);
  res.json(discoverProjectTests(project));
});

// Fix & Verify All: the full pipeline for one file. Returns a candidate and a
// report; nothing is saved.
export const repairController = asyncHandler(async (req, res) => {
  const code = String(req.body.code || req.body.source || "");
  if (!code.trim()) throw createAppError(400, "Code input is required.");
  if (code.length > 200000) throw createAppError(413, "Code input exceeds the 200,000-character analysis limit.");
  res.json(await fixAndVerifyAll({ source: code, language: req.body.language || "auto", sourceName: req.body.filename || "Live snippet", applyAiFixes: req.body.applyAiFixes === true }));
});

// Reports configuration state for the Settings page. Secrets are never sent:
// only whether a key exists, and the non-secret model id.
export const capabilitiesController = asyncHandler(async (req, res) => {
  const key = String(process.env.GEMINI_API_KEY || "");
  res.json({
    ai: { configured: Boolean(key), model: process.env.GEMINI_MODEL || "gemini-3.6-flash", keyHint: key ? `${key.slice(0, 3)}…${key.slice(-2)} (${key.length} chars)` : null, explainModes: EXPLAIN_MODES },
    sandbox: { enabled: sandboxEnabled(), isolation: "node-permission-model", network: "not restricted", timeoutMs: Number(process.env.EXECUTION_SANDBOX_TIMEOUT_MS) || 5000 },
    testRunners: { javascript: runnerCapability("javascript"), python: runnerCapability("python") },
    rateLimit: { perMinute: 120, scope: "per IP, /api only" },
    jwtSecretConfigured: Boolean(process.env.JWT_SECRET),
    node: process.version
  });
});

export const translateController = asyncHandler(async (req, res) => {
  const code = String(req.body.code || req.body.source || "");
  if (!code.trim()) throw createAppError(400, "Code input is required.");
  if (code.length > 200000) throw createAppError(413, "Code input exceeds the 200,000-character analysis limit.");
  const from = req.body.from && req.body.from !== "auto" ? req.body.from : (await transientAnalysis({ code, language: "auto", filename: req.body.filename }, { includeAi: false })).language;
  res.json(await translateCode({ source: code, from, to: req.body.to, sourceName: req.body.filename || "Live snippet" }));
});

// Docs for a stored project (owner-only) or for a pasted file list.
export const docsController = asyncHandler(async (req, res) => {
  const kind = DOC_KINDS.includes(req.body.kind) ? req.body.kind : "readme";
  if (req.body.projectId) {
    const project = await requireProject(req.user, req.body.projectId);
    // Prefer manifests and entry-point-looking files so the model sees what matters most.
    const rank = (f) => (/package\.json|requirements|pyproject|readme/i.test(f.name) ? 0 : /(index|main|app|server)\./i.test(f.name) ? 1 : /(route|controller|api)/i.test(f.name) ? 2 : 3);
    const files = project.files.slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    return res.json(await generateDocs({ kind, projectName: project.name, files, index: buildProjectIndex(project) }));
  }
  const files = Array.isArray(req.body.files) ? req.body.files.filter((f) => f && f.name && typeof f.content === "string") : [];
  res.json(await generateDocs({ kind, projectName: req.body.name || "Snippet", files, index: null }));
});

export const verifyController = asyncHandler(async (req, res) => {
  const result = await transientAnalysis(req.body, { includeAi: false });
  // Sandboxed execution is scoped to this single-snippet path only: never the
  // project or GitHub paths, which accept code from public repositories.
  const executionVerification = await runInSandbox({ code: req.body.code || req.body.source, language: result.language });
  res.json({ status: result.verification.status, verification: result.verification, executionVerification, findings: result.findings });
});

export const explainController = asyncHandler(async (req, res) => {
  const result = await transientAnalysis(req.body, { includeAi: false });
  const explanation = await explainCode({
    source: req.body.code || req.body.source,
    language: result.language,
    sourceName: req.body.filename || "Live snippet",
    selection: req.body.selection,
    mode: req.body.mode
  });
  res.json(explanation);
});

export const fixController = asyncHandler(async (req, res) => {
  const result = await transientAnalysis(req.body, { includeAi: false });

  const mechanical = result.findings.filter((item) => item.fixable).map((item) => ({ findingId: item.id, originalCode: item.originalCode, suggestedFix: item.suggestedFix, verification: "NOT_RUN", source: "deterministic" }));

  const aiResult = await proposeFixes({
    source: req.body.code || req.body.source,
    language: result.language,
    sourceName: req.body.filename || "Live snippet",
    findings: result.findings.filter((item) => !item.fixable)
  });

  const aiFixes = aiResult.fixes.map((item) => ({ findingId: item.findingId, suggestedFix: item.proposedFix, explanation: item.explanation, verification: "NOT_RUN", source: "ai" }));

  res.json({ status: "completed", fixes: [...mechanical, ...aiFixes], aiStatus: aiResult.status, verification: result.verification, note: "Fixes are proposals only. No patch is applied to submitted or stored code automatically." });
});

export const getScanController = asyncHandler(async (req, res) => {
  const scan = await findScanById(req.params.scanId);
  await assertScanAccess(req.user, scan, "Scan could not be found.");
  res.json({ scan });
});

// Triage state (open / ignored / reviewed) lives on the stored scan so every
// page sees the same decision. It never changes the finding's evidence.
export const setFindingStatusController = asyncHandler(async (req, res) => {
  const scan = await findScanById(req.params.scanId);
  await assertScanAccess(req.user, scan, "Scan could not be found.");
  const status = String(req.body.status || "").toLowerCase();
  // fixed/verified are set by the Fix & Verify pipeline from its rescan comparison; reopen returns a finding to open.
  if (!["open", "ignored", "reviewed", "fixed", "verified"].includes(status)) throw createAppError(400, "Status must be open, ignored, reviewed, fixed or verified.");
  const finding = (scan.findings || []).find((item) => item.id === req.params.findingId);
  if (!finding) throw createAppError(404, "Finding could not be found in this scan.");
  finding.triage = { status, by: req.user.username, at: new Date().toISOString() };
  const legacy = (scan.bugs || []).find((item) => item.id === req.params.findingId);
  if (legacy) legacy.triage = finding.triage;
  await saveScan(scan);
  res.json({ findingId: finding.id, triage: finding.triage });
});

export const getScanFindingsController = asyncHandler(async (req, res) => {
  const scan = await findScanById(req.params.scanId);
  await assertScanAccess(req.user, scan, "Scan could not be found.");
  res.json({ findings: scan.findings || scan.bugs || [] });
});

export const getScanVerificationController = asyncHandler(async (req, res) => {
  const scan = await findScanById(req.params.scanId);
  await assertScanAccess(req.user, scan, "Scan could not be found.");
  res.json({ verification: scan.verification || { status: "NOT_RUN", reason: "This legacy scan has no verification record." } });
});

export const legacyPredictController = asyncHandler(async (req, res) => {
  const result = await analyzeCodeSnippet({
    userId: "guest",
    payload: req.body
  });
  res.json(mapLegacyResult(result));
});

export const legacyFixController = asyncHandler(async (req, res) => {
  const result = await analyzeCodeSnippet({
    userId: "guest",
    payload: req.body
  });
  res.json({
    errors: result.bugs.map((bug) => ({
      line: bug.line,
      message: bug.title,
      type: bug.category
    })),
    suggestions: result.suggestedFixes,
    fixed: result.fixedCode,
    total_lines: result.metrics.totalLines,
    error_count: result.bugs.length,
    evaluation: result.evaluation
  });
});
