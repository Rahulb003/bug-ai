import { finding } from "../findingEngine.js";

export function qualityAnalyzer({ source, language, file }) {
  const results = [];
  source.split(/\r?\n/).forEach((line, index) => {
    if (/\b(?:TODO|FIXME)\b/i.test(line)) results.push(finding({ file, language, line: index + 1, category: "quality", severity: "INFO", rule: "BUGAI-QUAL-001", title: "Outstanding maintenance marker", description: "The source contains a TODO or FIXME marker.", evidence: [line], originalCode: line, recommendation: "Track or resolve this work explicitly.", source: "deterministic" }));
    if (/\b\d{3,}\b/.test(line) && !/https?:|\b(?:19|20)\d{2}\b/.test(line)) results.push(finding({ file, language, line: index + 1, category: "maintainability", severity: "LOW", rule: "BUGAI-QUAL-002", title: "Potential magic number", description: "A large numeric literal may obscure intent.", evidence: [line], originalCode: line, recommendation: "Use a named constant when it represents a domain concept.", source: "deterministic" }));
  });
  return results;
}
