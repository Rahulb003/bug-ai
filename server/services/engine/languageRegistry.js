const definitions = [
  ["python", [".py"], "full", "pytest/unittest"], ["javascript", [".js", ".jsx", ".mjs", ".cjs"], "full", "node:test/Jest/Vitest"],
  ["typescript", [".ts", ".tsx"], "full", "Vitest/Jest"], ["java", [".java"], "full", "JUnit"],
  ["c", [".c", ".h"], "full", "detected project runner"], ["cpp", [".cpp", ".cc", ".cxx", ".hpp"], "full", "detected project runner"],
  ["csharp", [".cs"], "full", "dotnet test"], ["go", [".go"], "full", "go test"], ["rust", [".rs"], "full", "cargo test"],
  ["kotlin", [".kt", ".kts"], "full", "detected project runner"], ["swift", [".swift"], "full", "swift test"],
  ["php", [".php"], "full", "PHPUnit"], ["ruby", [".rb"], "full", "RSpec/Minitest"],
  ["sql", [".sql"], "pattern", null], ["bash", [".sh", ".bash"], "pattern", null], ["html", [".html", ".htm"], "pattern", null],
  ["css", [".css"], "pattern", null], ["dart", [".dart"], "pattern", null], ["r", [".r"], "pattern", null]
];

export const languageRegistry = Object.fromEntries(definitions.map(([id, extensions, support, testRunner]) => [id, {
  id, extensions, support, parser: "built-in structural parser", testRunner
}]));

export function getLanguage(id) { return languageRegistry[String(id || "").toLowerCase()] || null; }
export function languagesForExtension(filename) {
  const lower = String(filename || "").toLowerCase();
  return Object.values(languageRegistry).find((language) => language.extensions.some((ext) => lower.endsWith(ext)))?.id || "unknown";
}
