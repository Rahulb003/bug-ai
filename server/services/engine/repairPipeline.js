import { analyzeWithEngine } from "./analysisPipeline.js";
import { proposeFixes } from "./ai/aiFixer.js";
import { generateTestCode } from "./ai/aiTestGenerator.js";
import { verifyStatic } from "./verification/verificationEngine.js";
import { runGeneratedTests, runnerCapability } from "./verification/testRunner.js";
import { getLanguage } from "./languageRegistry.js";

// Fix & Verify All for one file.
//
//   analyze -> prioritise -> propose fixes -> apply the accepted set -> parse +
//   rescan -> compare before/after -> regression check -> (limited repair) ->
//   generate + run tests where possible -> report.
//
// Every number in the report is derived from a real scan or a real run. A fix
// is only counted as "fixed" when the finding it targeted is absent from the
// rescan of the candidate; nothing is marked fixed because a patch was applied.

const SEV = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };
const MAX_REPAIR_ROUNDS = 2;

// Line numbers move after edits, so findings are compared by rule + title.
const key = (f) => `${f.rule}::${f.title}`;
function multiset(findings) {
  const m = new Map();
  for (const f of findings) m.set(key(f), (m.get(key(f)) || 0) + 1);
  return m;
}
function diffFindings(before, after) {
  const b = multiset(before), a = multiset(after);
  const resolved = [], remaining = [], introduced = [];
  for (const f of before) {
    const k = key(f);
    if ((a.get(k) || 0) > 0) { a.set(k, a.get(k) - 1); remaining.push(f); } else resolved.push(f);
  }
  const bb = multiset(before);
  for (const f of after) {
    const k = key(f);
    if ((bb.get(k) || 0) > 0) bb.set(k, bb.get(k) - 1); else introduced.push(f);
  }
  return { resolved, remaining, introduced };
}

const candidateChanged = (a, b) => a !== b;

function applyLineFixes(source, fixes) {
  const lines = source.split("\n");
  const applied = [];
  // Apply bottom-up so earlier line numbers stay valid when a fix spans lines.
  for (const fix of fixes.slice().sort((x, y) => y.line - x.line)) {
    const index = fix.line - 1;
    if (index < 0 || index >= lines.length) continue;
    const before = lines[index];
    lines.splice(index, 1, ...String(fix.suggestedFix).split("\n"));
    applied.push({ ...fix, before, after: fix.suggestedFix });
  }
  return { code: lines.join("\n"), applied };
}

// `propose` is injectable so tests can drive the regression-rejection path with
// a deliberately bad proposal instead of depending on a live model.
export { diffFindings, applyLineFixes };

