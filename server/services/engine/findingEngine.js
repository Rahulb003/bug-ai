import { confidenceFor } from "./confidenceEngine.js";

export function finding(input) {
  const source = input.source || "deterministic";
  const evidence = Array.isArray(input.evidence) ? input.evidence : [input.evidence].filter(Boolean);
  const confidence = input.confidence || confidenceFor(source, evidence);
  return {
    id: input.id || `${source}-${input.file || "snippet"}-${input.line || 1}-${input.rule || input.title}`.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    file: input.file || "Live snippet", line: input.line || 1, column: input.column || 1,
    endLine: input.endLine || input.line || 1, endColumn: input.endColumn || null,
    language: input.language || "unknown", category: input.category || "quality", subcategory: input.subcategory || null,
    severity: String(input.severity || "info").toUpperCase(), confidence: confidence.score, confidenceLevel: confidence.level,
    confidenceReason: confidence.reason, title: input.title, description: input.description || input.title,
    evidence, rule: input.rule || "BUGAI-GENERAL", source, impact: input.impact || "Review the affected code.",
    recommendation: input.recommendation || "Review and correct the affected code.", originalCode: input.originalCode || "",
    suggestedFix: input.suggestedFix || null, references: input.references || [], fixable: Boolean(input.suggestedFix), verified: false
  };
}

export function mergeFindings(findings) {
  const unique = new Map();
  for (const item of findings) {
    const key = `${item.file}:${item.line}:${item.rule}:${item.title}`;
    if (!unique.has(key) || unique.get(key).confidence < item.confidence) unique.set(key, item);
  }
  return [...unique.values()];
}

export function summarizeFindings(findings) {
  const summary = { totalFindings: findings.length, critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  findings.forEach((item) => { summary[item.severity.toLowerCase()] += 1; });
  return summary;
}
