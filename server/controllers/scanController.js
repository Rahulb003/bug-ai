import {
  analyzeCodeSnippet,
  analyzeGithubRepository,
  analyzeProjectBundle
} from "../services/scanService.js";
import { analyzeWithEngine } from "../services/engine/analysisPipeline.js";
import { proposeFixes } from "../services/engine/ai/aiFixer.js";
import { proposeOptimization } from "../services/engine/ai/aiOptimizer.js";
import { verifyStatic } from "../services/engine/verification/verificationEngine.js";
import { generateTestCode } from "../services/engine/ai/aiTestGenerator.js";
import { getLanguage } from "../services/engine/languageRegistry.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createAppError } from "../utils/errors.js";
import { findScanById } from "../models/scanModel.js";
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

export const verifyController = asyncHandler(async (req, res) => {
  const result = await transientAnalysis(req.body, { includeAi: false });
  res.json({ status: result.verification.status, verification: result.verification, findings: result.findings });
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