export async function fixAndVerifyAll({ source, language = "auto", sourceName = "Live snippet", applyAiFixes = false, propose = proposeFixes }) {
  const original = String(source || "");
  const steps = [];
  const step = (name, status, detail) => steps.push({ name, status, detail, at: new Date().toISOString() });

  // 1. Analyze
  const baseline = await analyzeWithEngine({ source: original, language, sourceName, includeAi: false });
  const resolvedLanguage = baseline.language;
  const before = baseline.findings;
  step("analyze", "completed", `${before.length} finding(s) in ${resolvedLanguage}`);

  // 2. Prioritise
  const prioritised = before.slice().sort((x, y) => (SEV[String(y.severity).toUpperCase()] || 0) - (SEV[String(x.severity).toUpperCase()] || 0));
  step("prioritise", "completed", prioritised.slice(0, 3).map((f) => `${f.severity} ${f.title}`).join("; ") || "nothing to prioritise");

  if (!before.length) {
    return {
      status: "completed", language: resolvedLanguage, code: original, changed: false, steps,
      summary: { detected: 0, fixed: 0, remaining: 0, requiresReview: 0, introduced: 0 },
      modifications: [], requiresReview: [], remaining: [], introduced: [],
      tests: { status: "not_run", reason: "No findings, so no regression tests were generated." },
      verification: baseline.verification,
      verdict: "NOTHING_TO_FIX"
    };
  }

  // 3. Propose fixes: mechanical ones from the rules, AI ones from the fixer.
  const byId = new Map(before.map((f) => [f.id, f]));
  const mechanical = before.filter((f) => f.fixable && String(f.suggestedFix || "").trim())
    .map((f) => ({ findingId: f.id, line: f.line, title: f.title, severity: f.severity, suggestedFix: f.suggestedFix, source: "deterministic", explanation: f.recommendation }));
  const aiResult = await propose({ source: original, language: resolvedLanguage, sourceName, findings: before.filter((f) => !f.fixable) });
  const aiFixes = aiResult.fixes.map((p) => { const f = byId.get(p.findingId); return f ? { findingId: f.id, line: f.line, title: f.title, severity: f.severity, suggestedFix: p.proposedFix, source: "ai", explanation: p.explanation } : null; }).filter(Boolean);
  step("propose", "completed", `${mechanical.length} deterministic, ${aiFixes.length} AI (aiStatus ${aiResult.status})`);

  // AI proposals are unverified: applied only when the caller opted in.
  const toApply = applyAiFixes ? [...mechanical, ...aiFixes] : mechanical;
  const requiresReview = applyAiFixes ? [] : aiFixes;

  // 4-7. Apply, rescan, compare, regression-check — with a bounded repair loop
  // that backs off to deterministic-only fixes if the candidate got worse.
  let candidate = original, applied = [], after = before, comparison = { resolved: [], remaining: before, introduced: [] }, verification = baseline.verification;
  let round = 0, accepted = false, attempts = [];
  let attemptSet = toApply;
  while (round < MAX_REPAIR_ROUNDS && attemptSet.length) {
    round += 1;
    const result = applyLineFixes(original, attemptSet);
    const rescan = await analyzeWithEngine({ source: result.code, language: resolvedLanguage, sourceName, includeAi: false });
    const cmp = diffFindings(before, rescan.findings);
    const staticCheck = verifyStatic({ source: result.code, language: resolvedLanguage });
    const syntaxBroken = staticCheck.syntax === "failed" && baseline.verification.syntax !== "failed";
    const worse = cmp.introduced.some((f) => ["CRITICAL", "HIGH"].includes(String(f.severity).toUpperCase())) || syntaxBroken;
    attempts.push({ round, fixesTried: attemptSet.length, resolved: cmp.resolved.length, introduced: cmp.introduced.length, syntaxBroken, accepted: !worse });
    if (!worse) { candidate = result.code; applied = result.applied; after = rescan.findings; comparison = cmp; verification = staticCheck; accepted = true; break; }
    // Repair round: drop AI proposals and retry with deterministic fixes only.
    const deterministicOnly = attemptSet.filter((f) => f.source === "deterministic");
    if (deterministicOnly.length === attemptSet.length) break; // nothing left to back off
    attemptSet = deterministicOnly;
  }
  step("apply", accepted ? "completed" : (toApply.length ? "rejected" : "skipped"), accepted ? `${applied.length} fix(es) applied after ${round} round(s)` : toApply.length ? "every candidate introduced a CRITICAL/HIGH finding or broke syntax; original kept" : "no applicable fix");
  step("rescan", "completed", `${after.length} finding(s) after`);
  step("regression-check", accepted ? "completed" : "failed", `${comparison.introduced.length} newly introduced finding(s)`);

  // 8. Tests: generated for the candidate, executed only where a runner exists.
  let tests = { status: "not_run", reason: "Test generation requires GEMINI_API_KEY." };
  const runner = getLanguage(resolvedLanguage)?.testRunner;
  const generated = await generateTestCode({ source: candidate, language: resolvedLanguage, sourceName, findings: before, testRunner: runner });
  if (generated.status === "generated" && generated.tests.length) {
    const cap = runnerCapability(resolvedLanguage);
    if (cap.status === "available") {
      const run = await runGeneratedTests({ tests: generated.tests, language: resolvedLanguage });
      tests = run.status === "completed"
        ? { status: "ran", generated: generated.tests.length, suites: run.totals.suites, passed: run.totals.passed, failed: run.totals.failed, suitesPassed: run.totals.suitesPassed, suitesFailed: run.totals.suitesFailed, results: run.results.map((r) => ({ name: r.name, status: r.status, passed: r.passed, failed: r.failed, failures: r.failures })) }
        : { status: "not_run", generated: generated.tests.length, reason: run.reason };
    } else tests = { status: "not_run", generated: generated.tests.length, reason: cap.reason, tests: generated.tests };
  } else if (generated.status === "plan_only") tests = { status: "not_run", reason: generated.reason };
  else if (generated.status === "not_available") tests = { status: "not_available", reason: generated.reason };
  step("tests", tests.status === "ran" ? "completed" : tests.status, tests.status === "ran" ? `${tests.passed} passed, ${tests.failed} failed` : tests.reason);

  // 9. Report — a verdict that only ever claims what the evidence supports.
  // "Verified" requires that something changed, every generated suite ran to
  // completion and passed, and at least one assertion actually executed.
  const suites = tests.status === "ran" ? tests.suites : 0;
  const allSuitesPassed = tests.status === "ran" && suites > 0 && tests.suitesPassed === suites && tests.passed > 0 && tests.failed === 0;
  const anySuiteFailed = tests.status === "ran" && (tests.suitesFailed > 0 || tests.failed > 0);
  const verdict = !accepted && toApply.length ? "REJECTED"
    : !candidateChanged(original, candidate) ? "NO_SAFE_FIX"
    : comparison.introduced.length ? "PARTIALLY_VERIFIED"
    : anySuiteFailed ? "TESTS_FAILED"
    : allSuitesPassed && verification.syntax === "passed" ? "VERIFIED_STATIC_AND_TESTS"
    : verification.syntax === "passed" ? "PARTIALLY_VERIFIED"
    : "FAILED";

  return {
    status: "completed",
    language: resolvedLanguage,
    code: candidate,
    changed: candidate !== original,
    steps,
    attempts,
    summary: {
      detected: before.length,
      fixed: comparison.resolved.length,
      remaining: comparison.remaining.length,
      requiresReview: requiresReview.length,
      introduced: comparison.introduced.length,
      applied: applied.length
    },
    modifications: applied.map((m) => ({ findingId: m.findingId, title: m.title, severity: m.severity, line: m.line, source: m.source, before: m.before, after: m.after, explanation: m.explanation })),
    requiresReview: requiresReview.map((m) => ({ findingId: m.findingId, title: m.title, severity: m.severity, line: m.line, source: m.source, suggestedFix: m.suggestedFix, explanation: m.explanation })),
    remaining: comparison.remaining.map((f) => ({ id: f.id, rule: f.rule, title: f.title, severity: f.severity, line: f.line })),
    introduced: comparison.introduced.map((f) => ({ id: f.id, rule: f.rule, title: f.title, severity: f.severity, line: f.line })),
    tests,
    verification,
    aiStatus: aiResult.status,
    verdict,
    note: "Counts come from rescanning the candidate, not from the number of patches applied. Nothing has been saved; the candidate is returned for review."
  };
}
