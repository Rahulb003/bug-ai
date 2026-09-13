document.addEventListener("DOMContentLoaded", async () => {
  if (!App.requireAuth()) return;
  const root = document.getElementById("workspace-content");
  const esc = BugWorkspace.esc;
  const icon = (n, c) => BugWorkspace.icon(n, c);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Subtle count-up for REAL numbers only; never used on placeholders.
  function countTo(el, value) {
    const target = Number(value) || 0;
    if (reduced || target < 2) { el.textContent = String(target); return; }
    const start = performance.now(), duration = 420;
    const tick = (now) => { const t = Math.min(1, (now - start) / duration); el.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3)))); if (t < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  root.innerHTML = BugPages.header({ title: "Dashboard", subtitle: "Loading project overview…", actions: "" })
    + '<div id="db-actions" class="ws-toolbar" style="margin-bottom:16px"></div>'
    + '<div id="db-body"></div>';

  const projectId = BugWorkspace.selectedProject();
  const scan = BugWorkspace.currentScan();

  // Everything on this page is fetched; nothing is invented when a call fails.
  const [project, history, overview] = await Promise.all([
    projectId ? App.api("/projects/" + projectId).then((r) => r.project).catch(() => null) : Promise.resolve(null),
    App.api("/history").then((r) => r.scans || []).catch(() => []),
    App.api("/workspace").catch(() => null)
  ]);
  const recent = history.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
  const latest = scan || recent[0] || null;
  const findings = latest?.findings || latest?.bugs || [];
  const c = BugPages.counts(findings.map((f) => ({ severity: f.severity })));
  const security = findings.filter((f) => String(f.category).toLowerCase() === "security").length;

  document.querySelector(".pg-head p").textContent = project ? project.name + " · " + project.fileCount + " file(s) · " + (project.languages.join(", ") || "no language detected") : (BugWorkspace.selectedFile() ? "Working on a live snippet — select a project for a full overview" : "No project selected");

  document.getElementById("db-actions").innerHTML =
    '<a class="ws-button primary" href="studio.html">' + icon("studio") + " Open Studio</a>"
    + '<button class="ws-button" id="db-analyze"' + (project ? "" : " disabled title=\"Select a project first\"") + ">" + icon("bug") + " Analyze Project</button>"
    + '<a class="ws-button" href="projects.html">' + icon("deps") + " Upload Project</a>"
    + '<a class="ws-button" href="projects.html">' + icon("git") + " Import GitHub</a>"
    + '<a class="ws-button" href="security.html">' + icon("shield") + " Security Scan</a>"
    + '<a class="ws-button" href="tests.html">' + icon("flask") + " Generate Tests</a>";

  const metric = (label, value, note, id) => '<div class="ws-card db-metric"><span class="ws-muted">' + esc(label) + '</span><div class="ws-metric" id="' + id + '">' + (value === null ? "—" : "0") + "</div>" + (note ? '<p class="ws-muted">' + esc(note) + "</p>" : "") + "</div>";

  let body = "";
  if (!latest) {
    body += '<section class="ws-card"><h3>No analysis available yet</h3><p class="ws-muted">Open Code Studio or analyze the project to populate this overview. Nothing here is estimated.</p></section>';
  } else {
    body += '<div class="ws-grid cols-3">'
      + metric("Total findings", findings.length, (latest.sourceName || "latest scan") + " · " + new Date(latest.createdAt || Date.now()).toLocaleString(), "m-total")
      + metric("Critical + High", c.CRITICAL + c.HIGH, c.CRITICAL + " critical, " + c.HIGH + " high", "m-crit")
      + metric("Security findings", security, "From the deterministic security analyzer", "m-sec")
      + "</div>"
      + '<div class="ws-grid cols-3" style="margin-top:16px">'
      + '<div class="ws-card db-metric"><span class="ws-muted">Risk prioritisation</span><div class="ws-metric">' + esc(String(latest.riskScore ?? "—")) + '</div><p class="ws-muted">' + esc(latest.riskLevel || "") + " · severity-weighted triage, not accuracy</p></div>"
      + '<div class="ws-card db-metric"><span class="ws-muted">Verification</span><div class="ws-metric" style="font-size:17px">' + esc(String(latest.verification?.status || "NOT RUN").replaceAll("_", " ")) + '</div><p class="ws-muted">Static checks only unless the sandbox is enabled</p></div>'
      + '<div class="ws-card db-metric"><span class="ws-muted">Code quality · complexity · technical debt</span><div class="ws-metric" style="font-size:17px">NOT MEASURED</div><p class="ws-muted">No scoring model is configured; the pipeline does not compute these</p></div>'
      + "</div>";
  }

  body += '<div class="ws-grid cols-2" style="margin-top:16px">';
  body += '<section class="ws-card"><h3>Active project</h3>' + (project
    ? '<dl class="pg-kv"><dt>Name</dt><dd>' + esc(project.name) + "</dd><dt>Files</dt><dd>" + project.fileCount + "</dd><dt>Languages</dt><dd>" + esc(project.languages.join(", ") || "none detected") + "</dd><dt>Manifests</dt><dd>" + esc(project.manifests.join(", ") || "none") + "</dd><dt>Last project analysis</dt><dd>" + (project.lastAnalysis ? esc(String(project.lastAnalysis.verification?.status || "").replaceAll("_", " ")) + " · " + (project.lastAnalysis.summary?.totalFindings ?? 0) + " finding(s)" : "not analyzed") + '</dd></dl><div class="ws-toolbar" style="margin-top:12px"><a class="ws-button" href="architecture.html">Architecture</a><a class="ws-button" href="dependencies.html">Dependencies</a><a class="ws-button" href="debt.html">Technical debt</a></div>'
    : BugWorkspace.emptyState({ title: "No project selected", body: "Select or create a project to see files, languages and manifests here.", actionHref: "projects.html", actionLabel: "Open Projects" })) + "</section>";
  body += '<section class="ws-card"><h3>Recent scans</h3>' + (recent.length
    ? '<table class="ws-table"><thead><tr><th>When</th><th>Source</th><th>Findings</th><th>Risk</th></tr></thead><tbody>' + recent.map((s) => "<tr><td>" + esc(new Date(s.createdAt).toLocaleString()) + "</td><td>" + esc(s.sourceName || "snippet") + "</td><td>" + (s.findings || s.bugs || []).length + '</td><td><span class="ws-badge ' + String(s.riskLevel || "low").toLowerCase() + '">' + esc(String(s.riskScore ?? "—")) + "</span></td></tr>").join("") + '</tbody></table><div class="ws-toolbar" style="margin-top:12px"><a class="ws-button" href="history.html">Full history</a><a class="ws-button" href="analytics.html">Analytics</a></div>'
    : '<p class="ws-muted">No scans recorded yet.</p>') + "</section>";
  body += "</div>";

  // Team and notifications: preserved from the previous workspace page.
  const members = overview?.workspace?.memberProfiles || [];
  const notes = overview?.notifications || [];
  body += '<div class="ws-grid cols-2" style="margin-top:16px">';
  body += '<section class="ws-card"><h3>Team</h3>' + (members.length ? '<ul class="ws-list">' + members.map((m) => "<li><b>" + esc(m.name) + '</b> <span class="ws-badge">' + esc(m.role) + '</span> <small class="ws-muted">' + esc(m.email) + " · " + esc(m.status) + "</small></li>").join("") + "</ul>" : '<p class="ws-muted">No workspace members loaded.</p>')
    + '<div class="ws-toolbar" style="margin-top:12px"><input class="ws-input" id="invite-email" placeholder="teammate@example.com" style="flex:1;min-width:180px"><select class="ws-select" id="invite-role"><option value="member">Member</option><option value="admin">Admin</option><option value="viewer">Viewer</option></select><button class="ws-button" id="invite-btn">Invite</button></div><p id="invite-status" class="ws-muted"></p></section>';
  body += '<section class="ws-card"><h3>Recent activity</h3>' + (notes.length ? '<ul class="ws-list">' + notes.slice(0, 6).map((n) => "<li><b>" + esc(n.title) + '</b><br><small class="ws-muted">' + esc(n.message) + " · " + esc(new Date(n.createdAt).toLocaleString()) + "</small></li>").join("") + "</ul>" : '<p class="ws-muted">Activity appears here after scans complete.</p>') + "</section>";
  body += "</div>";
  document.getElementById("db-body").innerHTML = body;

  if (latest) { countTo(document.getElementById("m-total"), findings.length); countTo(document.getElementById("m-crit"), c.CRITICAL + c.HIGH); countTo(document.getElementById("m-sec"), security); }

  document.getElementById("db-analyze")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = "Analyzing project…";
    try {
      const result = await App.api("/projects/" + projectId + "/analyze", { method: "POST" });
      BugWorkspace.setContext({ scan: result.analysis });
      App.showToast(result.analysis.summary.totalFindings + " finding(s) · " + String(result.analysis.verification.status).replaceAll("_", " "), "success", "Scan completed");
      location.reload();
    } catch (error) { btn.disabled = false; btn.textContent = "Analyze Project"; App.showToast(error.message, "error", "Analysis failed"); }
  });
  document.getElementById("invite-btn")?.addEventListener("click", async () => {
    const status = document.getElementById("invite-status");
    try {
      await App.api("/workspace/invite", { method: "POST", body: { email: document.getElementById("invite-email").value, role: document.getElementById("invite-role").value } });
      status.textContent = "Invitation recorded."; App.showToast("Teammate invited.", "success", "Team"); setTimeout(() => location.reload(), 600);
    } catch (error) { status.textContent = error.message; }
  });
});
