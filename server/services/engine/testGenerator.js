import { getLanguage } from "./languageRegistry.js";

export function generateTests({ language, sourceName, findings }) {
  const languageInfo = getLanguage(language);
  if (!languageInfo?.testRunner) return { status: "not_available", reason: `Automatic test generation is not configured for ${language || "this language"}.`, tests: [] };
  const targets = findings.filter((item) => ["runtime", "security", "logic"].includes(item.category)).slice(0, 5);
  const cases = targets.map((item, index) => ({ id: `generated-${index + 1}`, name: `regression: ${item.title}`, target: sourceName, intent: item.recommendation, status: "generated" }));
  return { status: "generated", framework: languageInfo.testRunner, tests: cases, note: "Generated test plans are not written into the user project and have not been executed." };
}
