import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeWithEngine, analyzeProjectWithEngine } from "../server/services/engine/analysisPipeline.js";
import { detectLanguage } from "../server/services/engine/languageDetector.js";
import { normalizeProjectFiles } from "../server/utils/files.js";
import { sanitizeBody } from "../server/middleware/security.js";

test("detects all primary file extensions without overstating unknown input", () => {
  assert.equal(detectLanguage({ sourceName: "main.py" }), "python");
  assert.equal(detectLanguage({ sourceName: "main.rs" }), "rust");
  assert.equal(detectLanguage({ sourceName: "query.sql" }), "sql");
  assert.equal(detectLanguage({ sourceName: "blob.unknown" }), "unknown");
});

test("reports deterministic Python runtime and security evidence", async () => {
  const result = await analyzeWithEngine({ source: "def run(x):\n    return eval(x) / 0", language: "python", sourceName: "unsafe.py", includeAi: false });
  assert.equal(result.language, "python");
  assert.ok(result.findings.some((item) => item.rule === "BUGAI-SEC-001" && item.references.includes("CWE-95")));
  assert.ok(result.findings.some((item) => item.rule === "BUGAI-RUN-001"));
  assert.equal(result.verification.tests.status, "not_run");
  assert.equal(result.evaluation.status, "not_configured");
});

test("finds JavaScript XSS and command execution sinks", async () => {
  const result = await analyzeWithEngine({ source: "element.innerHTML = request.value; child_process.exec(command);", language: "javascript", sourceName: "app.js", includeAi: false });
  assert.ok(result.findings.some((item) => item.rule === "BUGAI-SEC-004"));
  assert.ok(result.findings.some((item) => item.rule === "BUGAI-SEC-002"));
});

test("detects SQL injection patterns across SQL, PHP, and Java", async () => {
  for (const [language, source, name] of [["sql", "SELECT * FROM users WHERE id=" + "+ userId", "query.sql"], ["php", "$sql = 'SELECT * FROM users ' + $id;", "app.php"], ["java", "String q = \"SELECT * FROM users \" + id;", "App.java"]]) {
    const result = await analyzeWithEngine({ source, language, sourceName: name, includeAi: false });
    assert.ok(result.findings.some((item) => item.rule === "BUGAI-SEC-003"), `${language} should report SQL injection`);
  }
});

test("keeps project files separate and excludes dependency directories", async () => {
  const result = await analyzeProjectWithEngine({ sourceName: "demo", includeAi: false, files: [
    { name: "src/main.ts", content: "const value = eval(input);" },
    { name: "node_modules/nope.js", content: "eval(x)" },
    { name: "requirements.txt", content: "requests==2" }
  ] });
  assert.equal(result.project.fileCount, 2);
  assert.ok(result.findings.every((item) => item.file !== "node_modules/nope.js"));
  assert.ok(result.findings.some((item) => item.file === "src/main.ts"));
});

test("retains project manifests and rejects dependency paths and oversized bundles", () => {
  const files = normalizeProjectFiles([
    { name: "package.json", content: '{"name":"demo"}' },
    { name: "src/main.ts", content: "export const value = 1;" },
    { name: "node_modules/nope.js", content: "eval(x)" },
    { name: "../escape.py", content: "print('no')" }
  ]);
  assert.deepEqual(files.map((file) => file.name), ["package.json", "src/main.ts"]);
});

test("security middleware preserves submitted source while normalising metadata", () => {
  const req = { body: { code: "if (a < b) { return '<script>'; }", filename: "<demo>.js" } };
  sanitizeBody(req, {}, () => {});
  assert.equal(req.body.code, "if (a < b) { return '<script>'; }");
  assert.equal(req.body.filename, "demo.js");
});

test("benchmark fixtures cover every declared language without fabricated execution", async () => {
  const cases = JSON.parse(await readFile(new URL("./fixtures/benchmark-cases.json", import.meta.url)));
  assert.equal(cases.length, 19);
  for (const fixture of cases) {
    const result = await analyzeWithEngine({ source: fixture.source, language: fixture.language, sourceName: fixture.file, includeAi: false });
    assert.equal(result.language, fixture.language);
    assert.equal(result.verification.tests.status, "not_run");
    for (const rule of fixture.rules) assert.ok(result.findings.some((item) => item.rule === rule), `${fixture.name} should report ${rule}`);
  }
});
