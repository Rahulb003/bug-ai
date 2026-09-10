export function confidenceFor(source, evidence = []) {
  if (source === "compiler" || source === "parser") return { score: 0.95, level: "high", reason: "Confirmed by a parser or compiler check." };
  if (source === "deterministic" || source === "security-analyzer") return { score: evidence.length > 1 ? 0.88 : 0.78, level: "high", reason: "A deterministic rule matched the supplied code." };
  if (source === "hybrid") return { score: 0.72, level: "medium", reason: "Deterministic evidence was reviewed with AI reasoning." };
  return { score: 0.45, level: "low", reason: "Potential issue identified by AI; executable proof is unavailable." };
}
