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
- `optimizer.html` — original/proposed output and change explanation; it never applies an unverified change automatically. **Not yet functional: the proposed output is currently identical to the input** (see Current limitations).
- `tests.html` — generated test plans and available verification results. **Not yet functional: plans are test names and intents only, with no runnable bodies** (see Current limitations).
- `architecture.html`, `dependencies.html` — static project structure and import/manifest metadata.
- `assistant.html`, `git.html`, `analytics.html`, `settings.html` — connected assistant, CI template, stored analytics, and local-workspace settings views.

Current project, selected file, and latest scan persist in browser local storage while the project data itself persists in the server database.

## Current limitations

Three advertised actions are **not implemented yet**. They return safe, non-fabricated placeholders rather than real results, and the UI must not be read as if they worked:

- **Fix (`POST /api/fix`, the Studio Fix button)** — always returns an **empty fix list**. No rule in `analyzers/deterministicAnalyzers.js` is marked `fixable: true`, so there is nothing for the controller to propose. Clicking Fix currently does nothing.
- **Optimize (`POST /api/optimize`, `optimizer.html`)** — returns the submitted source **unchanged** as `optimizedCode`. It lists finding-derived explanations but performs no transformation, and runs with AI reasoning disabled.
- **Test generation (`POST /api/test/generate`, `tests.html`)** — produces **test names and intents only**. There is no test body and no assertions; the output is metadata, not runnable code.

Additionally, no sandboxed execution exists, so compilation, test-run, and regression verification report `not_available` by design (see Verification and security limits). Gemini AI reasoning is wired into the initial `/api/scan` step only; Fix, Optimize, and Test generation make no AI call today.

## Architecture

`server/services/engine/` contains the active pipeline:

- `languageRegistry.js` and `languageDetector.js` identify languages and tool capabilities.
- `projectAnalyzer.js`, `dependencyAnalyzer.js`, and `architectureAnalyzer.js` preserve project file boundaries, detect manifests/tests/import relationships, and ignore dependency/generated directories.
- `analyzers/` produces evidence-backed deterministic findings.
- `ai/aiAnalyzer.js` supplies optional, structured potential findings without treating source comments as instructions.
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
