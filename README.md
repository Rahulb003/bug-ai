# BUG AI

BUG AI is an evidence-led code workspace for analyzing, understanding, reviewing, and managing source code. It preserves the original dashboard, authentication, workspaces, history, analytics, notifications, administration, multi-file project import, and public-GitHub analysis while adding a connected multi-page developer workspace.

Projects can be created from a file list (`POST /api/projects`), imported from a ZIP archive (`POST /api/projects/import-zip`, unpacked server-side with zip-slip, binary and size guards, dropped entries reported), imported from a public GitHub repository (`POST /api/projects/import-github`, read-only), and downloaded as a ZIP (`GET /api/projects/:id/export`).

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
- `debt.html` — technical debt derived from a project's stored analyses: findings grouped by rule with severity-mapped priority, affected files linked into Studio, and a trend only when a previous analysis exists. No effort or cost estimates.
- `git.html`, `analytics.html` — CI template and stored analytics.
- `settings.html` — profile, the AI / sandbox / test-runner capabilities the server actually reports (`GET /api/system/capabilities`, key shown only as a masked hint), editor and analysis preferences that Studio honours, and workspace-state reset.
- `dashboard.html` — real counts from the latest scan and active project; code quality, complexity and debt scores are shown as NOT MEASURED because nothing computes them.

Current project, selected file, open tabs, unsaved scratch tabs and pane widths persist in browser local storage; preferences persist on the account; project data and revisions persist in the server database.

## What is real, and what it falls back to

Every AI-backed action is a **proposal that has never been executed**. Nothing is written to your files or applied automatically, and each response says which path produced it.

| Action | With `GEMINI_API_KEY` | Without a key, or when the API fails |
| --- | --- | --- |
| Fix (`POST /api/fix`) | Real patches per finding, each tagged `source: "ai"` | Mechanical rule fixes only, tagged `source: "deterministic"`; `aiStatus` reports `not_configured` or `unavailable`. Only `BUGAI-PY-001` has a mechanical fix today |
| Optimize (`POST /api/optimize`) | Transformed code plus `optimizedVerification`, a fresh static check of the proposal | `optimizedCode` equals the input, `changes` is empty, and the note says no transformation was produced |
| Generate tests (`POST /api/test/generate`) | `generated`: runnable test bodies with assertions | `plan_only`: names and intents only, never fabricated code. `not_available` when the language has no configured test runner, and no AI call is made |
| Assistant (`POST /api/assistant/chat`) | `source: "ai"`: answers from a project index plus up to three name-matched files, listing the files it referenced | `source: "rule-based"`: scan-grounded keyword answers, the pre-AI behaviour |
| Explain (`POST /api/explain`) | Six modes: beginner, technical, line-by-line, architecture, performance, security | `not_configured` / `unavailable`; nothing is paraphrased locally |
| Translate (`POST /api/translate`) | Target-language code plus a static check of it and `equivalence: not_verified`; shown in the Optimizer as reviewable hunks | `not_configured` / `unavailable`; unsupported targets are `not_available` before any call |
| Documentation (`POST /api/docs`) | README / API / function / architecture markdown from at most 8 files, with the files sent and the gaps the model declared | `not_configured` / `unavailable`; an empty file list is `not_available` |

The AI reasoning step of `/api/scan` is separate and optional; deterministic findings are always produced regardless.

Each of these endpoints makes at most one Gemini call per request and shares the 120 requests/minute rate limiter with everything else. The assistant is a chat interface and will consume quota fastest. Transient `429` and `503` responses degrade to the fallback column above rather than failing or inventing a result.

## Analysis coverage

Coverage is **not** uniform across languages, and the difference is deliberate:

- **JavaScript and TypeScript** use a real `@babel/parser` AST (`analyzers/ast/jsAstAnalyzer.js`). Rules match node shapes rather than source text, so `pattern.exec()` and a class method named `system()` are no longer reported as code execution or command injection, SQL keywords inside comments no longer match, and `BUGAI-RUN-004` (assignment used as a condition) is detected — none of which text matching can do. If parsing fails, the file falls back to the syntax analyzer rather than losing findings.
- **Every other language** — Python, Java, C, C++, C#, Go, Rust, Kotlin, Swift, PHP, Ruby, and the pattern-only set — still uses the regex analyzers, with the accuracy limits that implies.

