const languageByExtension = {
  ".py": "python", ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".ts": "typescript", ".tsx": "typescript", ".java": "java", ".c": "c", ".h": "c",
  ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp", ".cs": "csharp", ".go": "go",
  ".rs": "rust", ".kt": "kotlin", ".kts": "kotlin", ".swift": "swift", ".php": "php",
  ".rb": "ruby", ".sql": "sql", ".sh": "bash", ".bash": "bash", ".html": "html", ".htm": "html",
  ".css": "css", ".dart": "dart", ".r": "r"
};
const ignoredDirectories = new Set(["node_modules", ".git", "dist", "build", "coverage", "target", "bin", "obj", "venv", ".venv", "__pycache__"]);
const supportedExtensions = Object.keys(languageByExtension);
const projectManifests = new Set(["package.json", "requirements.txt", "pyproject.toml", "pom.xml", "build.gradle", "go.mod", "cargo.toml", "composer.json", "gemfile"]);
const maxProjectFiles = 100;
const maxProjectFileChars = 200000;
const maxProjectChars = 2000000;

export function detectLanguageFromName(name) {
  const lower = String(name || "").toLowerCase();
  return Object.entries(languageByExtension).find(([extension]) => lower.endsWith(extension))?.[1] || "unknown";
}

export function normalizeProjectFiles(files) {
  let totalChars = 0;
  return files
    .filter((file) => file && file.name && typeof file.content === "string")
    .map((file) => ({ ...file, name: String(file.name).replace(/\\/g, "/").replace(/^\/+/, "") }))
    .filter((file) => !file.name.split("/").some((part) => ignoredDirectories.has(part) || part === ".."))
    .filter((file) => supportedExtensions.some((extension) => file.name.toLowerCase().endsWith(extension)) || projectManifests.has(file.name.split("/").pop().toLowerCase()))
    .slice(0, maxProjectFiles)
    .map((file) => ({ name: file.name, content: file.content.slice(0, maxProjectFileChars) }))
    .filter((file) => {
      if (totalChars + file.content.length > maxProjectChars) return false;
      totalChars += file.content.length;
      return true;
    })
    .map((file) => ({ ...file, language: detectLanguageFromName(file.name) }));
}
