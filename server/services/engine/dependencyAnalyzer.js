const manifestFiles = new Set(["package.json", "requirements.txt", "pyproject.toml", "pom.xml", "build.gradle", "go.mod", "Cargo.toml", "composer.json", "Gemfile"]);

function importMatches(source) {
  const patterns = [
    /(?:import|export)\s+(?:[^"'`]+?\s+from\s+)?["']([^"']+)["']/g,
    /require\s*\(\s*["']([^"']+)["']\s*\)/g,
    /from\s+([\w.]+)\s+import\b/g,
    /#include\s*[<"]([^>"]+)[>"]/g,
    /use\s+([\w:.-]+)/g
  ];
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]));
}

function manifestDependencies(file) {
  if (file.name.endsWith("package.json")) {
    try {
      const parsed = JSON.parse(file.content);
      return Object.keys({ ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) });
    } catch { return []; }
  }
  if (file.name.endsWith("requirements.txt")) return file.content.split(/\r?\n/).map((line) => line.trim().split(/[<=>~![]/)[0]).filter((entry) => entry && !entry.startsWith("#"));
  return [];
}

export function analyzeDependencies(files = []) {
  const edges = [];
  const external = new Set();
  const declared = new Set();
  for (const file of files) {
    if (manifestFiles.has(String(file.name).split("/").pop())) manifestDependencies(file).forEach((item) => declared.add(item));
    for (const target of importMatches(String(file.content || ""))) {
      const relative = target.startsWith(".") || target.startsWith("/");
      edges.push({ from: file.name, target, type: relative ? "internal" : "external" });
      if (!relative) external.add(target.split("/")[0].startsWith("@") ? target.split("/").slice(0, 2).join("/") : target.split("/")[0]);
    }
  }
  return {
    declared: [...declared].sort(),
    imported: [...external].sort(),
    edges,
    status: "static",
    vulnerabilityStatus: "not_available",
    vulnerabilityReason: "Dependency vulnerability scanning requires an installed advisory source or package-manager audit in an isolated environment."
  };
}
