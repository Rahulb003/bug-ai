import { analyzeDependencies } from "./dependencyAnalyzer.js";

function classify(name) {
  const lower = name.toLowerCase();
  if (/(^|\/)(test|tests|__tests__)\//.test(lower) || /\.(test|spec)\./.test(lower)) return "test";
  if (/(controller|route|handler|api)/.test(lower)) return "interface";
  if (/(service|usecase|domain|business)/.test(lower)) return "service";
  if (/(model|repository|store|database|db)/.test(lower)) return "data";
  if (/(config|setting)/.test(lower)) return "configuration";
  return "module";
}

export function analyzeArchitecture(files = []) {
  const components = files.map((file) => ({ file: file.name, layer: classify(file.name), language: file.language }));
  const dependencies = analyzeDependencies(files);
  return {
    status: "static",
    components,
    relationships: dependencies.edges.filter((edge) => edge.type === "internal"),
    notes: ["Architecture is inferred from paths and import statements; it is not a runtime call graph."],
    coupling: {
      importedEdges: dependencies.edges.length,
      internalEdges: dependencies.edges.filter((edge) => edge.type === "internal").length
    }
  };
}
