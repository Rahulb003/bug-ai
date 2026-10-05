# Known limitations

What BUG AI does **not** do, as of `v0.6`. Everything here is deliberate scope or a measured constraint, not an undiscovered bug. See [README.md](README.md) for what is implemented.

## Analysis

- **AST analysis covers JavaScript and TypeScript only.** Every other language listed as having "full" coverage — Python, Java, C, C++, C#, Go, Rust, Kotlin, Swift, PHP, Ruby — still uses regex rules and carries the false-positive profile that implies. The exact class of false positive fixed for JS/TS (`pattern.exec()` read as code execution, a method named `system()` read as command injection) is still present in those languages.
- **No cross-file or whole-project AST analysis.** Each file is parsed and analyzed independently. Import edges between project files are collected for the Architecture and Dependencies pages, but there is no call graph, no taint tracking across module boundaries, and no data-flow analysis. A vulnerability that only exists in the interaction between two files will not be found.
- **No accuracy benchmark.** Precision, recall, F1, false-positive/negative rates, fix success rate and test pass rate are all reported as `Evaluation benchmark not configured`. The risk score is severity-weighted prioritisation, not a measured accuracy figure. A code quality score is not computed anywhere and every page that once showed one now says `NOT MEASURED`.
- **Only one deterministic fix exists.** `BUGAI-PY-001` (missing Python block colon) is the sole rule with a mechanical `suggestedFix`. Every other fix is an AI proposal.
- **AI findings on a line that already has a deterministic finding are dropped.** The model restates proven findings despite being told not to; suppressing them keeps counts stable, at the cost of losing an AI finding that was genuinely different but happened to share a line.

## AI-backed features

- **Every AI output is an unexecuted proposal.** Fixes, optimizations and generated tests are never applied to stored code implicitly. An optimization's `optimizedVerification` is a fresh *static* check of the proposed code, not proof it behaves identically.
- **Fix & Verify All applies deterministic fixes only by default.** AI proposals are held for review unless `applyAiFixes: true`. A candidate is rejected if it introduces a CRITICAL/HIGH finding or breaks syntax; the loop backs off once to deterministic-only fixes and otherwise keeps the original. The verdict `VERIFIED_STATIC_AND_TESTS` requires that something changed, every generated suite passed, and at least one assertion executed — anything less is `PARTIALLY_VERIFIED`, `TESTS_FAILED`, `NO_SAFE_FIX` or `REJECTED`.
- **No AI-specific rate limit, spend cap or retry.** The four AI endpoints plus the assistant share the 120 requests/minute IP limiter, which caps request rate, not spend. There is no retry on a transient `429`/`503`; the request degrades to its fallback immediately. A per-user AI budget and one bounded retry are both recommended; neither is implemented.
- **Model IDs are pinned in code.** Every AI module requests `GEMINI_MODEL` (default `gemini-3.6-flash`). Google retires model IDs without notice — `gemini-2.0-flash` began returning HTTP 404 during this work — so set `GEMINI_MODEL` rather than editing sources when it happens again.
- **Assistant retrieval is filename keyword matching**, not embeddings. A question whose wording shares no stem with any filename retrieves no file contents and is answered from the project index alone.
- **Code translation is never proven equivalent.** `POST /translate` returns the model's translation with a static check of the *target* code and `equivalence.status: "not_verified"`; nothing runs the two versions against each other. It lands in the Optimizer as ordinary hunks so it is reviewed line by line before it replaces the working copy.
- **Generated documentation covers at most 8 files × 6000 characters** (manifests and entry-point-looking files first). The response names the files that were sent and the gaps the model declared; treat everything else as undocumented rather than described.
- **Technical debt is a grouping of stored findings, not a measurement.** Items are findings grouped by rule with a priority mapped from severity; there are no effort, time or cost estimates, and the trend is only reported when a previous analysis of the same project is stored (one is kept). It is not a maintainability index.
- **Runtime performance profiling is not implemented.** Performance findings are static pattern risks (nested loops, repeated work), never measurements.

## Execution and tests

- **Process-level isolation, not container-grade.** Node's Permission Model in a child process. Verified to block filesystem writes, child processes and parent environment access, and to enforce a hard timeout — but it is **not** equivalent to Docker, gVisor or Firecracker.
- **Network access is not restricted.** The Permission Model does not gate sockets. Submitted code can open outbound connections.
- **JavaScript only, single snippet only, off by default.** `EXECUTION_SANDBOX_ENABLED=false` ships. Never wired to `/api/scan-github` or project analysis; an automated import-boundary test sanctions exactly two execution callers (verify, and the generated-test runner).
- **Only `node:test` can execute.** No other runner (jest, vitest, pytest, JUnit, go test…) is installed here, so tests for every other language are generated but reported `NOT AVAILABLE` for execution.
- **Generated tests that import the module under test crash.** The sandbox holds only the test file, and ESM has no `require`. Such suites are reported as `crashed` with the stderr reason, never as passed. Existing project test files are discovered and their case names listed, but never executed.
- **Coverage is not measured.**

