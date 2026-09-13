document.addEventListener("DOMContentLoaded", () => {
  if (!App.requireAuth()) return;
  const root = document.getElementById("workspace-content");
  const esc = BugWorkspace.esc;
  const icon = (n, c) => BugWorkspace.icon(n, c);

  // ---------------------------------------------------------------- input
  let input = null;
  try { input = JSON.parse(localStorage.getItem("bugai_optimizer_input") || "null"); } catch { input = null; }
  if (!input || !String(input.code || "").trim()) {
    const scan = BugWorkspace.currentScan();
    if (scan?.sourceCode) input = { code: scan.sourceCode, filename: scan.sourceName, language: scan.language };
  }
  if (!input || !String(input.code || "").trim()) {
    root.innerHTML = BugWorkspace.emptyState({ title: "No code loaded", body: "The Optimizer works on a file you have open. Open Code Studio, then use Optimize or “View in Optimizer” on a finding.", actionHref: "studio.html", actionLabel: "Open Code Studio" });
    return;
  }

  // State. `original` is the untouched input; `current` is what the user has
  // accepted so far. Nothing is ever written back to the server implicitly.
  const original = String(input.code);
  let current = original;
  let proposed = null;          // latest full proposal from /optimize or /fix
  let proposalLabel = "";
  let hunks = [];               // diff hunks between current and proposed
  let lastResult = null;
  let view = "diff";

  // ------------------------------------------------------------ LCS diff
  function diffLines(a, b) {
    const n = a.length, m = b.length;
    // Standard LCS table. Inputs here are single files, so this is fine.
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const ops = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { ops.push({ type: "same", text: a[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: "del", text: a[i] }); i++; }
      else { ops.push({ type: "add", text: b[j] }); j++; }
    }
    while (i < n) { ops.push({ type: "del", text: a[i++] }); }
    while (j < m) { ops.push({ type: "add", text: b[j++] }); }
    return ops;
  }

  // Group consecutive del/add runs into reviewable hunks.
  function buildHunks(a, b) {
    const ops = diffLines(a, b);
    const out = [];
    let line = 0, k = 0;
    while (k < ops.length) {
      if (ops[k].type === "same") { line++; k++; continue; }
      const start = line;
      const removed = [], added = [];
      while (k < ops.length && ops[k].type !== "same") {
        if (ops[k].type === "del") { removed.push(ops[k].text); line++; }
        else added.push(ops[k].text);
        k++;
      }
      out.push({ id: `h${out.length}`, startLine: start, removed, added, decision: "pending" });
    }
    return out;
  }

  // Rebuild the file from the original lines plus whichever hunks are accepted.
  function applyDecisions(baseLines, list) {
    const out = [];
    let cursor = 0;
    for (const h of list.slice().sort((x, y) => x.startLine - y.startLine)) {
      while (cursor < h.startLine) out.push(baseLines[cursor++]);
      if (h.decision === "accepted") out.push(...h.added);
      else out.push(...h.removed);
      cursor += h.removed.length;
    }
    while (cursor < baseLines.length) out.push(baseLines[cursor++]);
    return out.join("\n");
  }

  const acceptedCode = () => (hunks.length ? applyDecisions(current.split("\n"), hunks) : current);

  // ------------------------------------------------------------------ UI
  const MODES = [["safe", "Safe optimization"], ["performance", "Performance"], ["readability", "Readability"], ["maintainability", "Maintainability"], ["security", "Security"], ["full", "Full optimization"]];

  root.innerHTML = BugPages.header({
    title: "Optimizer",
    subtitle: esc(input.filename || "snippet") + " · " + esc(input.language || "auto") + " · every change is a proposal until you accept it",
    actions: '<a class="ws-button" href="studio.html">Back to Studio</a>'
  })
  + '<div class="ws-toolbar op-bar">'
  + '<select class="ws-select" id="op-mode">' + MODES.map(([v, l]) => '<option value="' + v + '">' + l + "</option>").join("") + "</select>"
  + '<label class="op-check"><input type="checkbox" id="op-strict" checked> Strict behaviour preservation</label>'
  + '<button class="ws-button primary" id="op-optimize">' + icon("gauge") + " Optimize</button>"
  + '<button class="ws-button" id="op-fixall">' + icon("review") + " Fix All</button>"
  + '<button class="ws-button" id="op-verify">' + icon("shield") + " Verify</button>"
  + '<button class="ws-button" id="op-rescan">' + icon("studio") + " Rescan</button>"
  + '<span class="op-spacer"></span><select class="ws-select" id="op-to" title="Translate to"><option value="">Translate to…</option>' + ["javascript","typescript","python","java","go","rust","csharp","cpp","ruby","php","kotlin","swift"].map((l) => '<option value="' + l + '">' + l + "</option>").join("") + "</select>"
  + '<button class="ws-button" id="op-translate">Translate</button>'
  + "</div>"
  + '<div id="op-status" class="ws-notice">Nothing proposed yet. Pick a mode and press Optimize, or pull in fix proposals with Fix All.</div>'
  + '<div class="op-tabs" id="op-tabs">'
  + ["original", "current", "proposed", "diff"].map((v) => '<button class="op-tab' + (v === "diff" ? " active" : "") + '" data-view="' + v + '">' + ({ original: "Original", current: "Current", proposed: "Proposed", diff: "Diff" })[v] + "</button>").join("")
  + '<span class="op-spacer"></span>'
  + '<button class="ws-button" id="op-accept-all">Accept all</button>'
  + '<button class="ws-button" id="op-reject-all">Reject all</button>'
  + '<button class="ws-button" id="op-copy">Copy</button>'
  + '<button class="ws-button" id="op-download">Download</button>'
  + '<button class="ws-button" id="op-replace">Replace original</button>'
  + '<button class="ws-button danger" id="op-revert">Revert</button>'
  + "</div>"
  + '<div class="op-body" id="op-body"></div>'
  + '<section class="ws-card" id="op-changes" style="margin-top:16px"><h3>Change explanation</h3><p class="ws-muted">Run a proposal to see what changed and why.</p></section>'
  + '<section class="ws-card" id="op-verify-out" style="margin-top:16px" hidden></section>';

  const statusEl = document.getElementById("op-status");
  const bodyEl = document.getElementById("op-body");

  function setStatus(text, tone) {
    statusEl.textContent = text;
    statusEl.className = "ws-notice" + (tone ? " tone-" + tone : "");
  }

  function codeBlock(text) { return '<pre class="ws-code op-code">' + esc(text) + "</pre>"; }

  function renderDiff() {
    if (!proposed) { bodyEl.innerHTML = BugWorkspace.emptyState({ title: "No proposal yet", body: "Optimize or Fix All will produce a diff you can review hunk by hunk." }); return; }
    if (!hunks.length) { bodyEl.innerHTML = BugWorkspace.emptyState({ title: "No differences", body: "The proposal is identical to the current source. That is an honest result, not a failure." }); return; }
    const baseLines = current.split("\n");
    bodyEl.innerHTML = '<div class="op-diff">' + hunks.map((h) => {
      const ctxBefore = baseLines.slice(Math.max(0, h.startLine - 2), h.startLine);
      const ctxAfter = baseLines.slice(h.startLine + h.removed.length, h.startLine + h.removed.length + 2);
      return '<article class="op-hunk ' + h.decision + '" data-hunk="' + h.id + '">'
        + '<header><b>Line ' + (h.startLine + 1) + "</b>"
        + '<span class="ws-badge">-' + h.removed.length + " +" + h.added.length + "</span>"
        + '<span class="op-decision">' + (h.decision === "pending" ? "Pending review" : h.decision === "accepted" ? "Accepted" : "Rejected") + "</span>"
        + '<span class="op-spacer"></span>'
        + '<button class="ws-button" data-accept="' + h.id + '">Accept</button>'
        + '<button class="ws-button" data-reject="' + h.id + '">Reject</button></header>'
        + '<div class="op-hunk-body">'
        + ctxBefore.map((l) => '<div class="op-line ctx">' + esc(l) + "</div>").join("")
        + h.removed.map((l) => '<div class="op-line del">- ' + esc(l) + "</div>").join("")
        + h.added.map((l) => '<div class="op-line add">+ ' + esc(l) + "</div>").join("")
        + ctxAfter.map((l) => '<div class="op-line ctx">' + esc(l) + "</div>").join("")
        + "</div></article>";
    }).join("") + "</div>";
    bodyEl.querySelectorAll("[data-accept]").forEach((b) => b.onclick = () => decide(b.dataset.accept, "accepted"));
    bodyEl.querySelectorAll("[data-reject]").forEach((b) => b.onclick = () => decide(b.dataset.reject, "rejected"));
  }

  function decide(id, decision) {
    const h = hunks.find((x) => x.id === id); if (!h) return;
    h.decision = h.decision === decision ? "pending" : decision;
    renderView();
    const accepted = hunks.filter((x) => x.decision === "accepted").length;
    const rejected = hunks.filter((x) => x.decision === "rejected").length;
    setStatus(`${accepted} accepted, ${rejected} rejected, ${hunks.length - accepted - rejected} pending. Nothing is saved until you press Replace original.`, accepted ? "ok" : "");
  }

  function renderView() {
    document.querySelectorAll(".op-tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
    if (view === "original") bodyEl.innerHTML = codeBlock(original);
    else if (view === "current") bodyEl.innerHTML = codeBlock(current);
    else if (view === "proposed") bodyEl.innerHTML = proposed ? codeBlock(acceptedCode()) : BugWorkspace.emptyState({ title: "No proposal yet", body: "Run Optimize or Fix All first." });
    else renderDiff();
  }
  document.querySelectorAll(".op-tab").forEach((t) => t.onclick = () => { view = t.dataset.view; renderView(); });

  function loadProposal(nextCode, label, changes) {
    proposed = nextCode;
    proposalLabel = label;
    hunks = buildHunks(current.split("\n"), String(nextCode).split("\n"));
    view = "diff"; renderView();
    const box = document.getElementById("op-changes");
    box.innerHTML = "<h3>Change explanation</h3>" + (changes && changes.length
      ? '<ul class="op-changes">' + changes.map((c) => "<li><b>" + esc(c.category || "change") + "</b> — " + esc(c.explanation) + (c.source ? ' <span class="ws-badge">' + esc(c.source) + "</span>" : "") + "</li>").join("") + "</ul>"
      : '<p class="ws-muted">The proposal carried no per-change explanation.</p>');
  }

  // ------------------------------------------------------------- actions
  document.getElementById("op-optimize").onclick = async () => {
    const mode = document.getElementById("op-mode").value;
    const strict = document.getElementById("op-strict").checked;
    setStatus("Optimizing (" + mode + ")…");
    try {
      const out = await App.api("/optimize", { method: "POST", body: { code: current, filename: input.filename, language: input.language, mode, strictBehaviorPreservation: strict } });
      lastResult = out;
      if (out.aiStatus !== "completed") {
        setStatus("AI optimization " + out.aiStatus + ". " + (out.note || "No transformation was produced."), "warn");
        loadProposal(current, "none", []);
        return;
      }
      loadProposal(out.optimizedCode, mode, out.changes);
      setStatus(hunks.length ? hunks.length + " hunk(s) proposed in " + mode + " mode. Review each one — nothing is applied yet." : (out.note || "No transformation was produced for this mode."), hunks.length ? "ok" : "warn");
      renderVerification(out.optimizedVerification, "Static check of the proposed code");
    } catch (error) { setStatus(error.message, "bad"); }
  };

  // Translation is a proposal like any other: it lands as hunks against the
  // current source, with the target-language static check and an explicit
  // "equivalence not verified" caveat. Accepting it replaces the working copy.
  document.getElementById("op-translate").onclick = async () => {
    const to = document.getElementById("op-to").value;
    if (!to) return App.showToast("Choose a target language first.", "warning", "Translate");
    setStatus("Translating to " + to + "…");
    try {
      const out = await App.api("/translate", { method: "POST", body: { code: current, filename: input.filename, from: input.language, to } });
      if (out.status !== "completed") { setStatus("Translation " + out.status + ": " + (out.reason || ""), "warn"); return; }
      loadProposal(out.translatedCode, "translate:" + to, [
        ...out.notes.map((n) => ({ category: "translation", explanation: n, source: "ai" })),
        ...out.caveats.map((c) => ({ category: "caveat", explanation: c, source: "ai" })),
        { category: "equivalence", explanation: out.equivalence.reason, source: "verification" }
      ]);
      renderVerification(out.verification, "Static check of the " + to + " translation");
      setStatus("Translated " + out.from + " → " + to + ": " + hunks.length + " hunk(s). Semantic equivalence is NOT verified — review, then accept to replace the working copy.", "warn");
      input.language = to; input.filename = String(input.filename || "snippet").replace(/.[^.]+$/, "") + "." + ({ javascript: "js", typescript: "ts", python: "py", java: "java", go: "go", rust: "rs", csharp: "cs", cpp: "cpp", ruby: "rb", php: "php", kotlin: "kt", swift: "swift" }[to] || to);
    } catch (error) { setStatus(error.message, "bad"); }
  };

  document.getElementById("op-fixall").onclick = async () => {
    setStatus("Requesting fix proposals…");
    try {
      const out = await App.api("/fix", { method: "POST", body: { code: current, filename: input.filename, language: input.language } });
      if (!out.fixes.length) { setStatus("No applicable fixes were proposed (AI status: " + (out.aiStatus || "n/a") + ").", "warn"); return; }
      // Apply each proposed fix to its reported line to build one candidate file.
      const lines = current.split("\n");
      const applied = [];
      for (const fix of out.fixes) {
        const finding = (BugWorkspace.currentScan()?.findings || []).find((f) => f.id === fix.findingId);
        const line = (finding?.line || 1) - 1;
        if (line >= 0 && line < lines.length && String(fix.suggestedFix || "").trim()) {
          lines[line] = fix.suggestedFix;
          applied.push({ category: fix.source === "ai" ? "AI fix" : "Deterministic fix", explanation: (finding?.title || fix.findingId) + " — " + (fix.explanation || "Applied the proposed patch at line " + (line + 1) + "."), source: fix.source });
        }
      }
      if (!applied.length) { setStatus("Fix proposals returned, but none mapped to a line in this file.", "warn"); return; }
      loadProposal(lines.join("\n"), "fix-all", applied);
      setStatus(applied.length + " fix proposal(s) staged as " + hunks.length + " hunk(s). Accept the ones you want — nothing is applied yet.", "ok");
    } catch (error) { setStatus(error.message, "bad"); }
  };

  function renderVerification(verification, title) {
    const box = document.getElementById("op-verify-out");
    if (!verification) { box.hidden = true; return; }
    box.hidden = false;
    const rowsFor = (v) => Object.entries(v).filter(([, val]) => val && typeof val === "object" && "status" in val)
      .map(([key, val]) => "<tr><td>" + esc(key) + '</td><td><span class="ws-badge ' + (val.status === "completed" ? "low" : val.status === "not_available" || val.status === "not_run" ? "" : "high") + '">' + esc(String(val.status).replaceAll("_", " ")) + "</span></td><td>" + esc(val.reason || val.source || "") + "</td></tr>").join("");
    box.innerHTML = "<h3>" + esc(title) + "</h3>"
      + '<p class="ws-muted">Overall: <b>' + esc(String(verification.status || "NOT RUN").replaceAll("_", " ")) + "</b> · syntax " + esc(verification.syntax || "n/a") + "</p>"
      + '<table class="ws-table"><thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead><tbody>' + rowsFor(verification) + "</tbody></table>"
      + '<p class="ws-muted">Checks reported as not available are not passes. Nothing here claims the code was executed.</p>';
  }

  document.getElementById("op-verify").onclick = async () => {
    setStatus("Verifying the accepted code…");
    try {
      const out = await App.api("/verify", { method: "POST", body: { code: acceptedCode(), filename: input.filename, language: input.language } });
      renderVerification(out.verification, "Verification of the accepted code");
      const ev = out.executionVerification;
      setStatus("Static verification: " + String(out.verification.status).replaceAll("_", " ") + " · execution: " + (ev?.status === "completed" ? "ran, exit " + ev.exitCode : (ev?.reason || "not available")), "ok");
    } catch (error) { setStatus(error.message, "bad"); }
  };

  document.getElementById("op-rescan").onclick = async () => {
    setStatus("Rescanning the accepted code…");
    try {
      const before = (BugWorkspace.currentScan()?.findings || []).length;
      const scan = await App.api("/scan-code", { method: "POST", body: { code: acceptedCode(), filename: input.filename, language: input.language } });
      BugWorkspace.setContext({ scan, file: input.filename });
      const after = (scan.findings || []).length;
      const delta = before ? ` (was ${before}, now ${after})` : ` (${after})`;
      setStatus("Rescan complete: " + after + " finding(s)" + delta + ". Open Bug Analyzer for the detail.", after <= before ? "ok" : "warn");
      renderVerification(scan.verification, "Verification from the rescan");
    } catch (error) { setStatus(error.message, "bad"); }
  };

  document.getElementById("op-accept-all").onclick = () => { hunks.forEach((h) => { h.decision = "accepted"; }); renderView(); setStatus("All " + hunks.length + " hunk(s) accepted in the editor buffer. Press Replace original to keep them.", "ok"); };
  document.getElementById("op-reject-all").onclick = () => { hunks.forEach((h) => { h.decision = "rejected"; }); renderView(); setStatus("All hunks rejected. The current source is unchanged.", ""); };
  document.getElementById("op-copy").onclick = async () => {
    try { await navigator.clipboard.writeText(acceptedCode()); App.showToast("Accepted code copied to the clipboard."); }
    catch { App.showToast("Clipboard access was denied by the browser.", "error", "Copy failed"); }
  };
  document.getElementById("op-download").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([acceptedCode()], { type: "text/plain" }));
    a.download = String(input.filename || "optimized.txt").split("/").pop();
    a.click(); URL.revokeObjectURL(a.href);
  };
  document.getElementById("op-replace").onclick = () => {
    const accepted = hunks.filter((h) => h.decision === "accepted").length;
    if (!accepted) return App.showToast("Accept at least one hunk first.", "warning", "Nothing accepted");
    current = acceptedCode();
    proposed = null; hunks = []; view = "current"; renderView();
    localStorage.setItem("bugai_optimizer_input", JSON.stringify({ ...input, code: current }));
    setStatus(accepted + " hunk(s) folded into the working copy. This is still local — use Studio's Save file to persist it to the project.", "ok");
    App.showToast("Working copy updated. Not saved to the project yet.", "info", "Replaced");
  };
  document.getElementById("op-revert").onclick = () => {
    current = original; proposed = null; hunks = []; view = "original"; renderView();
    localStorage.setItem("bugai_optimizer_input", JSON.stringify({ ...input, code: current }));
    document.getElementById("op-verify-out").hidden = true;
    setStatus("Reverted to the original source.", "");
  };

  renderView();
});
