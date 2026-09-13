document.addEventListener("DOMContentLoaded", async () => {
  if (!App.requireAuth()) return;
  const root = document.getElementById("workspace-content");
  const esc = (v) => BugWorkspace.esc(v);
  const icon = (n, c) => BugWorkspace.icon(n, c);

  // --- language icons, shared by the explorer and the editor tabs ----------
  const LANG_BY_EXT = { js: "JS", jsx: "JS", mjs: "JS", cjs: "JS", ts: "TS", tsx: "TS", py: "PY", json: "{}", md: "MD", css: "CSS", html: "<>", sql: "SQL", java: "JV", go: "GO", rs: "RS", rb: "RB", php: "PHP", sh: "SH", yml: "YML", yaml: "YML", env: "ENV" };
  const langTone = (tag) => ({ JS: "js", TS: "ts", PY: "py", "{}": "json", MD: "md", CSS: "css", "<>": "html" }[tag] || "generic");
  const fileTag = (name) => LANG_BY_EXT[String(name).split(".").pop().toLowerCase()] || "•";
  const fileIcon = (name) => { const tag = fileTag(name); return `<span class="file-ic tone-${langTone(tag)}">${esc(tag)}</span>`; };

  root.innerHTML = `
    <div class="studio8" id="studio8">
      <aside class="st-panel st-explorer" id="st-explorer">
        <div class="st-panel-head"><b>File Explorer</b><button class="st-x" id="st-explorer-close" aria-label="Hide file explorer">${icon("close")}</button></div>
        <div class="st-explorer-tools">
          <button class="st-tool" id="ex-new-file" title="New file">${icon("review")}</button>
          <button class="st-tool" id="ex-new-folder" title="New folder">${icon("folder")}</button>
          <button class="st-tool" id="ex-delete" title="Delete selected file">${icon("close")}</button>
          <button class="st-tool" id="ex-search" title="Search in explorer">${icon("search")}</button>
          <button class="st-tool" id="ex-upload" title="Upload files or a .zip">${icon("arch")}</button>
          <button class="st-tool" id="ex-export" title="Download project as ZIP">${icon("deps")}</button>
          <button class="st-tool" id="ex-refresh" title="Refresh">${icon("gauge")}</button>
        </div>
        <input class="st-filter" id="ex-filter" placeholder="Filter files…" hidden>
        <div class="st-tree" id="st-tree"><p class="ws-muted st-hint">Pick a project from the switcher above, or just paste code and press Analyze.</p></div>
      </aside>

      <section class="st-center">
        <div class="st-tabs" id="st-tabs"></div>
        <div class="st-editor" id="st-editor"></div>
        <div class="st-statusbar">
          <span id="st-pos">Ln 1, Col 1</span><span id="st-lang">plaintext</span><span title="Not detected; BUG AI reads and writes UTF-8">UTF-8</span><span title="Not detected; a fixed default">LF</span>
          <span class="st-status-note" id="st-status">Code is analyzed locally by deterministic rules; optional AI reasoning is separately labeled.</span>
        </div>
        <div class="st-bottom">
          <div class="st-bottom-tabs" role="tablist">
            <button class="st-bt active" data-bt="problems" role="tab">Problems <span class="st-count" id="st-problems-count">0</span></button>
            <button class="st-bt" data-bt="output" role="tab">Output</button>
            <button class="st-bt" data-bt="terminal" role="tab">Terminal</button>
            <button class="st-bt" data-bt="tests" role="tab">Tests</button>
          </div>
          <div class="st-bottom-body">
            <div data-bp="problems"><div class="ws-empty st-mini">Run Analyze to list problems.</div></div>
            <div data-bp="output" hidden><div class="ws-empty st-mini">Session log is empty.</div></div>
            <div data-bp="terminal" hidden><div class="ws-empty st-mini">Run Verify to execute this snippet in the sandbox.</div></div>
            <div data-bp="tests" hidden><div class="ws-empty st-mini">Generate tests to see them here.</div></div>
          </div>
        </div>
      </section>

      <aside class="st-panel st-right" id="st-right">
        <div class="st-panel-head st-right-tabs">
          <button class="st-rt active" data-rt="findings">Findings <span class="st-count" id="st-findings-count">0</span></button>
          <button class="st-rt" data-rt="assistant">AI Assistant</button>
          <button class="st-rt" data-rt="explainer">Explainer</button>
          <button class="st-rt" data-rt="report">Report</button>
          <button class="st-x" id="st-right-close" aria-label="Hide side panel">${icon("close")}</button>
        </div>
        <div class="st-right-body">
          <div data-rp="findings"><div class="ws-empty st-mini">Analyze code to show evidence-backed findings here.</div></div>
          <div data-rp="assistant" hidden>
            <div class="st-chat" id="st-chat"><div class="ws-empty st-mini">Ask about the active scan, or pick a project to ask about the whole codebase.</div></div>
            <div class="st-chat-input"><input class="ws-input" id="st-ask" placeholder="Where is authentication implemented?"><button class="ws-button primary" id="st-ask-go">Ask</button></div>
          </div>
          <div data-rp="report" hidden><div class="ws-empty st-mini">Run Fix &amp; Verify All to see the pipeline report here.</div></div>
          <div data-rp="explainer" hidden>
            <div class="st-explain-tools">
              <select class="ws-select" id="st-explain-mode"><option value="beginner">Beginner</option><option value="technical" selected>Technical</option><option value="line-by-line">Line by line</option></select>
              <button class="ws-button primary" id="st-explain-go">Explain selection</button>
            </div>
            <div id="st-explain-out"><div class="ws-empty st-mini">Select code in the editor (or explain the whole file) and press Explain.</div></div>
          </div>
        </div>
      </aside>

      <div class="st-actionbar">
        <button class="ws-button primary" id="act-analyze">${icon("studio")} Analyze</button>
        <button class="ws-button" id="act-fixall">${icon("review")} Fix All</button>
        <button class="ws-button" id="act-repair" title="Analyze, fix, rescan, compare, verify">${icon("shield")} Fix &amp; Verify All</button>
        <button class="ws-button" id="act-optimize">${icon("gauge")} Optimize</button>
        <button class="ws-button" id="act-tests">${icon("flask")} Generate Tests</button>
        <div class="ws-bell-wrap">
          <button class="ws-button" id="act-more">More ${icon("caret")}</button>
          <div class="ws-menu ws-menu-up" id="act-more-menu" hidden>
            <button type="button" id="more-verify">${icon("shield")} Verify (sandbox)</button>
            <button type="button" id="more-explain">${icon("bot")} Explain file</button>
            <button type="button" id="more-export">${icon("deps")} Export findings (JSON)</button>
            <button type="button" id="more-save">${icon("folder")} Save file to project</button>
          </div>
        </div>
      </div>
    </div>`;

  // ---------------------------------------------------------------- Monaco
  function loadMonaco() { return new Promise((resolve, reject) => { require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.49.0/min/vs" } }); require(["vs/editor/editor.main"], resolve, reject); }); }
  try { await loadMonaco(); } catch { document.getElementById("st-status").textContent = "The editor could not be loaded from the CDN. Check your connection and reload."; App.showToast("Monaco editor could not be loaded.", "error", "Editor unavailable"); return; }

  const openFiles = []; let activeIndex = -1;
  const monacoLangFor = (id) => (id && id !== "auto" ? id : "plaintext");
  const editor = monaco.editor.create(document.getElementById("st-editor"), {
    automaticLayout: true,
    theme: document.documentElement.getAttribute("data-theme") === "light" ? "vs" : "vs-dark",
    minimap: { enabled: true }, scrollBeyondLastLine: false, fontSize: 13, glyphMargin: true
  });
  new MutationObserver(() => monaco.editor.setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "vs" : "vs-dark")).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const code = () => editor.getModel()?.getValue() || "";
  const name = () => openFiles[activeIndex]?.name || "scratch.py";
  const lang = () => openFiles[activeIndex]?.language || "auto";
  const nameInputValue = () => name();

  editor.onDidChangeCursorPosition((e) => { document.getElementById("st-pos").textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`; });

  // ------------------------------------------------------ session log (Output)
  const sessionLog = [];
  function logLine(text, tone = "info") {
    sessionLog.push({ at: new Date(), text, tone });
    const box = document.querySelector("[data-bp=output]");
    box.innerHTML = `<div class="st-log">${sessionLog.map((l) => `<div class="st-log-row tone-${l.tone}"><span>${l.at.toLocaleTimeString()}</span><b>${esc(l.text)}</b></div>`).join("")}</div>`;
  }

  // ------------------------------------------------------------- tab handling
  function renderTabs() {
    const bar = document.getElementById("st-tabs");
    bar.innerHTML = openFiles.map((f, i) => `<div class="st-tab ${i === activeIndex ? "active" : ""}" data-tab="${i}" title="${esc(f.name)}">${fileIcon(f.name)}<span>${esc(f.name.split("/").pop())}</span>${f.dirty ? '<i class="st-dot" title="Unsaved changes"></i>' : ""}<button class="st-tab-x" data-close="${i}" aria-label="Close">${icon("close")}</button></div>`).join("") + `<button class="st-tab-add" id="st-tab-add" title="New untitled file">+</button>`;
    bar.querySelectorAll("[data-tab]").forEach((el) => el.onclick = (e) => { if (!e.target.closest("[data-close]")) activateTab(+el.dataset.tab); });
    bar.querySelectorAll("[data-close]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); closeTab(+el.dataset.close); });
    document.getElementById("st-tab-add").onclick = () => {
      let n = 1; while (openFiles.some((f) => f.name === `untitled-${n}.js`)) n += 1;
      openTab({ name: `untitled-${n}.js`, content: "", language: "javascript", dirty: true });
    };
  }
  function syncStatus() {
    const f = openFiles[activeIndex];
    document.getElementById("st-lang").textContent = f ? monacoLangFor(f.language) : "plaintext";
    BugWorkspace.renderBreadcrumb(f?.name || "");
  }
  function activateTab(index) {
    if (index < 0 || index >= openFiles.length) return;
    if (activeIndex >= 0 && openFiles[activeIndex]) openFiles[activeIndex].viewState = editor.saveViewState();
    activeIndex = index; editor.setModel(openFiles[index].model);
    if (openFiles[index].viewState) editor.restoreViewState(openFiles[index].viewState);
    renderTabs(); syncStatus(); paintDiagnostics(); editor.focus();
  }
  function openTab({ name: fileName, content, language, dirty }) {
    const existing = openFiles.findIndex((f) => f.name === fileName);
    if (existing >= 0) { activateTab(existing); return; }
    if (activeIndex >= 0 && openFiles[activeIndex]) openFiles[activeIndex].viewState = editor.saveViewState();
    const model = monaco.editor.createModel(String(content ?? ""), monacoLangFor(language));
    const entry = { name: fileName, language: language || "auto", model, dirty: Boolean(dirty), viewState: null, decorations: [] };
    model.onDidChangeContent(() => { if (!entry.dirty) { entry.dirty = true; renderTabs(); } });
    openFiles.push(entry); activeIndex = openFiles.length - 1;
    editor.setModel(model); clearDiagnostics(); renderTabs(); syncStatus(); editor.focus();
  }
  function closeTab(index) {
    openFiles[index].model.dispose(); openFiles.splice(index, 1);
    if (activeIndex >= openFiles.length) activeIndex = openFiles.length - 1;
    if (activeIndex >= 0) { editor.setModel(openFiles[activeIndex].model); } else { editor.setModel(null); }
    renderTabs(); syncStatus();
  }

  // ------------------------------------------------- diagnostics (markers + decorations)
  let lastScan = BugWorkspace.currentScan();
  const severityRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };
  const sevClass = (s) => String(s || "info").toLowerCase();
  function severityToMonaco(sev) { const s = String(sev || "").toUpperCase(); if (s === "CRITICAL" || s === "HIGH") return monaco.MarkerSeverity.Error; if (s === "MEDIUM") return monaco.MarkerSeverity.Warning; return monaco.MarkerSeverity.Info; }
  function clearDiagnostics() { const m = editor.getModel(); if (m) monaco.editor.setModelMarkers(m, "bugai", []); const f = openFiles[activeIndex]; if (f) f.decorations = editor.deltaDecorations(f.decorations || [], []); }
  function paintDiagnostics() {
    const model = editor.getModel(); const entry = openFiles[activeIndex];
    if (!model || !entry) return;
    const findings = (lastScan?.findings || []).filter((f) => !f.file || f.file === entry.name || openFiles.length === 1);
    monaco.editor.setModelMarkers(model, "bugai", findings.map((f) => ({
      startLineNumber: f.line || 1, startColumn: f.column || 1,
      endLineNumber: f.endLine || f.line || 1, endColumn: f.endColumn || (f.column || 1) + 1,
      message: `${f.title}: ${f.description}`, severity: severityToMonaco(f.severity)
    })));
    // Gutter dots for every finding; a tinted line only for CRITICAL/HIGH, so the
    // whole file does not read as flagged.
    entry.decorations = editor.deltaDecorations(entry.decorations || [], findings.map((f) => {
      const sev = sevClass(f.severity); const loud = ["critical", "high"].includes(sev);
      return { range: new monaco.Range(f.line || 1, 1, f.line || 1, 1), options: { glyphMarginClassName: `st-glyph st-glyph-${sev}`, glyphMarginHoverMessage: { value: `**${f.severity}** ${f.title}` }, isWholeLine: loud, className: loud ? `st-line-${sev}` : undefined } };
    }));
  }

  // --------------------------------------------------------------- explorer tree
  let projectFiles = []; let currentProjectId = BugWorkspace.selectedProject();
  const openFolders = new Set([""]);
  let selectedTreeFile = "";

  function buildTree(files) {
    const root = { name: "", type: "folder", children: {} };
    for (const file of files) {
      const parts = String(file.name).split("/");
      let node = root;
      parts.forEach((part, i) => {
        const isFile = i === parts.length - 1;
        node.children[part] ||= isFile ? { name: part, path: file.name, type: "file", language: file.language } : { name: part, path: parts.slice(0, i + 1).join("/"), type: "folder", children: {} };
        node = node.children[part];
      });
    }
    return root;
  }
  function renderNode(node, depth) {
    return Object.values(node.children).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1)).map((child) => {
      if (child.type === "folder") {
        const open = openFolders.has(child.path);
        return `<div class="tree-row folder" data-folder="${esc(child.path)}" style="--d:${depth}"><span class="tree-caret ${open ? "open" : ""}">${icon("chevron")}</span>${icon("folder")}<span>${esc(child.name)}</span></div>` + (open ? renderNode(child, depth + 1) : "");
      }
      return `<div class="tree-row file ${selectedTreeFile === child.path ? "selected" : ""}" data-file="${esc(child.path)}" style="--d:${depth}">${fileIcon(child.name)}<span>${esc(child.name)}</span></div>`;
    }).join("");
  }
  function renderTree() {
    const box = document.getElementById("st-tree");
    if (!projectFiles.length) { box.innerHTML = `<p class="ws-muted st-hint">Pick a project from the switcher above, or just paste code and press Analyze.</p>`; return; }
    const filter = document.getElementById("ex-filter").value.trim().toLowerCase();
    const visible = filter ? projectFiles.filter((f) => f.name.toLowerCase().includes(filter)) : projectFiles;
    const projectName = document.getElementById("ws-project-label")?.textContent || "Project";
    box.innerHTML = `<div class="tree-row folder root" data-folder="" style="--d:0"><span class="tree-caret ${openFolders.has("") ? "open" : ""}">${icon("chevron")}</span>${icon("folder")}<span>${esc(projectName)}</span></div>` + (openFolders.has("") ? renderNode(buildTree(visible), 1) : "");
    window.BugStudioFiles = projectFiles.map((f) => f.name);
    box.querySelectorAll("[data-folder]").forEach((el) => el.onclick = () => { const p = el.dataset.folder; openFolders.has(p) ? openFolders.delete(p) : openFolders.add(p); renderTree(); });
    box.querySelectorAll("[data-file]").forEach((el) => el.onclick = () => {
      const file = projectFiles.find((f) => f.name === el.dataset.file); if (!file) return;
      selectedTreeFile = file.name;
      openTab({ name: file.name, content: file.content, language: file.language || "auto" });
      BugWorkspace.setContext({ file: file.name });
      renderTree();
    });
  }
  async function loadProjectFiles(id) {
    currentProjectId = id;
    if (!id) { projectFiles = []; renderTree(); return; }
    try {
      projectFiles = (await App.api(`/projects/${id}/files`)).files || [];
      // Expand every folder that has content so the tree is useful immediately.
      projectFiles.forEach((f) => { const parts = f.name.split("/"); parts.slice(0, -1).forEach((_, i) => openFolders.add(parts.slice(0, i + 1).join("/"))); });
      renderTree();
    } catch (error) { App.showToast(error.message, "error", "Could not load files"); }
  }

  document.getElementById("ex-refresh").onclick = () => loadProjectFiles(currentProjectId);
  document.getElementById("ex-search").onclick = () => { const f = document.getElementById("ex-filter"); f.hidden = !f.hidden; if (!f.hidden) f.focus(); else { f.value = ""; renderTree(); } };
  document.getElementById("ex-filter").oninput = renderTree;
  document.getElementById("ex-new-file").onclick = () => {
    const fileName = prompt("New file path (e.g. src/new.js)"); if (!fileName) return;
    openTab({ name: fileName, content: "", language: "auto", dirty: true });
    App.showToast("Created in the editor only. Use Save file to persist it.", "info", "Unsaved");
  };
  document.getElementById("ex-new-folder").onclick = () => {
    const folder = prompt("New folder path (e.g. src/utils)"); if (!folder) return;
    openFolders.add(folder);
    openTab({ name: `${folder.replace(/\/$/, "")}/untitled.js`, content: "", language: "javascript", dirty: true });
    App.showToast("Folders exist once a file inside them is saved.", "info", "Folder");
  };
  document.getElementById("ex-delete").onclick = () => {
    // The API exposes project deletion but no per-file delete: PUT /files only
    // creates or overwrites. Closing the tab is all that can honestly be done
    // here — pretending otherwise would blank the stored file instead.
    if (!selectedTreeFile) return App.showToast("Select a file in the tree first.", "warning", "Nothing selected");
    const openIndex = openFiles.findIndex((f) => f.name === selectedTreeFile);
    if (openIndex >= 0) closeTab(openIndex);
    logLine(`Closed ${selectedTreeFile} in the editor; the stored file is unchanged`, "warn");
    App.showToast("Closed in the editor. The API has no per-file delete, so the stored file is unchanged — delete the whole project from Projects.", "warning", "Not deleted on the server");
  };
  // Export the stored project as a real zip via GET /projects/:id/export. The
  // token has to travel in a header, so this cannot be a plain <a href>.
  document.getElementById("ex-export").onclick = async () => {
    if (!currentProjectId) return App.showToast("Open a project first.", "warning", "Nothing to export");
    try {
      const response = await fetch(`/api/projects/${currentProjectId}/export`, { headers: { Authorization: `Bearer ${localStorage.getItem("bugzero_token")}` } });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Export failed");
      const name = (response.headers.get("content-disposition") || "").match(/filename="([^"]+)"/)?.[1] || "project.zip";
      const a = document.createElement("a"); a.href = URL.createObjectURL(await response.blob()); a.download = name; a.click(); URL.revokeObjectURL(a.href);
      logLine(`Exported ${name}`, "ok");
    } catch (error) { App.showToast(error.message, "error", "Export failed"); }
  };

  // Upload: individual files are added to the stored project one PUT each;
  // a .zip goes to the server-side importer and becomes a new project.
  const uploadInput = document.createElement("input");
  uploadInput.type = "file"; uploadInput.multiple = true; uploadInput.accept = ".zip,application/zip,text/*,.js,.ts,.py,.java,.go,.rs,.rb,.php,.c,.cpp,.cs,.kt,.swift,.sql,.sh,.html,.css,.json,.md,.yml,.yaml,.toml";
  uploadInput.hidden = true; document.body.appendChild(uploadInput);
  document.getElementById("ex-upload").onclick = () => { uploadInput.value = ""; uploadInput.click(); };
  uploadInput.onchange = async () => {
    const files = [...uploadInput.files]; if (!files.length) return;
    const zip = files.find((f) => /\.zip$/i.test(f.name));
    try {
      if (zip) {
        const archive = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(zip); });
        const result = await App.api("/projects/import-zip", { method: "POST", body: { name: zip.name.replace(/\.zip$/i, ""), archive } });
        BugWorkspace.setContext({ projectId: result.project.id, file: "" }); BugWorkspace.cacheClear("projects");
        logLine(`Imported ${zip.name}: ${result.import.filesKept} file(s) kept`, "ok");
        App.showToast(`${result.import.filesKept} file(s) imported as "${result.project.name}".`, "success", "ZIP imported");
        window.dispatchEvent(new CustomEvent("bugai:project", { detail: { projectId: result.project.id } }));
        return;
      }
      if (!currentProjectId) { for (const f of files) openTab({ name: f.name, content: await f.text(), language: "auto", dirty: true }); return App.showToast("Opened in the editor only. Select a project to store files.", "info", "No project"); }
      for (const f of files.slice(0, 50)) await App.api(`/projects/${currentProjectId}/files`, { method: "PUT", body: { name: f.webkitRelativePath || f.name, content: (await f.text()).slice(0, 200000) } });
      logLine(`Uploaded ${files.length} file(s) to the project`, "ok");
      await loadProjectFiles(currentProjectId);
    } catch (error) { App.showToast(error.message, "error", "Upload failed"); }
  };
  function download(filename, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = filename; a.click(); URL.revokeObjectURL(a.href);
  }

  document.getElementById("st-explorer-close").onclick = () => document.getElementById("studio8").classList.toggle("no-explorer");
  document.getElementById("st-right-close").onclick = () => document.getElementById("studio8").classList.toggle("no-right");

  // ------------------------------------------------------------- panel switching
  document.querySelectorAll(".st-bt").forEach((tab) => tab.onclick = () => {
    document.querySelectorAll(".st-bt").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll("[data-bp]").forEach((p) => p.hidden = p.dataset.bp !== tab.dataset.bt);
  });
  const showRight = (which) => {
    document.querySelectorAll(".st-rt").forEach((t) => t.classList.toggle("active", t.dataset.rt === which));
    document.querySelectorAll("[data-rp]").forEach((p) => p.hidden = p.dataset.rp !== which);
  };
  document.querySelectorAll(".st-rt").forEach((tab) => tab.onclick = () => showRight(tab.dataset.rt));

  // --------------------------------------------------------------- findings UI
  let selectedFindingId = null;
  function findingDetail(f) {
    const sev = sevClass(f.severity);
    const evidence = Array.isArray(f.evidence) ? f.evidence.join("\n") : (f.whyItHappens || "");
    const impact = String(f.impact || "").trim();
    const hasFix = Boolean(String(f.suggestedFix || "").trim());
    return `<article class="fcard">
      <header><span class="fcard-ic tone-${sev}">${icon("shield")}</span><h3>${esc(f.title)}</h3><span class="ws-badge ${sev}">${esc(f.severity)}</span></header>
      <div class="fcard-meta"><span>${icon("clock")} ${esc(f.file || "snippet")}:${f.line || "?"}</span><span class="ws-badge">${esc(f.category || "quality")}</span><span class="ws-badge">${esc(f.source || "deterministic")}</span></div>
      <h4>Description</h4><p>${esc(f.description || f.explanation || f.title)}</p>
      ${evidence ? `<h4>Evidence</h4><pre class="ws-code">${esc(evidence)}</pre>` : ""}
      ${impact ? `<h4>Impact</h4><ul><li>${esc(impact)}</li></ul>` : ""}
      <h4>Recommendation</h4><p>${esc(f.recommendation || f.fix || "Review the affected code.")}</p>
      ${hasFix ? `<h4>Suggested Fix</h4><pre class="ws-code ws-code-ok">${esc(f.suggestedFix)}</pre>
      <div class="fcard-actions"><button class="ws-button primary" data-apply="${esc(f.id)}">${icon("review")} Apply Fix</button><button class="ws-button" data-optimize="${esc(f.id)}">${icon("gauge")} View in Optimizer</button></div>` : ""}
      <details class="fcard-more"><summary>${icon("deps")} Additional Information ${icon("chevron")}</summary>
        <p class="ws-muted">Rule ${esc(f.rule || "n/a")} · confidence ${Math.round(Number(f.confidence || 0) * (Number(f.confidence || 0) <= 1 ? 100 : 1))}% (${esc(f.confidenceLevel || "n/a")})</p>
        <p class="ws-muted">${esc(f.confidenceReason || "No confidence rationale recorded.")}</p>
        ${(f.references || []).length ? `<p class="ws-muted">References: ${(f.references || []).map(esc).join(", ")}</p>` : ""}
        ${hasFix ? "" : `<p class="ws-muted">No mechanical or AI fix is available for this finding, so no patch is offered.</p>`}
      </details>
    </article>`;
  }
  function showFinding(id) {
    const f = (lastScan?.findings || []).find((x) => x.id === id); if (!f) return;
    selectedFindingId = id;
    document.querySelector("[data-rp=findings]").innerHTML = findingDetail(f);
    showRight("findings");
    wireFindingActions(f);
  }
  function wireFindingActions(f) {
    const panel = document.querySelector("[data-rp=findings]");
    panel.querySelector("[data-apply]")?.addEventListener("click", () => applyFixToBuffer(f));
    panel.querySelector("[data-optimize]")?.addEventListener("click", () => {
      localStorage.setItem("bugai_optimizer_input", JSON.stringify({ code: code(), filename: name(), language: lang() }));
      location.href = "optimizer.html";
    });
  }
  function renderFindings(scan) {
    lastScan = scan;
    const findings = scan?.findings || [];
    document.getElementById("st-findings-count").textContent = String(findings.length);
    document.getElementById("st-problems-count").textContent = String(findings.length);
    // Problems table
    document.querySelector("[data-bp=problems]").innerHTML = findings.length ? `<table class="st-problems"><thead><tr><th>Severity</th><th>Message</th><th>File</th><th>Line</th><th>Category</th></tr></thead><tbody>${findings.map((f) => `<tr data-prob="${esc(f.id)}"><td><span class="sev sev-${sevClass(f.severity)}">${icon("shield")}${esc(f.severity)}</span></td><td><b>${esc(f.title)}</b><small>${esc(String(f.description || "").slice(0, 70))}${String(f.description || "").length > 70 ? "…" : ""}</small></td><td>${esc(f.file || "snippet")}</td><td>${f.line || "?"}</td><td>${esc(f.category || "quality")}</td></tr>`).join("")}</tbody></table>` : `<div class="ws-empty st-mini">No detected issues from available checks.</div>`;
    document.querySelectorAll("[data-prob]").forEach((row) => row.onclick = () => {
      const f = findings.find((x) => x.id === row.dataset.prob); if (!f) return;
      const target = openFiles.findIndex((o) => o.name === f.file);
      if (target >= 0 && target !== activeIndex) activateTab(target);
      editor.revealLineInCenter(f.line || 1); editor.setPosition({ lineNumber: f.line || 1, column: f.column || 1 }); editor.focus();
      showFinding(f.id);
    });
    // Default selection: highest severity, first on a tie.
    if (findings.length) {
      const best = findings.reduce((a, b) => (severityRank[String(b.severity).toUpperCase()] || 0) > (severityRank[String(a.severity).toUpperCase()] || 0) ? b : a);
      showFinding(best.id);
    } else {
      document.querySelector("[data-rp=findings]").innerHTML = `<div class="ws-empty st-mini">No detected issues from available checks.</div>`;
    }
    paintDiagnostics();
  }

  function applyFixToBuffer(f, silent) {
    const model = editor.getModel(); if (!model) return false;
    const fix = String(f.suggestedFix || "").trim(); if (!fix) return false;
    const line = f.line || 1;
    model.pushEditOperations([], [{ range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)), text: fix }], () => null);
    const entry = openFiles[activeIndex]; if (entry) { entry.dirty = true; renderTabs(); }
    logLine(`Fix applied in buffer: ${f.title} (line ${line}) — not saved`, "warn");
    if (!silent) App.showToast("Applied to the editor buffer only. Use More › Save file to persist.", "info", "Proposal applied");
    return true;
  }

  // ------------------------------------------------------------------ actions
  async function analyze() {
    const status = document.getElementById("st-status");
    status.textContent = "Analyzing…"; logLine("Analyze started");
    try {
      const scan = await App.api("/scan-code", { method: "POST", body: { code: code(), filename: name(), language: lang() } });
      BugWorkspace.setContext({ file: name(), scan });
      if (lang() === "auto" && scan.language && editor.getModel()) monaco.editor.setModelLanguage(editor.getModel(), monacoLangFor(scan.language));
      renderFindings(scan); syncStatus();
      status.textContent = `Completed: ${scan.summary.totalFindings} findings · ${scan.verification.status.replaceAll("_", " ")}. Code is analyzed locally by deterministic rules; optional AI reasoning is separately labeled.`;
      logLine(`Analyze completed — ${scan.summary.totalFindings} findings`, "ok");
      BugWorkspace.refreshNotificationBadge();
    } catch (error) { status.textContent = error.message; logLine(`Analyze failed: ${error.message}`, "bad"); App.showToast(error.message, "error", "Analysis failed"); }
  }

  document.getElementById("act-analyze").onclick = analyze;

  document.getElementById("act-fixall").onclick = async () => {
    logLine("Fix All requested");
    try {
      const out = await App.api("/fix", { method: "POST", body: { code: code(), filename: name(), language: lang() } });
      logLine(`Fix All: AI status ${out.aiStatus || "n/a"}, ${out.fixes.length} candidate(s)`);
      if (!out.fixes.length) return App.showToast("No applicable fixes were proposed.", "warning", "Nothing to apply");
      const byId = new Map((lastScan?.findings || []).map((f) => [f.id, f]));
      let applied = 0, review = 0;
      for (const fix of out.fixes) {
        const finding = byId.get(fix.findingId) || { id: fix.findingId, title: fix.findingId, line: (byId.get(fix.findingId)?.line) || 1 };
        const candidate = { ...finding, suggestedFix: fix.suggestedFix };
        if (fix.source === "deterministic") { if (applyFixToBuffer(candidate, true)) applied += 1; }
        else {
          // AI proposals are unverified: confirm each one individually.
          review += 1;
          if (confirm(`AI-proposed fix for "${finding.title}":\n\n${fix.suggestedFix}\n\nApply to the buffer? (nothing is saved)`)) { if (applyFixToBuffer(candidate, true)) { applied += 1; review -= 1; } }
        }
      }
      App.showToast(`${applied} applied to the buffer, ${review} left for manual review. Nothing saved.`, "info", "Fix All");
      logLine(`Fix All: ${applied} applied, ${review} declined/manual`, "warn");
    } catch (error) { logLine(`Fix All failed: ${error.message}`, "bad"); App.showToast(error.message, "error", "Fix failed"); }
  };

  // Fix & Verify All: the whole pipeline server-side, then a report the user can
  // inspect modification by modification before deciding to take the candidate.
  document.getElementById("act-repair").onclick = async () => {
    const pane = document.querySelector("[data-rp=report]");
    showRight("report");
    pane.innerHTML = `<p class="ws-muted st-mini">Running analyze → prioritise → fix → rescan → compare → verify…</p>`;
    logLine("Fix & Verify All started");
    try {
      const r = await App.api("/repair", { method: "POST", body: { code: code(), filename: name(), language: lang(), applyAiFixes: false } });
      const s = r.summary;
      const verdictTone = r.verdict === "VERIFIED_STATIC_AND_TESTS" ? "ok" : r.verdict === "NOTHING_TO_FIX" ? "ok" : r.verdict === "REJECTED" || r.verdict === "FAILED" || r.verdict === "TESTS_FAILED" ? "bad" : "warn";
      const tests = r.tests || {};
      pane.innerHTML = `
        <div class="rp-verdict tone-${verdictTone}"><b>${esc(String(r.verdict).replaceAll("_", " "))}</b><span>${esc(r.note || "")}</span></div>
        <div class="rp-grid">
          <div><small>Detected</small><b>${s.detected}</b></div>
          <div><small>Fixed</small><b class="ok">${s.fixed}</b></div>
          <div><small>Remaining</small><b>${s.remaining}</b></div>
          <div><small>Needs review</small><b class="warn">${s.requiresReview}</b></div>
          <div><small>Introduced</small><b class="${s.introduced ? "bad" : ""}">${s.introduced}</b></div>
          <div><small>Tests</small><b class="${tests.status === "ran" && tests.suitesFailed ? "bad" : ""}">${tests.status === "ran" ? `${tests.suitesPassed}/${tests.suites} suites` : esc(String(tests.status || "not run").replaceAll("_", " "))}</b></div>
        </div>
        ${tests.status !== "ran" && tests.reason ? `<p class="ws-muted st-mini" style="padding:0 0 8px">Tests: ${esc(tests.reason)}</p>` : ""}
        ${tests.status === "ran" ? `<ul class="rp-list" style="margin-bottom:8px">${(tests.results || []).map((t) => `<li><span class="ws-badge ${t.status === "passed" ? "low" : "high"}">${esc(String(t.status).replaceAll("_", " "))}</span> ${esc(t.name)}${(t.failures || []).length ? ` <small class="ws-muted">— ${esc(String(t.failures[0].detail || t.failures[0].test).split(String.fromCharCode(10))[0].slice(0, 90))}</small>` : ""}</li>`).join("")}</ul>` : ""}
        <h4>Pipeline</h4>
        <ol class="rp-steps">${(r.steps || []).map((st) => `<li class="st-${esc(st.status)}"><b>${esc(st.name)}</b> <span class="ws-badge">${esc(st.status)}</span><small>${esc(st.detail || "")}</small></li>`).join("")}</ol>
        ${(r.attempts || []).length > 1 ? `<p class="ws-muted st-mini" style="padding:0">${r.attempts.length} attempt(s): ${r.attempts.map((a) => `round ${a.round} ${a.accepted ? "accepted" : "rejected"} (${a.fixesTried} fix(es), ${a.introduced} introduced${a.syntaxBroken ? ", syntax broken" : ""})`).join("; ")}</p>` : ""}
        <h4>Modifications <span class="ws-badge">${r.modifications.length}</span></h4>
        ${r.modifications.length ? r.modifications.map((m) => `<article class="rp-mod"><header><span class="ws-badge ${sevClass(m.severity)}">${esc(m.severity)}</span><b>${esc(m.title)}</b><span class="ws-badge">${esc(m.source)}</span><button class="pg-link" data-goline="${m.line}">line ${m.line}</button></header><div class="op-line del">- ${esc(m.before)}</div><div class="op-line add">+ ${esc(m.after)}</div>${m.explanation ? `<p class="ws-muted">${esc(m.explanation)}</p>` : ""}</article>`).join("") : `<p class="ws-muted st-mini" style="padding:0">No modification was applied.</p>`}
        ${r.requiresReview.length ? `<h4>Requires review <span class="ws-badge">${r.requiresReview.length}</span></h4>${r.requiresReview.map((m) => `<article class="rp-mod review"><header><span class="ws-badge ${sevClass(m.severity)}">${esc(m.severity)}</span><b>${esc(m.title)}</b><span class="ws-badge">${esc(m.source)}</span><button class="pg-link" data-goline="${m.line}">line ${m.line}</button></header><pre class="ws-code">${esc(m.suggestedFix)}</pre><p class="ws-muted">${esc(m.explanation || "AI proposal, not verified.")}</p></article>`).join("")}` : ""}
        ${r.remaining.length ? `<h4>Still open <span class="ws-badge">${r.remaining.length}</span></h4><ul class="rp-list">${r.remaining.map((f) => `<li><span class="ws-badge ${sevClass(f.severity)}">${esc(f.severity)}</span> ${esc(f.title)} <button class="pg-link" data-goline="${f.line}">line ${f.line}</button></li>`).join("")}</ul>` : ""}
        ${r.introduced.length ? `<h4 class="bad">Introduced by the candidate <span class="ws-badge high">${r.introduced.length}</span></h4><ul class="rp-list">${r.introduced.map((f) => `<li><span class="ws-badge ${sevClass(f.severity)}">${esc(f.severity)}</span> ${esc(f.title)} <button class="pg-link" data-goline="${f.line}">line ${f.line}</button></li>`).join("")}</ul>` : ""}
        <div class="fcard-actions">${r.changed ? `<button class="ws-button primary" id="rp-take">Load candidate into editor</button>` : ""}<button class="ws-button" id="rp-verify">Verification detail</button></div>
        <div id="rp-verify-out" hidden></div>`;
      pane.querySelectorAll("[data-goline]").forEach((b) => b.onclick = () => { const l = Number(b.dataset.goline) || 1; editor.revealLineInCenter(l); editor.setPosition({ lineNumber: l, column: 1 }); editor.focus(); });
      pane.querySelector("#rp-take")?.addEventListener("click", () => {
        const model = editor.getModel(); if (!model) return;
        model.pushEditOperations([], [{ range: model.getFullModelRange(), text: r.code }], () => null);
        const entry = openFiles[activeIndex]; if (entry) { entry.dirty = true; renderTabs(); }
        logLine(`Loaded the Fix & Verify candidate into ${name()} (unsaved)`, "warn");
        App.showToast("Candidate loaded into the buffer. Not saved to the project.", "info", "Loaded");
      });
      pane.querySelector("#rp-verify").onclick = () => {
        const box = pane.querySelector("#rp-verify-out"); box.hidden = !box.hidden; if (!box.hidden) {
          const v = r.verification || {};
          box.innerHTML = `<table class="st-problems"><thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead><tbody>${Object.entries(v).filter(([, val]) => val && typeof val === "object" && "status" in val).map(([k, val]) => `<tr><td>${esc(k)}</td><td>${esc(String(val.status).replaceAll("_", " "))}</td><td>${esc(val.reason || val.source || "")}</td></tr>`).join("")}</tbody></table><p class="ws-muted st-mini">Not available is not a pass.</p>`;
        }
      };
      logLine(`Fix & Verify All: ${r.verdict} — detected ${s.detected}, fixed ${s.fixed}, remaining ${s.remaining}, review ${s.requiresReview}, introduced ${s.introduced}`, verdictTone === "bad" ? "bad" : verdictTone === "warn" ? "warn" : "ok");
    } catch (error) { pane.innerHTML = `<div class="ws-empty st-mini">${esc(error.message)}</div>`; logLine(`Fix & Verify All failed: ${error.message}`, "bad"); }
  };

  document.getElementById("act-optimize").onclick = () => {
    localStorage.setItem("bugai_optimizer_input", JSON.stringify({ code: code(), filename: name(), language: lang() }));
    logLine("Optimize: handed off to the Optimizer page");
    location.href = "optimizer.html";
  };

  document.getElementById("act-tests").onclick = async () => {
    document.querySelector("[data-bt=tests]").click();
    const box = document.querySelector("[data-bp=tests]");
    box.innerHTML = `<p class="ws-muted st-mini">Generating…</p>`; logLine("Generate tests requested");
    try {
      const out = await App.api("/test/generate", { method: "POST", body: { code: code(), filename: name(), language: lang() } });
      box.innerHTML = window.renderGeneratedTests(out, esc);
      logLine(`Tests: ${out.status}${out.framework ? ` (${out.framework})` : ""}`, out.status === "generated" ? "ok" : "warn");
    } catch (error) { box.innerHTML = `<div class="ws-empty st-mini">${esc(error.message)}</div>`; logLine(`Tests failed: ${error.message}`, "bad"); }
  };

  document.getElementById("act-more").onclick = () => { const m = document.getElementById("act-more-menu"); m.hidden = !m.hidden; };
  document.getElementById("more-verify").onclick = async () => {
    document.getElementById("act-more-menu").hidden = true;
    document.querySelector("[data-bt=terminal]").click();
    const box = document.querySelector("[data-bp=terminal]");
    box.innerHTML = `<p class="ws-muted st-mini">Running verification…</p>`; logLine("Verify requested");
    try {
      const out = await App.api("/verify", { method: "POST", body: { code: code(), filename: name(), language: lang() } });
      const ev = out.executionVerification || { status: "not_available", reason: "No execution result was returned." };
      box.innerHTML = ev.status === "completed"
        ? `<pre class="st-term"><span class="st-term-meta">exit ${ev.exitCode}${ev.timedOut ? " · timed out" : ""} · ${esc(ev.isolation || "sandbox")}</span>${esc(ev.stdout || "")}${ev.stderr ? `<span class="st-term-err">${esc(ev.stderr)}</span>` : ""}</pre><p class="ws-muted st-mini">${esc(ev.note || "")}</p>`
        : `<div class="ws-empty st-mini"><b>Sandbox execution is disabled</b><p>${esc(ev.reason || "Not available.")}</p></div>`;
      logLine(`Verify: execution ${ev.status}`, ev.status === "completed" ? "ok" : "warn");
    } catch (error) { box.innerHTML = `<div class="ws-empty st-mini">${esc(error.message)}</div>`; logLine(`Verify failed: ${error.message}`, "bad"); }
  };
  document.getElementById("more-explain").onclick = () => { document.getElementById("act-more-menu").hidden = true; showRight("explainer"); runExplain(true); };
  document.getElementById("more-export").onclick = () => {
    document.getElementById("act-more-menu").hidden = true;
    if (!lastScan) return App.showToast("Run Analyze first.", "warning", "Nothing to export");
    download(`${name().replace(/[^\w.-]/g, "_")}-findings.json`, JSON.stringify(lastScan.findings || [], null, 2));
  };
  document.getElementById("more-save").onclick = async () => {
    document.getElementById("act-more-menu").hidden = true;
    const id = BugWorkspace.selectedProject();
    if (!id) return App.showToast("Select a project in the switcher first.", "warning", "No project");
    try {
      await App.api(`/projects/${id}/files`, { method: "PUT", body: { name: name(), content: code() } });
      const entry = openFiles[activeIndex]; if (entry) { entry.dirty = false; renderTabs(); }
      BugWorkspace.setContext({ file: name() });
      logLine(`Saved ${name()} to the project`, "ok");
      App.showToast("File saved to the selected project.");
      await loadProjectFiles(id);
    } catch (error) { App.showToast(error.message, "error", "Save failed"); }
  };

  // ----------------------------------------------------------------- assistant
  const chat = [];
  document.getElementById("st-ask-go").onclick = async () => {
    const input = document.getElementById("st-ask"); const question = input.value.trim(); if (!question) return;
    chat.push({ who: "you", text: question }); input.value = ""; paintChat("Thinking…");
    try {
      const out = await App.askAssistant(question, lastScan?.id, BugWorkspace.selectedProject());
      chat.push({ who: "ai", text: out.reply, source: out.source, refs: out.referencedFiles || [] });
      logLine(`Assistant answered (${out.source})`, out.source === "ai" ? "ok" : "warn");
    } catch (error) { chat.push({ who: "ai", text: error.message, source: "error", refs: [] }); logLine(`Assistant failed: ${error.message}`, "bad"); }
    paintChat();
  };
  document.getElementById("st-ask").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("st-ask-go").click(); });
  function paintChat(pending) {
    const box = document.getElementById("st-chat");
    box.innerHTML = chat.map((m) => m.who === "you"
      ? `<div class="msg you"><b>You</b><p>${esc(m.text)}</p></div>`
      : `<div class="msg ai"><b>BUG AI <span class="ws-badge">${esc(m.source === "ai" ? "AI · project-aware" : m.source === "error" ? "error" : "rule-based · latest scan")}</span></b><p>${esc(m.text)}</p>${m.refs.length ? `<p class="ws-muted">Referenced: ${m.refs.map(esc).join(", ")}</p>` : ""}</div>`).join("")
      + (pending ? `<div class="msg ai"><p class="ws-muted">${esc(pending)}</p></div>` : "");
    box.scrollTop = box.scrollHeight;
  }

  // ----------------------------------------------------------------- explainer
  async function runExplain(wholeFile) {
    const out = document.getElementById("st-explain-out");
    const sel = editor.getModel()?.getValueInRange(editor.getSelection()) || "";
    const selection = wholeFile ? "" : sel;
    out.innerHTML = `<p class="ws-muted st-mini">Explaining ${selection ? "selection" : "whole file"}…</p>`;
    logLine(`Explain requested (${document.getElementById("st-explain-mode").value})`);
    try {
      const res = await App.api("/explain", { method: "POST", body: { code: code(), filename: name(), language: lang(), selection, mode: document.getElementById("st-explain-mode").value } });
      out.innerHTML = res.status === "completed"
        ? `<article class="fcard"><header><h3>Explanation</h3><span class="ws-badge">${esc(res.mode)} · ${esc(res.scope)}</span></header><p>${esc(res.explanation)}</p>${(res.keyPoints || []).length ? `<h4>Key points</h4><ul>${res.keyPoints.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>` : ""}<p class="ws-muted">${esc(res.note || "")}</p></article>`
        : `<div class="ws-empty st-mini"><b>${esc(res.status)}</b><p>${esc(res.reason || "Explanation is not available.")}</p></div>`;
      logLine(`Explain: ${res.status}`, res.status === "completed" ? "ok" : "warn");
    } catch (error) { out.innerHTML = `<div class="ws-empty st-mini">${esc(error.message)}</div>`; logLine(`Explain failed: ${error.message}`, "bad"); }
  }
  document.getElementById("st-explain-go").onclick = () => runExplain(false);

  // -------------------------------------------------------------------- wiring
  window.addEventListener("bugai:project", (e) => loadProjectFiles(e.detail.projectId));
  window.addEventListener("bugai:jump", (e) => {
    const hit = e.detail;
    if (hit.kind === "file") { const file = projectFiles.find((f) => f.name === hit.label); if (file) openTab({ name: file.name, content: file.content, language: file.language }); }
    else if (hit.line) { editor.revealLineInCenter(hit.line); editor.setPosition({ lineNumber: hit.line, column: 1 }); editor.focus(); }
  });

  openTab({ name: "scratch.py", content: "def example(value):\n    return eval(value) / 0", language: "auto" });
  if (currentProjectId) await loadProjectFiles(currentProjectId);
  if (lastScan?.findings) renderFindings(lastScan);

  // Deep link from any other page: ?file=src/auth.js&line=42&finding=<id>
  const params = new URLSearchParams(location.search);
  const wantedFile = params.get("file");
  const wantedLine = Number(params.get("line")) || 0;
  const wantedColumn = Number(params.get("column")) || 1;
  const wantedFinding = params.get("finding");
  if (wantedFile) {
    const known = projectFiles.find((f) => f.name === wantedFile);
    if (known) { selectedTreeFile = known.name; openTab({ name: known.name, content: known.content, language: known.language || "auto" }); renderTree(); }
    else App.showToast(`${wantedFile} is not in the open project.`, "warning", "File not found");
  }
  if (wantedLine) {
    editor.revealLineInCenter(wantedLine);
    editor.setPosition({ lineNumber: wantedLine, column: wantedColumn });
    editor.focus();
  }
  if (wantedFinding && lastScan?.findings?.some((f) => f.id === wantedFinding)) showFinding(wantedFinding);
  // Applied last: the default finding selection above would otherwise switch
  // the panel back to Findings and swallow a ?panel= deep link.
  const wantedPanel = params.get("panel");
  if (wantedPanel && document.querySelector(`[data-rt="${wantedPanel}"]`)) showRight(wantedPanel);
});
