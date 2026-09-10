import { finding } from "../findingEngine.js";

export function lineOf(source, index) { return source.slice(0, index).split(/\r?\n/).length; }
export function sourceLine(source, line) { return source.split(/\r?\n/)[line - 1] || ""; }
export function issue(file, language, source, index, details) {
  const line = lineOf(source, index);
  return finding({ file, language, line, originalCode: sourceLine(source, line), ...details });
}
