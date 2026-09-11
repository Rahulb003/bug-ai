// Shared rendering for the analysis pages (analyzer, security, review).
// Keeps one finding renderer and one navigation contract across every page.
const BugPages = (() => {
  const esc = (v) => BugWorkspace.esc(v);
  const icon = (n, c) => BugWorkspace.icon(n, c);
  const SEV_ORDER = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };
  const sev = (f) => String(f.severity || "info").toUpperCase();
  const sevClass = (f) => sev(f).toLowerCase();
  const bySeverity = (a, b) => (SEV_ORDER[sev(b)] || 0) - (SEV_ORDER[sev(a)] || 0);

  const confidencePct = (f) => Math.round(Number(f.confidence || 0) * (Number(f.confidence || 0) <= 1 ? 100 : 1));

  // Which layer actually produced this finding, so AI guesses are never shown
  // as confirmed errors.
  function detectionSource(f) {
    const raw = String(f.source || "deterministic").toLowerCase();
    if (raw === "ai") return { label: "AI", tone: "ai", note: "AI reasoning, not verified by a tool" };
    if (raw.startsWith("ast-")) return { label: "AST analyzer", tone: "det", note: "Parsed syntax tree" };
    if (raw.includes("security")) return { label: "Security analyzer", tone: "det", note: "Deterministic security rule" };
    if (raw === "parser") return { label: "Parser", tone: "det", note: "Structural parse" };
    return { label: "Deterministic", tone: "det", note: "Pattern rule" };
  }

  function counts(findings) {
    const out = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    findings.forEach((f) => { out[sev(f)] = (out[sev(f)] || 0) + 1; });
    return out;
  }

  function severityBar(findings) {
    const c = counts(findings);
    return `<div class="pg-sevbar">${["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((s) => `<span class="pg-sevchip ${s.toLowerCase()}"><b>${c[s] || 0}</b> ${s}</span>`).join("")}</div>`;
  }

  // One finding row, used by every list view. `maskEvidence` is on for the
  // Security Center so credentials are never printed in full.
  function findingRow(f, { maskEvidence = false } = {}) {
    const src = detectionSource(f);
    const evidence = Array.isArray(f.evidence) ? f.evidence.join(" ") : (f.whyItHappens || "");
    const shown = maskEvidence ? BugWorkspace.maskSecret(evidence) : evidence;
    return `<article class="pg-finding ${sevClass(f)}" data-finding="${esc(f.id)}">
      <div class="pg-finding-head">
        <span class="ws-badge ${sevClass(f)}">${esc(sev(f))}</span>
        <strong>${esc(f.title)}</strong>
        <span class="pg-src pg-src-${src.tone}" title="${esc(src.note)}">${esc(src.label)}</span>
      </div>
      <p>${esc(f.description || f.explanation || "")}</p>
      <div class="pg-finding-meta">
        <button class="pg-link" data-open="${esc(f.id)}">${icon("studio")} ${esc(f.file || "snippet")}:${f.line || "?"}${f.column ? `:${f.column}` : ""}</button>
        <span class="ws-badge">${esc(f.category || "quality")}</span>
        <span title="Rule ${esc(f.rule || "n/a")}">confidence ${confidencePct(f)}%${f.confidenceLevel ? ` (${esc(f.confidenceLevel)})` : ""}</span>
      </div>
      ${shown ? `<p class="pg-evidence"><b>Evidence:</b> <code>${esc(shown)}</code></p>` : ""}
      ${f.impact ? `<p><b>Impact:</b> ${esc(f.impact)}</p>` : ""}
      <p><b>Recommendation:</b> ${esc(f.recommendation || f.fix || "Review the affected code.")}</p>
      ${(f.references || []).length ? `<p class="ws-muted">References: ${(f.references || []).map(esc).join(", ")}</p>` : ""}
      <div class="pg-finding-actions">
        <button class="ws-button" data-open="${esc(f.id)}">Open in Studio</button>
        <button class="ws-button" data-explain="${esc(f.id)}">Explain</button>
        <button class="ws-button" data-optimizer="${esc(f.id)}">View in Optimizer</button>
      </div>
    </article>`;
  }

  // Filter/sort toolbar shared by the list pages.
  function toolbar({ categories = [], id = "pg" } = {}) {
    return `<div class="ws-toolbar pg-toolbar">
      <input class="ws-input pg-search" id="${id}-q" placeholder="Filter findings…">
      <select class="ws-select" id="${id}-sev"><option value="">All severities</option>${["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((s) => `<option value="${s}">${s}</option>`).join("")}</select>
      ${categories.length ? `<select class="ws-select" id="${id}-cat"><option value="">All categories</option>${categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select>` : ""}
      <select class="ws-select" id="${id}-src"><option value="">All sources</option><option value="det">Deterministic only</option><option value="ai">AI only</option></select>
    </div>`;
  }

  // Wires filtering plus the three navigation actions on a rendered list.
  function wireList({ container, findings, id = "pg", maskEvidence = false, onExplain } = {}) {
    const listEl = container.querySelector(".pg-list");
    const q = document.getElementById(`${id}-q`);
    const sv = document.getElementById(`${id}-sev`);
    const ct = document.getElementById(`${id}-cat`);
    const sr = document.getElementById(`${id}-src`);

    function paint() {
      const text = (q?.value || "").toLowerCase();
      const wantSev = sv?.value || "";
      const wantCat = ct?.value || "";
      const wantSrc = sr?.value || "";
      const shown = findings.filter((f) => {
        if (wantSev && sev(f) !== wantSev) return false;
        if (wantCat && String(f.category || "") !== wantCat) return false;
        if (wantSrc && detectionSource(f).tone !== wantSrc) return false;
        if (text && !`${f.title} ${f.description} ${f.file} ${f.rule}`.toLowerCase().includes(text)) return false;
        return true;
      }).sort(bySeverity);
      listEl.innerHTML = shown.length
        ? shown.map((f) => findingRow(f, { maskEvidence })).join("")
        : BugWorkspace.emptyState({ title: "Nothing matches this filter", body: "Clear the filters to see the full result set." });
      const count = container.querySelector(".pg-count");
      if (count) count.textContent = `${shown.length} of ${findings.length}`;

      listEl.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => {
        const f = findings.find((x) => x.id === b.dataset.open); if (!f) return;
        BugWorkspace.openInStudio({ file: f.file, line: f.line, column: f.column, findingId: f.id });
      });
      listEl.querySelectorAll("[data-explain]").forEach((b) => b.onclick = () => {
        const f = findings.find((x) => x.id === b.dataset.explain); if (!f) return;
        if (onExplain) onExplain(f); else BugWorkspace.openInStudio({ file: f.file, line: f.line, findingId: f.id, panel: "explainer" });
      });
      listEl.querySelectorAll("[data-optimizer]").forEach((b) => b.onclick = () => {
        const f = findings.find((x) => x.id === b.dataset.optimizer); if (!f) return;
        const scan = BugWorkspace.currentScan();
        localStorage.setItem("bugai_optimizer_input", JSON.stringify({ code: scan?.sourceCode || "", filename: f.file || scan?.sourceName || "snippet", language: scan?.language || "auto", focusFinding: f.id }));
        location.href = "optimizer.html";
      });
    }
    [q, sv, ct, sr].forEach((el) => el && el.addEventListener("input", paint));
    paint();
  }

  // Page scaffold: header with title, subtitle, actions and a live count.
  function header({ title, subtitle, actions = "" }) {
    return `<div class="pg-head"><div><h2>${esc(title)}</h2><p class="ws-muted">${esc(subtitle || "")}</p></div><div class="ws-toolbar">${actions}</div></div>`;
  }

  return { esc, icon, sev, sevClass, bySeverity, counts, severityBar, findingRow, toolbar, wireList, header, detectionSource, confidencePct };
})();
window.BugPages = BugPages;
