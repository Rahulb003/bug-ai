import { syntaxAnalyzer } from "../analyzers/syntaxAnalyzer.js";

export function verifyStatic({ source, language, file = "Live snippet" }) {
  const syntax = syntaxAnalyzer({ source, language, file });
  const passed = syntax.length === 0;
  return {
    status: passed ? "PARTIALLY_VERIFIED" : "FAILED",
    syntax: passed ? "passed" : "failed",
    compilation: { status: "not_available", reason: "No isolated compiler sandbox is configured." },
    typeCheck: { status: "not_available", reason: "No isolated type-checker sandbox is configured." },
    lint: { status: "not_available", reason: "No isolated linter sandbox is configured." },
    security: { status: "completed", source: "deterministic security analyzer", reason: "Static security rules completed; this is not an execution result." }, tests: { status: "not_run", reason: "User code is never executed in the API process." },
    regression: { status: "not_run", reason: "No isolated execution sandbox is configured." },
    rescan: "completed", limitations: ["Only static parsing and deterministic rescanning were run; unavailable checks are not treated as passed."]
  };
}