## Projects and Git

- **GitHub is read-only.** Public repositories only, default branch only. No branches, diffs, commit history, commits, pushes or pull requests.
- **ZIP import drops binaries and enforces 15 MB / 2000 entries / 2 MB per entry.** Absolute paths are normalised to relative (safe, since project files are stored as records); `..` segments and drive prefixes are dropped. Dropped entries are counted and reported.
- **No per-file delete.** `PUT /projects/:id/files` creates or overwrites; only whole-project deletion exists. Studio's delete icon closes the tab and says so.
- **Sessions are httpOnly cookies (SameSite=Strict) with a request-header CSRF check; bearer tokens remain for API clients.** Cookies are only marked `Secure` behind HTTPS (or `X-Forwarded-Proto: https`), so a plain-HTTP deployment sends them in clear.
- **`data/db.json` is a JSON file, not a database.** Writes are atomic (temp file + rename) and read-modify-write runs on a single queue, so concurrent requests no longer see a half-written file or overwrite each other; there is still no locking across processes, no migrations and no indexing. Run one server instance per database file.

## Interface

- **Sidebar navigation keeps 6 groups** (Main, Analyze, Understand, Development, Insights, System). Technical Debt is not in the sidebar; it is reached from Dashboard, Analytics and the Projects detail card.
- **Settings edits username, email and password; preferences follow the account.** There is no email verification, password reset by email, or session revocation list — changing a password does not invalidate existing sessions until they expire (7 days).
- **The startup animation is cosmetic and skippable.** It plays once per browser session (`sessionStorage`), collapses under `prefers-reduced-motion`, and never gates a real loading step.
- **Revisions are per project file, capped at 80 per project.** Every save records before/after with its source; older revisions are dropped first. There is no branch or merge model, and revisions are not linked to scans automatically.
- **The symbol index is pattern-based.** Functions, classes, arrows, `def`, `func`, `fn` and type declarations are found by regular expression in the open project's files (Studio only). It is not a parser: callers and dependents are still unknown, and unusual declarations are missed.
- **Finding lifecycle is open / reviewed / ignored / fixed / verified.** Fixed and verified are written by Fix & Verify All from its rescan comparison (verified only when that run's verdict was verified); a later scan does not automatically reopen a finding that came back ("regressed" is visible only in History compare).
- **Split editing is limited to the revisions diff.** The Studio editor is single-pane; side-by-side view exists for revision compare only. Pane widths are resizable and remembered.
- **Notifications link to the scan.** Scan notifications open that scan's findings; they do not select an individual finding.
- **The command palette searches client-side state only.** Files come from the project open in Studio (`window.BugStudioFiles`) and findings from the current scan; there is no server-side full-text search of code, and no fuzzy matching beyond prefix/substring.
- **Only one icon set.** Icons are inline stroke SVGs defined in `workspace.js`; adding a page means adding an icon there. No icon library is bundled.
- **Monaco loads from a CDN.** Code Studio requires network access on load; offline, the editor reports that it could not load.
- **`UTF-8` and `LF` in the status bar are fixed defaults**, not detected.
- **Explorer "new folder" creates an untitled file inside it**, because folders exist only as path prefixes of stored files.

## Operational

- **The bundled Gemini API key should be treated as compromised, and its free tier is small.** `.env` was present in a zip export of this project; it is gitignored, but rotate it. The free tier allows **20 requests per day per model** (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`), which a single session of manual testing exhausts. Every AI feature then degrades to its documented fallback.
- **Rate limits are per account (120/min) once signed in and per IP (60/min) before**, held in memory — they reset on restart and are not shared between instances.
- **Passwords use PBKDF2-HMAC-SHA512 at 210,000 iterations** with a 16-byte random salt, the parameters stored alongside each hash. Records written with the earlier 10,000-iteration format still verify and are re-hashed transparently on the next successful login. This is a KDF, not a memory-hard one: argon2id or scrypt would resist GPU cracking better, and neither is available without a native dependency.
- **`JWT_SECRET` falls back to a hardcoded dev value** (`bugzero-dev-secret`) when unset. Fine locally; set it anywhere else. `GET /system/capabilities` reports `jwtSecretConfigured: false` while the fallback is in use.
- **The former `POST /auth/google` endpoint was removed, not fixed.** It issued a session for any submitted e-mail without verifying anything, which was an authentication bypass. Google sign-in now needs a real OAuth implementation before it can return.
