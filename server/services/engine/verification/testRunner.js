import { runInSandbox, sandboxEnabled } from "./sandboxExecutor.js";
import { getLanguage } from "../languageRegistry.js";

// Only node:test can actually be executed here: it ships with the runtime and
// runs as a plain script, so it needs no child process (which the sandbox
// denies). Every other framework is reported as not available rather than
// pretended. Add a runner here only once it can genuinely be invoked.
export const EXECUTABLE_LANGUAGES = new Set(["javascript"]);

export function runnerCapability(language) {
  const info = getLanguage(language);
  if (!info?.testRunner) {
    return { status: "not_available", reason: `No test runner is configured for ${language || "this language"}.` };
  }
  if (!EXECUTABLE_LANGUAGES.has(language)) {
    return { status: "not_available", runner: info.testRunner, reason: `${info.testRunner} is not installed in this environment, so tests for ${language} can be generated but not executed.` };
  }
  if (!sandboxEnabled()) {
    return { status: "not_available", runner: "node:test", reason: "Execution sandbox is disabled by configuration (EXECUTION_SANDBOX_ENABLED)." };
  }
  return { status: "available", runner: "node:test", reason: "node:test runs in-process as a plain script inside the sandbox." };
}

// node:test's default reporter is the spec reporter, not TAP.
function parseSpecOutput(stdout) {
  const num = (label) => {
    const match = new RegExp(`^\\u2139 ${label} (\\d+)$`, "m").exec(stdout);
    return match ? Number(match[1]) : null;
  };
  const total = num("tests");
  const failures = [...stdout.matchAll(/^✖ (.+?) \(/gm)].map((m) => m[1]);
  const passes = [...stdout.matchAll(/^✔ (.+?) \(/gm)].map((m) => m[1]);
  return {
    total: total ?? passes.length + failures.length,
    passed: num("pass") ?? passes.length,
    failed: num("fail") ?? failures.length,
    skipped: num("skipped") ?? 0,
    durationMs: Number((/^ℹ duration_ms ([\d.]+)$/m.exec(stdout) || [])[1]) || null,
    passedNames: [...new Set(passes)],
    failedNames: [...new Set(failures)]
  };
}

// Pull the assertion message for a failed test out of the reporter output.
function failureDetail(stdout, name) {
  const index = stdout.indexOf("failing tests:");
  const tail = index >= 0 ? stdout.slice(index) : stdout;
  const marker = tail.indexOf(name);
  if (marker < 0) return null;
  const slice = tail.slice(marker, marker + 600);
  const assertion = /(AssertionError[\s\S]{0,400}?)(?:\n\s*at |\n\n)/.exec(slice);
  return assertion ? assertion[1].trim() : null;
}

export async function runGeneratedTests({ tests, language }) {
  const capability = runnerCapability(language);
  if (capability.status !== "available") {
    return { status: "not_available", runner: capability.runner || null, reason: capability.reason, results: [] };
  }
  const runnable = (tests || []).filter((t) => String(t?.code || "").trim());
  if (!runnable.length) {
    return { status: "not_available", runner: capability.runner, reason: "No test carried runnable code. Generate tests with an AI key configured first.", results: [] };
  }

  const results = [];
  for (const item of runnable.slice(0, 10)) {
    const execution = await runInSandbox({ code: item.code, language: "javascript" });
    if (execution.status !== "completed") {
      results.push({ name: item.name, status: "not_run", reason: execution.reason || "Execution was not available.", command: null });
      continue;
    }
    const summary = parseSpecOutput(execution.stdout || "");
    // A suite only counts as passed when the process exited 0, it was not
    // killed, and the reporter recorded at least one test with zero failures.
    const ranCleanly = execution.exitCode === 0 && !execution.timedOut;
    const status = execution.timedOut ? "timed_out" : (summary.total > 0 && summary.failed === 0 && ranCleanly) ? "passed" : "failed";
    results.push({
      name: item.name,
      status,
      command: "node --permission --allow-fs-read=<test> <test>",
      exitCode: execution.exitCode,
      timedOut: execution.timedOut,
      durationMs: summary.durationMs,
      total: summary.total,
      passed: summary.passed,
      failed: summary.failed,
      skipped: summary.skipped,
      failures: summary.failedNames.map((n) => ({ test: n, detail: failureDetail(execution.stdout || "", n) })),
      stdout: execution.stdout,
      stderr: execution.stderr,
      isolation: execution.isolation
    });
  }

  const totals = results.reduce((acc, r) => ({
    suites: acc.suites + 1,
    passed: acc.passed + (r.passed || 0),
    failed: acc.failed + (r.failed || 0),
    suitesPassed: acc.suitesPassed + (r.status === "passed" ? 1 : 0)
  }), { suites: 0, passed: 0, failed: 0, suitesPassed: 0 });

  return {
    status: "completed",
    runner: capability.runner,
    results,
    totals,
    coverage: { status: "not_available", reason: "Coverage requires running the runner with --experimental-test-coverage over the project, which the single-file sandbox does not do." },
    note: "Tests executed in the sandbox described by /api/verify. Results are the runner's real output; nothing is inferred."
  };
}

// Existing tests are discovered from the stored project, never executed:
// running a user's own test files would need their dependencies installed.
export function discoverProjectTests(project) {
  const files = project?.files || [];
  const detected = project?.metadata?.tests || [];
  const matched = files.filter((f) => detected.includes(f.name));
  return {
    status: matched.length ? "discovered" : "none",
    count: matched.length,
    files: matched.map((f) => ({
      name: f.name,
      language: f.language,
      lines: String(f.content || "").split(/\r?\n/).length,
      cases: [...String(f.content || "").matchAll(/\b(?:test|it|describe)\s*\(\s*["'`]([^"'`]{1,120})["'`]/g)].map((m) => m[1]).slice(0, 25)
    })),
    executionStatus: "not_available",
    executionReason: "Existing project tests are not executed: they usually require installed dependencies and a working directory, neither of which the sandbox provides."
  };
}
