import { finding } from "../findingEngine.js";
import { issue } from "./shared.js";

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
