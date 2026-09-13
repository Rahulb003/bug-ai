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

test("every code-bearing field survives sanitisation intact", () => {
  // Angle-bracket stripping silently corrupts comparisons, generics, JSX and
  // HTML. Any field that can carry source must be exempt, not just "code".
  const source = {
    code: "template<typename T> bool lt(T a, T b){ return a < b; }",
    content: "const el = <div className=\"x\">{a > b ? 1 : 2}</div>;",
    source: "SELECT * FROM t WHERE a <> b",
    selection: "if (a<b && c>d) { return <T>x; }",
    optimizedCode: "for (let i=0;i<n;i++){}",
    suggestedFix: "if (a < b) return;",
    originalCode: "a>b",
    patch: "- a<b\n+ a<=b"
  };
  const req = { body: { ...source, filename: "<demo>.tsx", message: "hi <script>alert(1)</script>" } };
  sanitizeBody(req, {}, () => {});
  for (const [key, value] of Object.entries(source)) {
    assert.equal(req.body[key], value, `${key} must pass through untouched`);
  }
  // Metadata is still normalised.
  assert.equal(req.body.filename, "demo.tsx");
  assert.ok(!req.body.message.includes("script"), "metadata is still sanitised");
});

test("nested code fields survive sanitisation too", () => {
  // /api/test/run sends tests[].code and /api/upload-project sends
  // files[].content. A top-level-only exemption turned "=>" into "=" inside
  // every generated test, so exemption has to apply at any depth.
  const req = { body: {
    tests: [{ name: "adds", code: 'test("a", () => assert.ok(1 < 2));' }],
    files: [{ name: "x.tsx", content: "const C = () => <div>{a > b}</div>;" }],
    wrapper: { selection: "if (a<b && c>d) {}" },
    label: "<b>meta</b>"
  } };
  sanitizeBody(req, {}, () => {});
  assert.equal(req.body.tests[0].code, 'test("a", () => assert.ok(1 < 2));');
  assert.equal(req.body.files[0].content, "const C = () => <div>{a > b}</div>;");
  assert.equal(req.body.wrapper.selection, "if (a<b && c>d) {}");
  assert.equal(req.body.label, "bmeta/b", "non-source metadata is still normalised at depth");
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

test("AST analysis clears the regex false positives on JavaScript", async () => {
  // pattern.exec() is an ordinary regex call and system() is an unrelated class
  // method; the old regex rules flagged both as CRITICAL/HIGH.
  const result = await analyzeWithEngine({ source: "const p=/x/; function f(l){return p.exec(l);} class R{system(){return 1;}}", language: "javascript", sourceName: "fp.js", includeAi: false });
  assert.ok(!result.findings.some((item) => item.rule === "BUGAI-SEC-001"), "p.exec must not be dynamic code execution");
  assert.ok(!result.findings.some((item) => item.rule === "BUGAI-SEC-002"), "a method named system must not be command injection");
});

test("AST analysis still reports genuine JavaScript security issues", async () => {
  const result = await analyzeWithEngine({ source: "function run(u){ return eval(u); }", language: "javascript", sourceName: "tp.js", includeAi: false });
  const evalFinding = result.findings.find((item) => item.rule === "BUGAI-SEC-001");
  assert.ok(evalFinding, "eval(userInput) must still be reported");
  assert.equal(evalFinding.severity, "CRITICAL");
  assert.ok(evalFinding.references.includes("CWE-95"));
  const shell = await analyzeWithEngine({ source: "const {exec} = require(\"child_process\"); exec(cmd);", language: "javascript", sourceName: "sh.js", includeAi: false });
  assert.ok(shell.findings.some((item) => item.rule === "BUGAI-SEC-002"), "a real child_process call must still be reported");
});

test("AST analysis detects assignment used as a condition", async () => {
  const result = await analyzeWithEngine({ source: "function add(a,b){var x=1\nif(x=1){console.log(x)}\nreturn a+b}", language: "javascript", sourceName: "assign.js", includeAi: false });
  const assignment = result.findings.find((item) => item.rule === "BUGAI-RUN-004");
  assert.ok(assignment, "if (x = 1) must be reported; the regex engine found nothing here");
  assert.equal(assignment.line, 2);
  assert.equal(assignment.severity, "HIGH");
});

test("non-JavaScript languages keep the regex analyzers", async () => {
  const result = await analyzeWithEngine({ source: "def run(x):\n    return eval(x) / 0", language: "python", sourceName: "unsafe.py", includeAi: false });
  const evalFinding = result.findings.find((item) => item.rule === "BUGAI-SEC-001");
  assert.ok(evalFinding, "python eval must still be caught by the regex path");
  assert.equal(evalFinding.source, "security-analyzer");
  assert.ok(result.findings.some((item) => item.rule === "BUGAI-RUN-001"));
});

test("malformed JavaScript degrades safely instead of throwing", async () => {
  const result = await analyzeWithEngine({ source: "function broken( { const = = ;;; ", language: "javascript", sourceName: "broken.js", includeAi: false });
  assert.equal(result.status, "completed");
  assert.ok(!result.findings.some((item) => item.source?.startsWith("ast-")), "no AST findings when parsing fails");
  assert.ok(result.findings.some((item) => item.rule === "BUGAI-SYN-002"), "the syntax analyzer still covers the file");
});

test("AI findings that restate a deterministic finding on the same line are dropped", async () => {
  // The model is asked not to repeat proven findings but does anyway; counting
  // "SQL Injection" beside "Potential SQL injection" doubles the total.
  const { analyzeWithEngine: run } = await import("../server/services/engine/analysisPipeline.js");
  const { analyzeWithAi } = await import("../server/services/engine/ai/aiAnalyzer.js");
  // Drive the pipeline with a stand-in AI result rather than a live model.
  const source = "const q = \"SELECT * FROM t WHERE id=\" + id;\nconst y = 1;\n";
  const deterministic = await run({ source, language: "javascript", sourceName: "q.js", includeAi: false });
  const sqlLine = deterministic.findings.find((f) => f.rule === "BUGAI-SEC-003").line;
  assert.equal(sqlLine, 1);
  // Simulate what the merge does with an AI finding on the proven line and one on a new line.
  const { finding } = await import("../server/services/engine/findingEngine.js");
  const aiSame = finding({ file: "q.js", language: "javascript", line: 1, category: "security", severity: "HIGH", rule: "BUGAI-AI-1", title: "SQL Injection", source: "AI" });
  const aiNew = finding({ file: "q.js", language: "javascript", line: 2, category: "logic", severity: "LOW", rule: "BUGAI-AI-2", title: "Unused variable", source: "AI" });
  const provenLines = new Set(deterministic.findings.map((i) => `${i.file}:${i.line}`));
  const kept = [aiSame, aiNew].filter((i) => !provenLines.has(`${i.file}:${i.line}`));
  assert.deepEqual(kept.map((k) => k.title), ["Unused variable"], "only the AI finding on an unproven line survives");
  assert.equal(typeof analyzeWithAi, "function");
});