## Sandboxed execution (experimental, off by default)

`EXECUTION_SANDBOX_ENABLED=false` is the default and the shipped state. While it is off, `executionVerification` reports `not_available` and no submitted code is ever run.

When explicitly enabled, `POST /api/verify` runs a **single JavaScript snippet** in a separate child process under Node's Permission Model: filesystem writes denied, reads limited to the script itself, child processes and worker threads denied, a scrubbed environment so `GEMINI_API_KEY` and `JWT_SECRET` are not visible to submitted code, a hard timeout, and capped output.

This is **process-level isolation, not container or OS-level sandboxing**, and it does **not restrict network access**. It is deliberately wired only to the single-snippet verify path, for code the authenticated user pasted themselves — never to `/api/scan-github` or project analysis, which accept code from public repositories. An automated test enforces that import boundary.

See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) for what remains out of scope.

## Brand and startup

The mark is the **BUG-CORE**: two bracket arcs — code's parentheses, a scanner's reticle — enclosing a solid rotated core. It ships as inline SVG ([brand.js](brand.js), `BugBrand.mark({ size, state })`) and as [brand-mark.svg](brand-mark.svg) / [brand-logo.svg](brand-logo.svg). Its states (scanning, finding, fixing, verifying, verified) are set only while the matching operation is actually running or has actually completed.

Startup plays once per tab (~4.4 s): a point of light, the core, the arcs drawing in, the wordmark, a short aurora hold, then the mark travels into the sidebar while the shell assembles beneath it. Skippable after 0.8 s; `prefers-reduced-motion` collapses it to a sub-second crossfade.

## Design system

The interface follows one token set in [design.css](design.css): layered neutral surfaces (app → sidebar → surface → elevated → popover), three text tiers, structural low-contrast borders, a single selective accent, semantic severity colours, a 4–48px spacing scale, Inter for UI and JetBrains Mono for code, with a light theme, three dark variants (Graphite, Obsidian Aurora, Midnight), five accents and three densities set from Settings. Every page consumes the same primitives from [workspace.css](workspace.css) (`.ws-button`, `.ws-input`, `.ws-table`, `.ws-badge`, `.ws-empty`, `.pg-*` scaffolding, `.db-stats`) and the shared shell in [workspace.js](workspace.js) (sidebar, header, project switcher, notifications, breadcrumb, command palette). Colour marks meaning — active state, severity, success/warning/danger, AI-sourced content — never decoration.

**Command registry** ([workspace.js](workspace.js)): every command is `{ id, label, category, shortcut, when, run }`; the palette (Ctrl/⌘ K, fuzzy match, recents, shortcuts shown), global chords (Mod+B sidebar, Mod+Shift+F focus mode, Mod+S save, Mod+Enter analyze) and Studio's contextual selection bar all read from it. It lists only real actions: navigation, *Analyze project* (calls the API), *Open current analysis in Studio*, files of the open project, findings of the current scan, theme/sidebar toggles and log out. Pages can register their own commands with `BugWorkspace.registerCommands`; Code Studio registers Analyze, Fix All, Fix & Verify All, Optimize, Generate Tests, Explain and Save.

## Architecture

`server/services/engine/` contains the active pipeline:

