import { issue } from "./shared.js";

export function securityAnalyzer({ source, language, file }) {
  const rules = [
    [/\b(?:eval|exec|Function)\s*\(/g, "CRITICAL", "BUGAI-SEC-001", "Dynamic code execution", "Untrusted input reaching this primitive may execute arbitrary code.", "Avoid dynamic execution; use a safe parser or an allowlist.", "CWE-95"],
    [/(?:child_process\.|\b(?:exec|spawn|system|shell_exec)\s*\()/g, "HIGH", "BUGAI-SEC-002", "Potential command injection", "Command execution needs strict argument handling.", "Use an argument array, avoid shell mode, and allowlist values.", "CWE-78"],
    [/(?:SELECT|INSERT|UPDATE|DELETE)[^\n;]*(?:\+|\$\{|%s)/gi, "HIGH", "BUGAI-SEC-003", "Potential SQL injection", "A query appears to be dynamically composed.", "Use parameterized queries.", "CWE-89"],
    [/innerHTML\s*=|document\.write\s*\(/g, "HIGH", "BUGAI-SEC-004", "Potential cross-site scripting sink", "Untrusted content assigned to an HTML sink can run script in a browser.", "Use textContent or a context-aware sanitizer.", "CWE-79"],
    [/(?:password|api[_-]?key|secret|token)\s*[:=]\s*["'][^"']{6,}["']/gi, "HIGH", "BUGAI-SEC-005", "Possible hardcoded secret", "A credential-like value is embedded in source.", "Move the value to a secret manager or environment configuration and rotate it if real.", "CWE-798"],
    [/(?:\.\.|path\.join\([^)]*(?:req\.|input|params))/gi, "MEDIUM", "BUGAI-SEC-006", "Potential path traversal", "File path construction appears to include external input.", "Resolve against an allowlisted base directory and reject traversal.", "CWE-22"]
  ];
  return rules.flatMap(([pattern, severity, rule, title, description, recommendation, cwe]) => [...source.matchAll(pattern)].map((match) => issue(file, language, source, match.index, { category: "security", severity, rule, title, description, evidence: [match[0]], recommendation, references: cwe ? [cwe] : [], impact: "May expose application data or code execution.", source: "security-analyzer" })));
}
