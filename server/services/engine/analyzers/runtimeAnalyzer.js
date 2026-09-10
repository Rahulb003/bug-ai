import { issue } from "./shared.js";

export function runtimeAnalyzer({ source, language, file }) {
  const rules = [
    [/\/\s*0\b/g, "CRITICAL", "BUGAI-RUN-001", "Literal division by zero", "A zero denominator will fail at runtime.", "Validate the denominator before division."],
    [/while\s*(?:\(\s*true\s*\)|True|true)\b/g, "HIGH", "BUGAI-RUN-002", "Potential infinite loop", "A constant loop condition can prevent termination.", "Use a terminating condition or an explicit, bounded break."],
    [/\b(?:null|None)\s*\.\s*\w+/g, "HIGH", "BUGAI-RUN-003", "Immediate null dereference", "A null-like literal is dereferenced.", "Check or initialise the value before access."]
  ];
  return rules.flatMap(([pattern, severity, rule, title, description, recommendation]) => [...source.matchAll(pattern)].map((match) => issue(file, language, source, match.index, { category: "runtime", severity, rule, title, description, evidence: [match[0]], recommendation, source: "deterministic" })));
}
