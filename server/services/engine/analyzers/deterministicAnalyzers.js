import { finding } from "../findingEngine.js";

function lineOf(source, index) { return source.slice(0, index).split(/\r?\n/).length; }
function sourceLine(source, line) { return source.split(/\r?\n/)[line - 1] || ""; }
function issue(file, language, source, index, details) {
  const line = lineOf(source, index);
  return finding({ file, language, line, originalCode: sourceLine(source, line), ...details });
}

export function syntaxAnalyzer({ source, language, file }) {
  const results = [];
  const pairs = { "(": ")", "[": "]", "{": "}" }; const stack = [];
  [...source].forEach((character, index) => {
    if (pairs[character]) stack.push({ character, index });
    else if (Object.values(pairs).includes(character)) {
      const open = stack.pop();
      if (!open || pairs[open.character] !== character) results.push(issue(file, language, source, index, { category: "syntax", severity: "HIGH", rule: "BUGAI-SYN-001", title: "Unbalanced delimiter", description: "A closing delimiter does not match an opening delimiter.", evidence: [character], recommendation: "Correct the surrounding delimiters.", source: "parser" }));
    }
  });
  stack.forEach((open) => results.push(issue(file, language, source, open.index, { category: "syntax", severity: "HIGH", rule: "BUGAI-SYN-002", title: "Unclosed delimiter", description: "An opening delimiter has no matching close.", evidence: [open.character], recommendation: "Close the expression or block.", source: "parser" })));
  if (language === "python") source.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(if|for|while|def|class|try|except|with)\b/.test(line) && !line.trimEnd().endsWith(":")) results.push(finding({ file, language, line: i + 1, category: "syntax", severity: "HIGH", rule: "BUGAI-PY-001", title: "Missing Python block colon", description: "Python block statements must end with a colon.", evidence: [line], originalCode: line, suggestedFix: `${line}:`, recommendation: "Add a colon.", source: "parser" }));
  });
  return results;
}

export function runtimeAnalyzer({ source, language, file }) {
  const rules = [
    [/\/\s*0\b/g, "CRITICAL", "BUGAI-RUN-001", "Literal division by zero", "A zero denominator will fail at runtime.", "Validate the denominator before division."],
    [/while\s*(?:\(\s*true\s*\)|True|true)\b/g, "HIGH", "BUGAI-RUN-002", "Potential infinite loop", "A constant loop condition can prevent termination.", "Use a terminating condition or an explicit, bounded break."],
    [/\b(?:null|None)\s*\.\s*\w+/g, "HIGH", "BUGAI-RUN-003", "Immediate null dereference", "A null-like literal is dereferenced.", "Check or initialise the value before access."]
  ];
  return rules.flatMap(([pattern, severity, rule, title, description, recommendation]) => [...source.matchAll(pattern)].map((match) => issue(file, language, source, match.index, { category: "runtime", severity, rule, title, description, evidence: [match[0]], recommendation, source: "deterministic" })));
}

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

export function performanceAnalyzer({ source, language, file }) {
  const results = [];
  const nested = /(?:for|while)\b[\s\S]{0,500}?(?:for|while)\b/g;
  for (const match of source.matchAll(nested)) results.push(issue(file, language, source, match.index, { category: "performance", severity: "MEDIUM", rule: "BUGAI-PERF-001", title: "Nested loop may be quadratic", description: "Nested iteration can be O(n²) when both loops scale with input.", evidence: [match[0].slice(0, 160)], recommendation: "Consider indexing, batching, or a hash-based lookup after measuring the workload.", source: "deterministic" }));
  for (const match of source.matchAll(/(?:\.push\(|\+=\s*[^;\n]+)[\s\S]{0,300}?(?:for|while)\b/gi)) results.push(issue(file, language, source, match.index, { category: "performance", severity: "LOW", rule: "BUGAI-PERF-002", title: "Work inside loop merits review", description: "Repeated allocation or string work inside a loop may be expensive.", evidence: [match[0].slice(0, 160)], recommendation: "Measure first; hoist invariant work or use a buffer where appropriate.", source: "deterministic" }));
  return results;
}

export function qualityAnalyzer({ source, language, file }) {
  const results = [];
  source.split(/\r?\n/).forEach((line, index) => {
    if (/\b(?:TODO|FIXME)\b/i.test(line)) results.push(finding({ file, language, line: index + 1, category: "quality", severity: "INFO", rule: "BUGAI-QUAL-001", title: "Outstanding maintenance marker", description: "The source contains a TODO or FIXME marker.", evidence: [line], originalCode: line, recommendation: "Track or resolve this work explicitly.", source: "deterministic" }));
    if (/\b\d{3,}\b/.test(line) && !/https?:|\b(?:19|20)\d{2}\b/.test(line)) results.push(finding({ file, language, line: index + 1, category: "maintainability", severity: "LOW", rule: "BUGAI-QUAL-002", title: "Potential magic number", description: "A large numeric literal may obscure intent.", evidence: [line], originalCode: line, recommendation: "Use a named constant when it represents a domain concept.", source: "deterministic" }));
  });
  return results;
}
