# Known limitations

What BUG AI does **not** do, as of the Phase 7 wrap-up. Everything here is deliberate scope, not an undiscovered bug. See [README.md](README.md) for what is implemented.

## Analysis

- **AST analysis covers JavaScript and TypeScript only.** Every other language listed as having "full" coverage — Python, Java, C, C++, C#, Go, Rust, Kotlin, Swift, PHP, Ruby — still uses regex rules and carries the false-positive profile that implies. The exact class of false positive fixed for JS/TS (`pattern.exec()` read as code execution, a method named `system()` read as command injection) is still present in those languages.
- **No cross-file or whole-project AST analysis.** Each file is parsed and analyzed independently. There is no call graph, no import resolution between files, no taint tracking across module boundaries. A vulnerability that only exists in the interaction between two files will not be found.
- **No accuracy benchmark.** Precision, recall, F1, false-positive/negative rates, fix success rate, and test pass rate are all still reported as `Evaluation benchmark not configured` — unchanged since day one, and out of scope for Phases 0–7. The risk score is severity-weighted prioritisation, not a measured accuracy figure.

## AI-backed features

- **Every AI output is an unexecuted proposal.** Fixes, optimizations, and generated tests are never applied to stored code and never run. An optimization's `optimizedVerification` is a fresh *static* check of the proposed code, not proof it behaves identically.
- **No AI-specific rate limit or spend cap.** All four AI endpoints share the global 120 requests/minute IP limiter, which caps request rate, not API spend. The assistant is a chat interface and will exhaust a free-tier quota fastest. A per-user hourly AI budget is recommended but not implemented.
- **`ai/aiAnalyzer.js` targets a retired model.** It still requests `gemini-2.0-flash`, which returns HTTP 404, so the optional AI reasoning step of `/api/scan` silently contributes no findings. The newer modules use `GEMINI_MODEL` (default `gemini-3.6-flash`). Not fixed because it fell outside every phase's stated file scope.
- **Assistant retrieval is filename keyword matching**, not embeddings or semantic search. A question whose wording shares no stem with any filename retrieves no file contents and is answered from the project index alone.

## Sandboxed execution

- **Process-level isolation, not container-grade.** Node's Permission Model in a child process. Verified to block filesystem writes, child processes, and parent environment access, and to enforce a hard timeout — but it is **not** equivalent to Docker, gVisor, or Firecracker.
- **Network access is not restricted.** The Permission Model does not gate sockets. Submitted code can open outbound connections.
- **JavaScript only, single snippet only, off by default.** Never wired to `/api/scan-github` or project analysis, which accept code from public repositories. An automated test enforces that boundary.

## Interface

- **Sidebar navigation: the 6-group layout was kept.** Phase 4 raised consolidating to a 4-group layout (Main / Analyze / Understand / Manage). The decision is to **keep the existing 6 groups** — Main, Analyze, Understand, Development, Insights, Settings — because nothing else references group names (there are no breadcrumbs), so consolidating would be churn with no functional gain. The nav also carries a `History` entry the 4-group proposal omitted.
- **The workspace grid is broken app-wide.** `renderShell()` writes the sidebar and main into `<div id="workspace-shell">`, but `workspace.css` defines the two-column grid on the class `.ws-shell`, which nothing ever sets. Every workspace page therefore stacks the sidebar above the content instead of beside it. One-line fix (`root.classList.add("ws-shell")`), left alone because it predates these phases and sits outside their scope.
- **No favicon.** Every page logs a `404 /favicon.ico` in the browser console. Cosmetic.
- **Monaco loads from a CDN.** Code Studio requires network access on load; offline, the editor reports that it could not load rather than silently degrading.

## Operational

- **The bundled Gemini API key should be treated as compromised.** `.env` was present in a zip export of this project. It is gitignored, but rotate it. At the time of writing it also returns HTTP 429 (quota exhausted).
- **`data/db.json` is a JSON file, not a database.** No concurrency control, no migrations, no indexing.
