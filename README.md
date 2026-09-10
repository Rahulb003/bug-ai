# BUG AI

BUG AI is an evidence-led code workspace for analyzing, understanding, reviewing, and managing source code. It preserves the original dashboard, authentication, workspaces, history, analytics, notifications, administration, ZIP/project import, and public-GitHub analysis while adding a connected multi-page developer workspace.

## Run

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Open `http://127.0.0.1:8080`, then sign in and open `Code Studio`. Run the automated checks with `npm.cmd test` on Windows or `npm test` elsewhere.

`open-app.bat` starts the API and opens the browser. `start.bat` starts it in the current terminal. Both are in the repository root.

## Workspace pages

- `studio.html` — three-pane Code Studio: project/file explorer, editor, and evidence-backed finding panel.
- `projects.html` — create, open, save, analyze, and delete persisted projects.
- `analyzer.html`, `security.html`, `review.html` — focused finding views.
- `optimizer.html` — original/proposed output and change explanation; it never applies an unverified change automatically.
- `tests.html` — generated test code and available verification results; generated tests are never written into your project.
- `architecture.html`, `dependencies.html` — static project structure and import/manifest metadata.
- `assistant.html` — project-aware assistant. With a project selected and a key configured it answers from a lightweight index of stored project metadata plus up to three name-matched files, and lists the files it referenced; otherwise it falls back to the rule-based reply. Each answer is tagged `ai` or `rule-based`.
- `git.html`, `analytics.html`, `settings.html` — CI template, stored analytics, and local-workspace settings views.

Current project, selected file, and latest scan persist in browser local storage while the project data itself persists in the server database.

## Current limitations

Fix, Optimize, and test generation are implemented and produce real output, but every result is an **AI proposal that has never been executed**. Nothing is written to your files or applied automatically.

- **Fix (`POST /api/fix`)** — returns real patches. Each carries `source: "deterministic"` (a mechanical rule fix) or `source: "ai"`, and `aiStatus` reports whether the AI step ran. Only `BUGAI-PY-001` has a mechanical fix; everything else is AI-derived.
- **Optimize (`POST /api/optimize`)** — returns transformed code plus `optimizedVerification`, a fresh static check of the proposed code. If nothing can be safely improved for the mode, `optimizedCode` equals the input and `changes` is empty — an honest result, not a failure.
- **Test generation (`POST /api/test/generate`)** — returns runnable test bodies with assertions. Status is `generated` (real code), `plan_only` (no API key or the AI call failed — names and intents only, never fabricated code), or `not_available` (the language has no configured test runner; no AI call is made). Generated tests are never written into your project. The cheap stub embedded in `/api/scan` responses stays name/intent only and makes no AI call.

These three endpoints each make at most one Gemini call per request. They share the 120 requests/minute rate limiter with every other endpoint. Transient `503 high demand` responses from the model are common; they degrade to `aiStatus: "unavailable"` (or `plan_only`) rather than failing or inventing a result.

No sandboxed execution exists, so compilation, test-run, and regression verification report `not_available` by design (see Verification and security limits) — including for AI-generated tests, which are written but never run.

The assistant (`POST /api/assistant/chat`) makes at most one Gemini call per question and only when a `projectId` is supplied and a key is configured. It never sends the whole project: the prompt carries file names, languages, manifests and architecture layers, plus the contents of at most three files whose names match the question. Because chat is asked far more often than Fix or Optimize, this endpoint is the most likely to exhaust a free-tier quota; on `429`/`503` it degrades to the rule-based reply rather than failing.

**Known gap:** `ai/aiAnalyzer.js` still targets the retired `gemini-2.0-flash` model, so the optional AI reasoning step of `/api/scan` fails and silently contributes no findings. The newer modules use `GEMINI_MODEL` (default `gemini-3.6-flash`).

## Architecture

`server/services/engine/` contains the active pipeline:

- `languageRegistry.js` and `languageDetector.js` identify languages and tool capabilities.
- `projectAnalyzer.js`, `dependencyAnalyzer.js`, and `architectureAnalyzer.js` preserve project file boundaries, detect manifests/tests/import relationships, and ignore dependency/generated directories.
- `analyzers/` produces evidence-backed deterministic findings, split by category (`syntaxAnalyzer.js`, `runtimeAnalyzer.js`, `securityAnalyzer.js`, `performanceAnalyzer.js`, `qualityAnalyzer.js`) over shared helpers in `shared.js`.
- `analyzers/ast/jsAstAnalyzer.js` replaces the regex security and runtime rules for JavaScript and TypeScript with a real `@babel/parser` AST, matching node shapes instead of source text. This removes false positives the regex rules could not avoid (a `pattern.exec()` call or a method named `system()` were reported as code execution and command injection) and adds `BUGAI-RUN-004`, assignment used as a condition, which text matching cannot see. A parse failure falls back to the regex/syntax path for that file rather than dropping findings. Every other language stays on the regex analyzers.
- `ai/` supplies optional, structured AI output without treating source content as instructions: `aiAnalyzer.js` (potential findings), `aiFixer.js` (patch proposals), `aiOptimizer.js` (optimizations), and `aiTestGenerator.js` (test code). Each degrades to a labelled "not available" result when no key is configured, the API fails, or the response is malformed.
- `verification/` reports only checks that actually run. User code is never executed in the Node API process.

The former `scannerEngine.js` remains for legacy compatibility; active scan services use the modular engine. Projects are stored compatibly beside existing `db.json` records under a `projects` collection.

## Language coverage

Full static-rule coverage: Python, JavaScript, TypeScript, Java, C, C++, C#, Go, Rust, Kotlin, Swift, PHP, and Ruby. Pattern-analysis coverage: SQL, Bash, HTML, CSS, Dart, and R. Detection is automatic for `language: "auto"`; unsupported inputs report `unknown` rather than a false support claim.

## API

Authenticated endpoints include `POST /api/scan`, `/api/analyze`, `/api/project/analyze`, `/api/scan-github`, `/api/fix`, `/api/optimize`, `/api/test/generate`, and `/api/verify`. Project APIs are `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id`, `GET /api/projects/:id/files`, `PUT /api/projects/:id/files`, `POST /api/projects/:id/analyze`, plus `/dependencies` and `/architecture`. Stored reports are available at `GET /api/scans/:id`, `/findings`, and `/verification`. Existing `/api/scan-code` and `/api/upload-project` endpoints remain supported.

## Verification and security limits

This installation deliberately does not execute submitted code. Compilation, type checking, and tests report `not_available` or `not_run` until an isolated sandbox with CPU, memory, filesystem, network, process, and output limits is configured. A completed static security scan is not an execution verification. Generated test plans are never written over user tests.

GitHub analysis accepts only public `https://github.com/owner/repository` URLs, uses timeouts, ignores dependency/generated paths, and caps loaded files. Source content is preserved exactly; API metadata is sanitised without mutating code.

The browser server serves an explicit allowlist of UI files only. Database records, environment files, server source, package metadata, and tests are not public static files.

## Evaluation

Risk score is prioritisation derived from finding severity, not accuracy. Precision, recall, F1, false-positive/negative rates, fix success, and test pass rate are intentionally reported as **Evaluation benchmark not configured** until a maintained benchmark suite is added.
