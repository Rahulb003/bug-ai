import test from "node:test";
import assert from "node:assert/strict";
import { runInSandbox } from "../server/services/engine/verification/sandboxExecutor.js";

// These tests drive the flag themselves so the suite passes with
// EXECUTION_SANDBOX_ENABLED unset, "false", or "true" in the environment.
const flagWasEnabled = process.env.EXECUTION_SANDBOX_ENABLED === "true";
const withFlag = async (value, fn) => {
  const previous = process.env.EXECUTION_SANDBOX_ENABLED;
  const previousTimeout = process.env.EXECUTION_SANDBOX_TIMEOUT_MS;
  process.env.EXECUTION_SANDBOX_ENABLED = value;
  process.env.EXECUTION_SANDBOX_TIMEOUT_MS = "1500";
  try { return await fn(); } finally {
    if (previous === undefined) delete process.env.EXECUTION_SANDBOX_ENABLED; else process.env.EXECUTION_SANDBOX_ENABLED = previous;
    if (previousTimeout === undefined) delete process.env.EXECUTION_SANDBOX_TIMEOUT_MS; else process.env.EXECUTION_SANDBOX_TIMEOUT_MS = previousTimeout;
  }
};

test("the sandbox is disabled by default and never claims a run", async () => {
  await withFlag("false", async () => {
    const result = await runInSandbox({ code: "console.log(1)", language: "javascript" });
    assert.equal(result.status, "not_available");
    assert.match(result.reason, /disabled by configuration/);
    assert.equal(result.stdout, undefined, "a disabled sandbox must not report output");
  });
});

test("the shipped default configuration leaves the sandbox off", async () => {
  // Guards against .env.example or a deploy quietly enabling execution.
  assert.ok(!flagWasEnabled || process.env.BUG_AI_ALLOW_SANDBOX_TESTS === "1",
    "EXECUTION_SANDBOX_ENABLED was true in this environment; that must be a deliberate opt-in");
});

test("non-JavaScript languages are refused without spawning anything", async () => {
  await withFlag("true", async () => {
    const result = await runInSandbox({ code: "print(1)", language: "python" });
    assert.equal(result.status, "not_available");
    assert.match(result.reason, /only implemented for JavaScript/);
  });
});

test("a filesystem write from submitted code is blocked", async () => {
  await withFlag("true", async () => {
    const result = await runInSandbox({ code: "console.log('before'); require('fs').writeFileSync('x.txt','x'); console.log('after');", language: "javascript" });
    assert.equal(result.status, "completed");
    assert.notEqual(result.exitCode, 0, "the write must fail the script, not succeed silently");
    assert.match(result.stderr, /ERR_ACCESS_DENIED|Access to this API has been restricted/, `expected a permission error, got: ${result.stderr.slice(0, 200)}`);
    assert.ok(!/after/.test(result.stdout), "execution must not continue past the denied write");
  });
});

test("a write to a path named 'false' is blocked too", async () => {
  // --allow-fs-write=false would GRANT write to a file literally named "false";
  // the flag is omitted entirely so the default denial applies.
  await withFlag("true", async () => {
    const result = await runInSandbox({ code: "require('fs').writeFileSync('false','x'); console.log('wrote');", language: "javascript" });
    assert.notEqual(result.exitCode, 0);
    assert.ok(!/wrote/.test(result.stdout));
  });
});

test("child processes cannot be used to escape the sandbox", async () => {
  await withFlag("true", async () => {
    const result = await runInSandbox({ code: "console.log(require('child_process').execSync('echo pwned').toString());", language: "javascript" });
    assert.notEqual(result.exitCode, 0);
    assert.ok(!/pwned/.test(result.stdout), "shell escape must not produce output");
  });
});

test("the parent environment is not exposed to submitted code", async () => {
  await withFlag("true", async () => {
    process.env.BUG_AI_SANDBOX_CANARY = "canary-secret";
    const result = await runInSandbox({ code: "console.log('CANARY:' + (process.env.BUG_AI_SANDBOX_CANARY || 'absent'));", language: "javascript" });
    delete process.env.BUG_AI_SANDBOX_CANARY;
    assert.match(result.stdout, /CANARY:absent/, "secrets from the API process must not reach submitted code");
  });
});

test("an infinite loop is killed by the timeout", async () => {
  await withFlag("true", async () => {
    const started = Date.now();
    const result = await runInSandbox({ code: "while(true){}", language: "javascript" });
    const elapsed = Date.now() - started;
    assert.equal(result.timedOut, true, "an endless script must be reported as timed out");
    assert.ok(elapsed < 10000, `expected a kill well under 10s, took ${elapsed}ms`);
    assert.notEqual(result.exitCode, 0);
  });
});

test("a normal script's stdout is captured", async () => {
  await withFlag("true", async () => {
    const result = await runInSandbox({ code: "console.log(2+2)", language: "javascript" });
    assert.equal(result.status, "completed");
    assert.equal(result.exitCode, 0);
    assert.equal(result.timedOut, false);
    assert.match(result.stdout, /4/);
    assert.match(result.note, /NOT container/i, "the result must not overstate the isolation");
    assert.match(result.note, /Network access is NOT restricted/i);
  });
});

test("the sandbox is not reachable from the project or GitHub analysis paths", async () => {
  // An import-boundary check: public-repository code must never reach execution.
  const { readFile, readdir } = await import("node:fs/promises");
  const path = await import("node:path");
  const roots = ["server/services", "server/controllers", "server/routes"];
  const offenders = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!entry.name.endsWith(".js")) continue;
      const text = await readFile(full, "utf8");
      if (/runInSandbox|sandboxExecutor/.test(text) && !full.endsWith(path.join("verification", "sandboxExecutor.js"))) offenders.push(full.split(path.sep).join("/"));
    }
  };
  for (const root of roots) await walk(root);
  assert.deepEqual(offenders, ["server/controllers/scanController.js"], `only verifyController may execute code; found: ${offenders.join(", ")}`);

  const controller = await readFile("server/controllers/scanController.js", "utf8");
  const callSite = controller.slice(controller.indexOf("export const verifyController"), controller.indexOf("export const fixController"));
  assert.ok(callSite.includes("runInSandbox"), "the only call site must be inside verifyController");
  assert.equal((controller.match(/await runInSandbox\(/g) || []).length, 1, "exactly one execution call site");
  for (const other of ["scanGithubController", "uploadProjectController"]) {
    const section = controller.slice(controller.indexOf(`export const ${other}`));
    assert.ok(!section.slice(0, section.indexOf("export const", 10)).includes("runInSandbox"), `${other} must never execute code`);
  }
});