- `languageRegistry.js` and `languageDetector.js` identify languages and tool capabilities.
- `projectAnalyzer.js`, `dependencyAnalyzer.js`, and `architectureAnalyzer.js` preserve project file boundaries, detect manifests/tests/import relationships, and ignore dependency/generated directories.
- `analyzers/` produces evidence-backed deterministic findings, split by category (`syntaxAnalyzer.js`, `runtimeAnalyzer.js`, `securityAnalyzer.js`, `performanceAnalyzer.js`, `qualityAnalyzer.js`) over shared helpers in `shared.js`.
- `analyzers/ast/jsAstAnalyzer.js` replaces the regex security and runtime rules for JavaScript and TypeScript with a real `@babel/parser` AST, matching node shapes instead of source text. This removes false positives the regex rules could not avoid (a `pattern.exec()` call or a method named `system()` were reported as code execution and command injection) and adds `BUGAI-RUN-004`, assignment used as a condition, which text matching cannot see. A parse failure falls back to the regex/syntax path for that file rather than dropping findings. Every other language stays on the regex analyzers.
- `ai/` supplies optional, structured AI output without treating source content as instructions: `aiAnalyzer.js` (potential findings), `aiFixer.js` (patch proposals), `aiOptimizer.js` (optimizations), `aiTestGenerator.js` (test code), `aiExplainer.js` (six explain modes), `aiAssistant.js` (project-aware chat), `aiTranslator.js` (translation proposals) and `aiDocs.js` (documentation). Each degrades to a labelled "not available" result when no key is configured, the API fails, or the response is malformed.
- `debtAnalyzer.js` groups a project's stored findings into technical-debt items and compares them with the previous stored analysis; `repairPipeline.js` is the Fix & Verify All loop.
- `verification/` reports only checks that actually run. User code is never executed in the Node API process.

Projects are stored compatibly beside existing `db.json` records under a `projects` collection. Database writes are atomic (temp file + rename) and read-modify-write operations are serialised on one queue.

## Language coverage

AST-based rules: JavaScript and TypeScript only. Regex static-rule coverage: Python, Java, C, C++, C#, Go, Rust, Kotlin, Swift, PHP, and Ruby. Pattern-analysis coverage: SQL, Bash, HTML, CSS, Dart, and R. "Full coverage" here means the rule set runs, not that accuracy is equal across languages — see [Analysis coverage](#analysis-coverage). Detection is automatic for `language: "auto"`; unsupported inputs report `unknown` rather than a false support claim.

## API

Authenticated endpoints include `POST /api/scan`, `/api/analyze`, `/api/project/analyze`, `/api/scan-github`, `/api/fix`, `/api/optimize`, `/api/test/generate`, and `/api/verify`. Project APIs are `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id`, `GET /api/projects/:id/files`, `PUT /api/projects/:id/files`, `POST /api/projects/:id/analyze`, plus `/dependencies` and `/architecture`. Sessions: `POST /api/auth/login` and `/register` set an httpOnly cookie (and return a bearer token for API clients); cookie-authenticated writes must send `X-Requested-With: BugAI`; `POST /api/auth/logout`, `POST /api/auth/session` (bearer→cookie), `PATCH /api/auth/me` (username, email, preferences), `POST /api/auth/password`. Revisions: `GET /api/projects/:id/revisions[?file=]`, `GET .../revisions/:rid`, `POST .../revisions/:rid/restore`; `PUT /api/projects/:id/files` accepts `source` and `note`. Stored reports are available at `GET /api/scans/:id`, `/findings`, and `/verification`; `POST /api/scans/:id/findings/:findingId/status` records triage (`open`, `reviewed`, `ignored`). `GET /api/projects/:id/debt` derives technical debt, `POST /api/translate` and `POST /api/docs` are the translation and documentation proposals, and `GET /api/system/capabilities` reports what this server can actually do. Existing `/api/scan-code` and `/api/upload-project` endpoints remain supported.

## Verification and security limits

By default this installation does not execute submitted code. Compilation, type checking, and tests report `not_available` or `not_run`, and the static `verification` block always reports only checks that actually ran. A completed static security scan is not an execution verification. Generated tests are never written over user tests.

The one exception is opt-in: with `EXECUTION_SANDBOX_ENABLED=true`, `/api/verify` executes a single JavaScript snippet in a child process and reports the result in a **separate** `executionVerification` field. The static `verification` block is unchanged by it and still says tests were not run. See [Sandboxed execution](#sandboxed-execution-experimental-off-by-default) for the isolation that does and does not provide.

GitHub analysis accepts only public `https://github.com/owner/repository` URLs, uses timeouts, ignores dependency/generated paths, and caps loaded files. Source content is preserved exactly; API metadata is sanitised without mutating code.

The browser server serves an explicit allowlist of UI files only. Database records, environment files, server source, package metadata, and tests are not public static files.

## Evaluation

Risk score is prioritisation derived from finding severity, not accuracy. Precision, recall, F1, false-positive/negative rates, fix success, and test pass rate are intentionally reported as **Evaluation benchmark not configured** until a maintained benchmark suite is added.
