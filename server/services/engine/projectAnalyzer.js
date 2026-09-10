import { detectLanguage } from "./languageDetector.js";
import { analyzeDependencies } from "./dependencyAnalyzer.js";
import { analyzeArchitecture } from "./architectureAnalyzer.js";

const ignored = new Set(["node_modules", ".git", "dist", "build", "coverage", "target", "bin", "obj", "venv", ".venv", "__pycache__"]);
const manifests = ["package.json", "requirements.txt", "pyproject.toml", "pom.xml", "build.gradle", "go.mod", "Cargo.toml", "composer.json", "Gemfile"];

export function analyseProject(files = []) {
  const safeFiles = files.filter((file) => {
    const parts = String(file.name || file.path || "").replace(/\\/g, "/").split("/");
    return !parts.some((part) => ignored.has(part) || part === "..");
  }).slice(0, 100);
  const languages = [...new Set(safeFiles.map((file) => detectLanguage({ sourceName: file.name || file.path, source: file.content })).filter((item) => item !== "unknown"))];
  const names = new Set(safeFiles.map((file) => String(file.name || file.path).split("/").pop()));
  const normalizedFiles = safeFiles.map((file) => ({ name: file.name || file.path, content: String(file.content || ""), language: detectLanguage({ sourceName: file.name || file.path, source: file.content }) }));
  return {
    files: normalizedFiles,
    analyzableFiles: normalizedFiles.filter((file) => file.language !== "unknown"),
    languages, manifests: manifests.filter((name) => names.has(name)),
    tests: safeFiles.filter((file) => /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[^.]+$/i.test(file.name || file.path)).map((file) => file.name || file.path),
    dependencies: analyzeDependencies(normalizedFiles),
    architecture: analyzeArchitecture(normalizedFiles)
  };
}
