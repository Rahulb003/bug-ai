import { detectLanguage } from "./languageDetector.js";
import { mergeFindings, summarizeFindings } from "./findingEngine.js";
import { syntaxAnalyzer } from "./analyzers/syntaxAnalyzer.js";
import { runtimeAnalyzer } from "./analyzers/runtimeAnalyzer.js";
import { securityAnalyzer } from "./analyzers/securityAnalyzer.js";
import { performanceAnalyzer } from "./analyzers/performanceAnalyzer.js";
import { qualityAnalyzer } from "./analyzers/qualityAnalyzer.js";
import { jsAstAnalyzer } from "./analyzers/ast/jsAstAnalyzer.js";
import { verifyStatic } from "./verification/verificationEngine.js";
import { analyzeWithAi } from "./ai/aiAnalyzer.js";
import { analyseProject } from "./projectAnalyzer.js";
import { generateTests } from "./testGenerator.js";

function legacyBug(item) {
  return { id: item.id, line: item.line, severity: item.severity.toLowerCase(), category: item.category, title: item.title, explanation: item.description, whyItHappens: item.evidence.join(" "), fix: item.recommendation, snippet: item.originalCode, confidence: item.confidence, source: item.source };
}
function calculateRisk(summary) {
  // Risk is exposure prioritisation, not an accuracy or evaluation metric.
  return Math.min(100, summary.critical * 25 + summary.high * 15 + summary.medium * 7 + summary.low * 2);
}
function runDeterministic(input) {
  const base = [syntaxAnalyzer, performanceAnalyzer, qualityAnalyzer].flatMap((analyzer) => analyzer(input));
  // JS/TS get real AST analysis; every other language stays on the regex rules.
  if (input.language === "javascript" || input.language === "typescript") return [...base, ...jsAstAnalyzer(input)];
  return [...base, ...runtimeAnalyzer(input), ...securityAnalyzer(input)];
}

export async function analyzeWithEngine({ source, language = "auto", sourceName = "Live snippet", includeAi = true }) {
  const resolvedLanguage = detectLanguage({ language, sourceName, source });
  const input = { source: String(source || ""), language: resolvedLanguage, file: sourceName };
  const deterministic = runDeterministic(input);
  let ai = { findings: [], status: "not_requested" };
  if (includeAi) {
    try { ai = await analyzeWithAi({ source: input.source, language: resolvedLanguage, sourceName, deterministicFindings: deterministic }); }
    catch (error) { ai = { findings: [], status: "unavailable", reason: "AI analysis failed safely; deterministic findings remain available." }; }
  }
  // The AI is asked to report only what deterministic rules did not already
  // prove, but it restates them anyway ("SQL Injection" beside "Potential SQL
  // injection"). An AI finding on a line that already carries a deterministic
  // finding adds no evidence and inflates the count, so it is dropped.
  const provenLines = new Set(deterministic.map((item) => `${item.file}:${item.line}`));
  const additionalAi = ai.findings.filter((item) => !provenLines.has(`${item.file}:${item.line}`));
  const findings = mergeFindings([...deterministic, ...additionalAi]);
  const summary = summarizeFindings(findings);
  const verification = verifyStatic(input);
  const riskScore = calculateRisk(summary);
  return {
    status: "completed", language: resolvedLanguage, summary, findings, bugs: findings.map(legacyBug),
    riskScore, riskLevel: summary.critical ? "Critical" : summary.high ? "High" : summary.medium ? "Medium" : "Low",
    confidence: findings.length ? Math.round(findings.reduce((total, item) => total + item.confidence, 0) / findings.length * 100) : 100,
    codeQualityScore: null, evaluation: { status: "not_configured", message: "Evaluation benchmark not configured." },
    severityBreakdown: summary, vulnerableLines: findings.filter((item) => item.severity !== "INFO").map((item) => item.line),
    suggestedFixes: [...new Set(findings.map((item) => item.recommendation))], fixedCode: input.source,
    metrics: { totalLines: input.source.split(/\r?\n/).length, bugCount: findings.length, language: resolvedLanguage },
    ai: { status: ai.status, reason: ai.reason || null }, verification,
    generatedTests: generateTests({ language: resolvedLanguage, sourceName, findings })
  };
}

export async function analyzeProjectWithEngine({ files, sourceName, includeAi = true }) {
  const project = analyseProject(files);
  const perFile = await Promise.all(project.analyzableFiles.map((file) => analyzeWithEngine({ source: file.content, language: file.language, sourceName: file.name, includeAi })));
  const findings = mergeFindings(perFile.flatMap((result) => result.findings));
  const summary = summarizeFindings(findings);
  const riskScore = calculateRisk(summary);
  const verification = { status: perFile.some((result) => result.verification.status === "FAILED") ? "FAILED" : "PARTIALLY_VERIFIED", files: perFile.map((result) => ({ file: result.findings[0]?.file || sourceName, status: result.verification.status })), note: "Project files are analyzed independently; no user code is executed." };
  return {
    status: "completed", language: project.languages.length === 1 ? project.languages[0] : "multi-language", project: { languages: project.languages, manifests: project.manifests, tests: project.tests, fileCount: project.files.length }, summary, findings, bugs: findings.map(legacyBug), riskScore, riskLevel: summary.critical ? "Critical" : summary.high ? "High" : summary.medium ? "Medium" : "Low", confidence: findings.length ? Math.round(findings.reduce((total, item) => total + item.confidence, 0) / findings.length * 100) : 100, codeQualityScore: null, evaluation: { status: "not_configured", message: "Evaluation benchmark not configured." }, severityBreakdown: summary, vulnerableLines: findings.map((item) => item.line), suggestedFixes: [...new Set(findings.map((item) => item.recommendation))], fixedCode: null, metrics: { totalLines: project.analyzableFiles.reduce((total, file) => total + file.content.split(/\r?\n/).length, 0), bugCount: findings.length, language: "multi-language" }, ai: { status: includeAi ? "per-file" : "not_requested" }, verification, generatedTests: { status: "not_available", reason: "Generate tests per source file to preserve project ownership.", tests: [] }
  };
}
