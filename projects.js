document.addEventListener("DOMContentLoaded", async () => {
  if (!App.requireAuth()) return;
  const root = document.getElementById("workspace-content");
  const esc = BugWorkspace.esc;
  const icon = (n, c) => BugWorkspace.icon(n, c);

  root.innerHTML = BugPages.header({ title: "Projects", subtitle: "Create, import, open, analyze and export stored projects.", actions: '<button class="ws-button" id="refresh">Refresh</button>' })
  + '<div class="ws-grid cols-3">'
  + '<section class="ws-card"><h3>' + icon("folder") + ' Create from files</h3><p class="ws-muted">Select files or a folder. Dependency and generated directories are skipped.</p>'
  + '<input class="ws-input" id="project-name" value="My project" aria-label="Project name"><input class="ws-input" id="project-files" type="file" multiple webkitdirectory style="margin-top:10px">'
  + '<div class="ws-toolbar" style="margin-top:12px"><button class="ws-button primary" id="create-project">Create project</button></div></section>'
  + '<section class="ws-card"><h3>' + icon("deps") + ' Upload ZIP</h3><p class="ws-muted">A .zip is unpacked on the server. Binary files, unsafe paths and ignored directories are dropped and reported.</p>'
  + '<input class="ws-input" id="zip-name" placeholder="Project name (defaults to the file name)"><input class="ws-input" id="zip-file" type="file" accept=".zip,application/zip" style="margin-top:10px">'
  + '<div class="ws-toolbar" style="margin-top:12px"><button class="ws-button primary" id="import-zip">Import ZIP</button></div><p id="zip-status" class="ws-muted"></p></section>'
  + '<section class="ws-card"><h3>' + icon("git") + ' Import from GitHub</h3><p class="ws-muted">Public repositories only, read-only. The default branch is fetched with the same caps as GitHub scanning.</p>'
  + '<input class="ws-input" id="gh-url" placeholder="https://github.com/owner/repository"><input class="ws-input" id="gh-name" placeholder="Project name (defaults to owner/repo)" style="margin-top:10px">'
  + '<div class="ws-toolbar" style="margin-top:12px"><button class="ws-button primary" id="import-github">Import repository</button></div><p id="gh-status" class="ws-muted"></p></section>'
  + "</div>"
  + '<section class="ws-card" style="margin-top:16px"><h3>Selected project</h3><div id="project-detail" class="ws-empty">Choose a project below.</div></section>'
  + '<section class="ws-card" style="margin-top:16px"><h3>All projects</h3><div id="projects-list" class="ws-empty">Loading…</div></section>';

  const importSummary = (imp) => {
    if (!imp) return "";
    const skipped = imp.skipped ? Object.entries(imp.skipped).filter(([, n]) => n > 0).map(([k, n]) => n + " " + k.replace(/([A-Z])/g, " $1").toLowerCase()).join(", ") : "";
    return imp.filesKept + " file(s) kept" + (imp.entriesInArchive !== undefined ? " of " + imp.entriesInArchive + " archive entries" : imp.filesFetched !== undefined ? " of " + imp.filesFetched + " fetched" : "") + (skipped ? " · skipped: " + skipped : "") + ".";
  };

  async function render() {
    let projects;
    try { projects = await BugWorkspace.loadProjects(); } catch (error) { document.getElementById("projects-list").innerHTML = BugWorkspace.emptyState({ title: "Could not load projects", body: error.message }); return; }
    document.getElementById("projects-list").classList.toggle("ws-empty", !projects.length);
    document.getElementById("projects-list").innerHTML = projects.length
      ? '<table class="ws-table"><thead><tr><th>Name</th><th>Languages</th><th>Files</th><th>Last analysis</th><th></th></tr></thead><tbody>' + projects.map((p) => "<tr" + (p.id === BugWorkspace.selectedProject() ? ' class="selected-row"' : "") + "><td>" + esc(p.name) + "</td><td>" + esc(p.languages.join(", ") || "Unknown") + "</td><td>" + p.fileCount + "</td><td>" + (p.lastAnalysis ? esc(String(p.lastAnalysis.verification.status).replaceAll("_", " ")) : "Not analyzed") + '</td><td><button class="ws-button" data-open="' + esc(p.id) + '">Open</button> <a class="ws-button" data-export="' + esc(p.id) + '">Download ZIP</a> <button class="ws-button danger" data-delete="' + esc(p.id) + '">Delete</button></td></tr>').join("") + "</tbody></table>"
      : BugWorkspace.emptyState({ title: "No projects yet", body: "Create one from files, upload a ZIP, or import a public GitHub repository above." });
    document.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => open(b.dataset.open));
    document.querySelectorAll("[data-export]").forEach((b) => b.onclick = () => download(b.dataset.export));
    document.querySelectorAll("[data-delete]").forEach((b) => b.onclick = async () => {
      if (!confirm("Delete this project? Its files will be removed from BUG AI storage.")) return;
      try { await App.api("/projects/" + b.dataset.delete, { method: "DELETE" }); if (BugWorkspace.selectedProject() === b.dataset.delete) BugWorkspace.setContext({ projectId: "", file: "" }); BugWorkspace.cacheClear("projects"); render(); }
      catch (error) { App.showToast(error.message, "error", "Delete failed"); }
    });
  }

  // Authenticated download: fetch the zip with the bearer token, then hand the
  // browser a blob. A plain <a href> would arrive without the Authorization header.
  async function download(id) {
    try {
      const token = localStorage.getItem("bugzero_token");
      const response = await fetch("/api/projects/" + id + "/export", { headers: { Authorization: "Bearer " + token } });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Export failed");
      const name = (response.headers.get("content-disposition") || "").match(/filename="([^"]+)"/)?.[1] || "project.zip";
      const a = document.createElement("a"); a.href = URL.createObjectURL(await response.blob()); a.download = name; a.click(); URL.revokeObjectURL(a.href);
    } catch (error) { App.showToast(error.message, "error", "Download failed"); }
  }

  async function open(id) {
    let data;
    try { data = await App.api("/projects/" + id); } catch (error) { return App.showToast(error.message, "error", "Could not open project"); }
    const p = data.project;
    BugWorkspace.setContext({ projectId: id, file: "" });
    BugWorkspace.cacheClear("projects");
    document.getElementById("project-detail").classList.remove("ws-empty");
    document.getElementById("project-detail").innerHTML = "<h3>" + esc(p.name) + '</h3><p class="ws-muted">' + p.fileCount + " files · " + esc(p.languages.join(", ") || "unknown language") + "</p><p>Manifests: " + esc(p.manifests.join(", ") || "none detected") + "</p>"
      + '<div class="ws-toolbar"><a class="ws-button primary" href="studio.html">Open Studio</a><button class="ws-button" id="analyze-project">Analyze project</button><button class="ws-button" id="export-project">Download ZIP</button><a class="ws-button" href="architecture.html">Architecture</a><a class="ws-button" href="dependencies.html">Dependencies</a><a class="ws-button" href="security.html">Security</a><a class="ws-button" href="debt.html">Technical debt</a></div><p id="project-status" class="ws-muted"></p>'
      + '<div class="ws-toolbar" style="margin-top:14px"><select class="ws-select" id="doc-kind" style="width:auto"><option value="readme">README</option><option value="api">API reference</option><option value="functions">Function docs</option><option value="architecture">Architecture doc</option></select><button class="ws-button" id="doc-generate">Generate documentation</button><button class="ws-button" id="doc-download" disabled>Download .md</button></div><div id="doc-out"></div>';
    document.getElementById("export-project").onclick = () => download(id);
    let lastDoc = null;
    document.getElementById("doc-generate").onclick = async (e) => {
      const out = document.getElementById("doc-out");
      out.innerHTML = '<p class="ws-muted">Generating from the project files…</p>';
      try {
        const doc = await BugMotion.busy(e.currentTarget, App.api("/docs", { method: "POST", body: { projectId: id, kind: document.getElementById("doc-kind").value } }), { busyLabel: "Generating…", doneLabel: "✓ Generated" });
        if (doc.status !== "completed") { out.innerHTML = BugWorkspace.emptyState({ title: "Documentation " + doc.status.replaceAll("_", " "), body: doc.reason }); return; }
        lastDoc = doc; document.getElementById("doc-download").disabled = false;
        out.innerHTML = '<div class="ws-notice">' + esc(doc.note) + " Files sent: " + doc.filesSent.map(esc).join(", ") + (doc.gaps.length ? "<br><b>Gaps the model reported:</b> " + doc.gaps.map(esc).join("; ") : "") + '</div><pre class="ws-code" style="max-height:480px">' + esc(doc.markdown) + "</pre>";
      } catch (error) { out.innerHTML = BugWorkspace.emptyState({ title: "Generation failed", body: error.message }); }
    };
    document.getElementById("doc-download").onclick = () => { if (!lastDoc) return; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lastDoc.markdown], { type: "text/markdown" })); a.download = (lastDoc.kind === "readme" ? "README" : lastDoc.kind.toUpperCase()) + ".md"; a.click(); URL.revokeObjectURL(a.href); };
    document.getElementById("analyze-project").onclick = async () => {
      const status = document.getElementById("project-status");
      status.textContent = "Analyzing project…";
      try {
        const result = await App.api("/projects/" + id + "/analyze", { method: "POST" });
        BugWorkspace.setContext({ scan: result.analysis });
        status.textContent = result.analysis.summary.totalFindings + " finding(s) · " + String(result.analysis.verification.status).replaceAll("_", " ") + ". Open Bug Analyzer or Security Center to review.";
        render();
      } catch (error) { status.textContent = error.message; }
    };
    render();
  }

  document.getElementById("create-project").onclick = async () => {
    const selected = [...document.getElementById("project-files").files];
    if (!selected.length) return App.showToast("Select one or more source files.", "warning", "No files");
    const files = await Promise.all(selected.slice(0, 100).map(async (f) => ({ name: f.webkitRelativePath || f.name, content: (await f.text()).slice(0, 200000) })));
    try {
      const result = await App.api("/projects", { method: "POST", body: { name: document.getElementById("project-name").value, files } });
      BugWorkspace.cacheClear("projects"); await render(); open(result.project.id); App.showToast("Project created.");
    } catch (error) { App.showToast(error.message, "error", "Create failed"); }
  };

  document.getElementById("import-zip").onclick = async () => {
    const file = document.getElementById("zip-file").files[0];
    const status = document.getElementById("zip-status");
    if (!file) return App.showToast("Choose a .zip file first.", "warning", "No archive");
    if (file.size > 15 * 1024 * 1024) return App.showToast("Archives are limited to 15 MB.", "warning", "Too large");
    status.textContent = "Uploading and unpacking…";
    try {
      const archive = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file); });
      const result = await App.api("/projects/import-zip", { method: "POST", body: { name: document.getElementById("zip-name").value.trim() || file.name.replace(/\.zip$/i, ""), archive } });
      status.textContent = importSummary(result.import);
      BugWorkspace.cacheClear("projects"); await render(); open(result.project.id);
      App.showToast("Archive imported.", "success", "Imported");
    } catch (error) { status.textContent = error.message; App.showToast(error.message, "error", "Import failed"); }
  };

  document.getElementById("import-github").onclick = async () => {
    const repoUrl = document.getElementById("gh-url").value.trim();
    const status = document.getElementById("gh-status");
    if (!repoUrl) return App.showToast("Enter a repository URL.", "warning", "No URL");
    status.textContent = "Fetching the default branch… large repositories can take a while.";
    try {
      const result = await App.api("/projects/import-github", { method: "POST", body: { repoUrl, name: document.getElementById("gh-name").value.trim() || undefined } });
      status.textContent = importSummary(result.import);
      BugWorkspace.cacheClear("projects"); await render(); open(result.project.id);
      App.showToast("Repository imported as a project.", "success", "Imported");
    } catch (error) { status.textContent = error.message; App.showToast(error.message, "error", "Import failed"); }
  };

  document.getElementById("refresh").onclick = () => { BugWorkspace.cacheClear("projects"); render(); };
  await render();
  if (BugWorkspace.selectedProject()) open(BugWorkspace.selectedProject());
});
