import { issue } from "./shared.js";

export function performanceAnalyzer({ source, language, file }) {
  const results = [];
  const nested = /(?:for|while)\b[\s\S]{0,500}?(?:for|while)\b/g;
  for (const match of source.matchAll(nested)) results.push(issue(file, language, source, match.index, { category: "performance", severity: "MEDIUM", rule: "BUGAI-PERF-001", title: "Nested loop may be quadratic", description: "Nested iteration can be O(n²) when both loops scale with input.", evidence: [match[0].slice(0, 160)], recommendation: "Consider indexing, batching, or a hash-based lookup after measuring the workload.", source: "deterministic" }));
  for (const match of source.matchAll(/(?:\.push\(|\+=\s*[^;\n]+)[\s\S]{0,300}?(?:for|while)\b/gi)) results.push(issue(file, language, source, match.index, { category: "performance", severity: "LOW", rule: "BUGAI-PERF-002", title: "Work inside loop merits review", description: "Repeated allocation or string work inside a loop may be expensive.", evidence: [match[0].slice(0, 160)], recommendation: "Measure first; hoist invariant work or use a buffer where appropriate.", source: "deterministic" }));
  return results;
}
