import { languagesForExtension } from "./languageRegistry.js";

export function detectLanguage({ language = "auto", sourceName = "", source = "" } = {}) {
  if (language && !["auto", "unknown", "multi-language"].includes(String(language).toLowerCase())) return String(language).toLowerCase();
  const named = languagesForExtension(sourceName);
  if (named !== "unknown") return named;
  if (/^\s*(def|import|from)\s+/m.test(source)) return "python";
  if (/\b(function|const|let|require)\b/.test(source)) return "javascript";
  if (/\b(public\s+class|static\s+void)\b/.test(source)) return "java";
  return "unknown";
}
