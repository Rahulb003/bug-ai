import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Read per call, not at import, so the limit stays configurable at runtime.
const timeoutMs = () => Number(process.env.EXECUTION_SANDBOX_TIMEOUT_MS) || 5000;
const MAX_OUTPUT_BYTES = 100_000;

const NOTE = "Executed under Node's Permission Model in a separate child process: filesystem writes denied, reads limited to the script itself, child processes and worker threads denied, a scrubbed environment, and a hard timeout. This is process-level isolation, NOT container or OS-level sandboxing. Network access is NOT restricted by this mechanism. Do not treat it as safe for untrusted code from public sources.";

// The parent's environment holds GEMINI_API_KEY, JWT_SECRET and more, and the
// permission model does not restrict process.env or network access — so an
// inherited env would be directly exfiltratable by submitted code.
function scrubbedEnv() {
  const allowed = {};
  for (const key of ["SystemRoot", "windir", "TEMP", "TMP", "PATH", "Path"]) {
    if (process.env[key]) allowed[key] = process.env[key];
  }
  return allowed;
}

export function sandboxEnabled() {
  return process.env.EXECUTION_SANDBOX_ENABLED === "true";
}

export async function runInSandbox({ code, language }) {
  if (!sandboxEnabled()) {
    return { status: "not_available", reason: "Execution sandbox is disabled by configuration." };
  }
  if (language !== "javascript") {
    return { status: "not_available", reason: "Sandboxed execution is currently only implemented for JavaScript." };
  }
  const source = String(code || "");
  if (!source.trim()) {
    return { status: "not_available", reason: "No source was supplied to execute." };
  }

  const TIMEOUT_MS = timeoutMs();
  const dir = await mkdtemp(path.join(tmpdir(), "bugai-sandbox-"));
  const scriptPath = path.join(dir, "run.js");
  await writeFile(scriptPath, source);

  try {
    const result = await new Promise((resolve) => {
      // No --allow-fs-write flag at all: the permission model denies by default,
      // and "--allow-fs-write=false" would instead GRANT write to a path named
      // "false" (verified against Node v24).
      const child = spawn(process.execPath, ["--permission", `--allow-fs-read=${scriptPath}`, scriptPath], {
        killSignal: "SIGKILL",
        env: scrubbedEnv(),
        cwd: dir,
        windowsHide: true
      });

      // Own the timer rather than inferring a timeout from the exit code. The
      // previous heuristic ("non-zero exit, no signal, empty stderr") reported
      // an ordinary failing program — a failing test suite, for instance — as
      // a timeout, because on Windows a killed child also exits 1 with no signal.
      let killedByTimeout = false;
      const timer = setTimeout(() => { killedByTimeout = true; child.kill("SIGKILL"); }, TIMEOUT_MS);

      let stdout = "", stderr = "";
      child.stdout.on("data", (d) => { stdout = (stdout + d).slice(0, MAX_OUTPUT_BYTES); });
      child.stderr.on("data", (d) => { stderr = (stderr + d).slice(0, MAX_OUTPUT_BYTES); });
      child.on("close", (exitCode, signal) => { clearTimeout(timer); resolve({ exitCode, signal, stdout, stderr, killedByTimeout }); });
      child.on("error", (error) => { clearTimeout(timer); resolve({ exitCode: null, signal: null, stdout: "", stderr: error.message, killedByTimeout }); });
    });

    return {
      status: "completed",
      exitCode: result.exitCode,
      timedOut: result.killedByTimeout,
      timeoutMs: TIMEOUT_MS,
      stdout: result.stdout,
      stderr: result.stderr,
      truncated: result.stdout.length >= MAX_OUTPUT_BYTES || result.stderr.length >= MAX_OUTPUT_BYTES,
      isolation: "node-permission-model",
      note: NOTE
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
