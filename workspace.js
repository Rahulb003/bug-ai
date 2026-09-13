const BugWorkspace = (() => {
  const page = document.body.dataset.page || "dashboard";

  // Stroke icons, sized by the CSS that renders them.
  const I = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    studio: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m9 12 2 2 4-4"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    bug: '<circle cx="12" cy="13" r="5"/><path d="M12 8V5M4 13H1m22 0h-3M5.5 6.5 7.7 8.7m10.8-2.2-2.2 2.2M5.5 19.5l2.2-2.2m10.8 2.2-2.2-2.2"/>',
    gauge: '<circle cx="12" cy="12" r="9"/><path d="M12 12 15.5 8.5"/>',
    shield: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/>',
    flask: '<path d="M9 3h6M10 3v6l-5 8.5A2 2 0 0 0 6.7 21h10.6a2 2 0 0 0 1.7-3.5L14 9V3"/>',
    review: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m9 15 2 2 4-4"/>',
    arch: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    deps: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/>',
    git: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="9" r="3"/><path d="M6 9v6M18 12c0 4-6 2-6 6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.6H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.7 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
    bell: '<path d="M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10.5 20a2 2 0 0 0 3 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    caret: '<path d="m6 9 6 6 6-6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'
  };
  const icon = (name, cls = "") => `<svg class="ws-i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || ""}</svg>`;

  const links = [
    ["", [["dashboard.html", "Dashboard", "home"], ["studio.html", "Code Studio", "studio"], ["projects.html", "Projects", "folder"]]],
    ["Analyze", [["analyzer.html", "Bug Analyzer", "bug"], ["optimizer.html", "Optimizer", "gauge"], ["security.html", "Security Center", "shield"], ["tests.html", "Test Lab", "flask"], ["review.html", "Code Review", "review"]]],
    ["Understand", [["architecture.html", "Architecture", "arch"], ["dependencies.html", "Dependencies", "deps"], ["assistant.html", "AI Assistant", "bot"]]],
    ["Development", [["git.html", "Git / GitHub", "git"]]],
    ["Insights", [["analytics.html", "Analytics", "chart"], ["history.html", "History", "clock"]]],
    ["System", [["settings.html", "Settings", "gear"], ["admin.html", "Admin", "user"]]]
  ];

  const pageFile = `${page}.html`;
  const selectedProject = () => localStorage.getItem("bugai_current_project") || "";
  const selectedFile = () => localStorage.getItem("bugai_current_file") || "";
  const currentScan = () => { try { return JSON.parse(localStorage.getItem("bugai_current_scan") || "null"); } catch { return null; } };
  const setContext = ({ projectId, file, scan } = {}) => {
    if (projectId !== undefined) localStorage.setItem("bugai_current_project", projectId || "");
    if (file !== undefined) localStorage.setItem("bugai_current_file", file || "");
    if (scan !== undefined) localStorage.setItem("bugai_current_scan", JSON.stringify(scan || null));
    renderContext();
  };
  const esc = (value) => App.escapeHtml(value);

  let projectsCache = [];
  let profileCache = null;
  let notificationsCache = [];

  // The shell needs the same profile/projects/notifications on every page. Without
  // a cache, navigating the sidebar fires three API calls per page and quickly
  // trips the rate limiter. Short TTLs keep the data fresh enough to be honest.
  const TTL = { profile: 300000, projects: 60000, notifications: 30000 };
  function cacheGet(key) {
    try {
      const raw = sessionStorage.getItem(`bugai_cache_${key}`);
      if (!raw) return null;
      const { at, value } = JSON.parse(raw);
      if (Date.now() - at > (TTL[key] || 30000)) return null;
      return value;
    } catch { return null; }
  }
  function cacheSet(key, value) {
    try { sessionStorage.setItem(`bugai_cache_${key}`, JSON.stringify({ at: Date.now(), value })); } catch { /* private mode */ }
  }
  function cacheClear(key) {
    try { key ? sessionStorage.removeItem(`bugai_cache_${key}`) : ["profile", "projects", "notifications"].forEach((k) => sessionStorage.removeItem(`bugai_cache_${k}`)); } catch { /* ignore */ }
  }

  function renderShell() {
    const root = document.getElementById("workspace-shell"); if (!root) return;
    root.classList.add("ws-shell"); // workspace.css defines the sidebar/main grid on this class.
    try { if (localStorage.getItem("bugai_sidebar") === "collapsed") root.classList.add("collapsed"); } catch { /* ignore */ }
    root.innerHTML = `
      <aside class="ws-sidebar">
        <a class="ws-brand" href="dashboard.html">
          <span class="ws-brand-mark">${icon("bot")}</span>
          <span class="ws-brand-text"><b>BUG AI</b><small>Code Smarter. Build Safer.</small></span>
        </a>
        <nav class="ws-nav">${links.map(([title, group]) => `${title ? `<div class="ws-nav-title">${title}</div>` : ""}${group.map(([href, label, ic]) => `<a class="${href === pageFile ? "active" : ""}" href="${href}">${icon(ic)}<span>${label}</span></a>`).join("")}`).join("")}</nav>
        <button class="ws-collapse" id="ws-collapse" type="button" aria-label="Collapse sidebar" title="Collapse sidebar">${icon("chevron")}</button>
        <button class="ws-profile" id="ws-profile" type="button" aria-haspopup="menu">
          <span class="ws-avatar" id="ws-profile-avatar">··</span>
          <span class="ws-profile-text"><b id="ws-profile-name">Loading…</b><small id="ws-profile-email"></small></span>
          ${icon("chevron", "ws-profile-caret")}
        </button>
      </aside>
      <main class="ws-main">
        <header class="ws-topbar">
          <div class="ws-project-switch">
            <button class="ws-select-button" id="ws-project-button" type="button" aria-haspopup="listbox"><span id="ws-project-label">No project</span>${icon("caret")}</button>
            <div class="ws-menu" id="ws-project-menu" hidden></div>
          </div>
          <div class="ws-search">
            ${icon("search", "ws-search-icon")}
            <input id="ws-search" type="search" placeholder="Search files, code, findings..." aria-label="Search files and findings" autocomplete="off">
            <kbd>Ctrl + K</kbd>
            <div class="ws-menu ws-search-results" id="ws-search-results" hidden></div>
          </div>
          <div class="ws-topbar-actions">
            <span class="ws-status-pill" id="ws-online"><i></i><span>Online</span></span>
            <div class="ws-bell-wrap">
              <button class="ws-icon-button" id="ws-bell" type="button" aria-label="Notifications">${icon("bell")}<span class="ws-bell-badge" id="ws-bell-badge" hidden>0</span></button>
              <div class="ws-menu ws-notifications" id="ws-notifications" hidden></div>
            </div>
            <button class="ws-icon-button" data-theme-toggle type="button" aria-label="Toggle theme"><span id="ws-theme-icon">${icon("sun")}</span></button>
            <div class="ws-bell-wrap">
              <button class="ws-avatar ws-avatar-button" id="ws-account" type="button" aria-label="Account">··</button>
              <div class="ws-menu ws-account-menu" id="ws-account-menu" hidden></div>
            </div>
          </div>
        </header>
        <div class="ws-breadcrumb" id="ws-breadcrumb"></div>
        <section class="ws-content" id="workspace-content"></section>
      </main>`;
    renderContext();
    wireTopbar();
  }

  // --- topbar behaviour -----------------------------------------------------

  const closeMenus = (except) => document.querySelectorAll(".ws-menu").forEach((m) => { if (m !== except) m.hidden = true; });
  function toggleMenu(menu) { const open = menu.hidden; closeMenus(menu); menu.hidden = !open; }

  async function wireTopbar() {
    document.getElementById("ws-collapse")?.addEventListener("click", () => {
      const root = document.getElementById("workspace-shell");
      const collapsed = root.classList.toggle("collapsed");
      try { localStorage.setItem("bugai_sidebar", collapsed ? "collapsed" : "open"); } catch { /* ignore */ }
    });
    document.addEventListener("click", (event) => { if (!event.target.closest(".ws-menu, #ws-project-button, #ws-bell, #ws-account, #ws-profile, .ws-search")) closeMenus(); });

    const search = document.getElementById("ws-search");
    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); search?.focus(); }
      if (event.key === "Escape") closeMenus();
    });
    search?.addEventListener("input", () => renderSearch(search.value));
    search?.addEventListener("focus", () => renderSearch(search.value));

    document.getElementById("ws-project-button")?.addEventListener("click", async () => {
      const menu = document.getElementById("ws-project-menu");
      toggleMenu(menu);
      if (!menu.hidden) await renderProjectMenu();
    });

    document.getElementById("ws-bell")?.addEventListener("click", async () => {
      const menu = document.getElementById("ws-notifications");
      toggleMenu(menu);
      if (!menu.hidden) await renderNotifications();
    });

    const accountMenu = () => `<div class="ws-menu-head"><b>${esc(profileCache?.username || "Account")}</b><small>${esc(profileCache?.email || "")}</small></div><a href="settings.html">${icon("gear")} Settings</a><button type="button" data-logout>${icon("user")} Log out</button>`;
    for (const id of ["ws-account", "ws-profile"]) {
      document.getElementById(id)?.addEventListener("click", () => {
        const menu = document.getElementById("ws-account-menu");
        menu.innerHTML = accountMenu();
        menu.classList.toggle("ws-menu-up", id === "ws-profile");
        // Anchor the menu near whichever control opened it.
        menu.closest(".ws-bell-wrap") && (menu.style.position = "absolute");
        toggleMenu(menu);
        menu.querySelector("[data-logout]")?.addEventListener("click", () => App.logout ? App.logout() : (localStorage.removeItem("bugzero_token"), location.href = "login.html"));
      });
    }

    // Online indicator reflects the last real API call, not an assumption.
    const paint = (ok) => { const pill = document.getElementById("ws-online"); if (!pill) return; pill.classList.toggle("offline", !ok); pill.querySelector("span").textContent = ok ? "Online" : "Offline"; };
    window.addEventListener("bugai:api", (event) => paint(event.detail.ok));
    paint(true);
    syncThemeIcon();
    new MutationObserver(syncThemeIcon).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    await Promise.all([loadProfile(), refreshProjectLabel(), refreshNotificationBadge()]);
  }

  function syncThemeIcon() {
    const holder = document.getElementById("ws-theme-icon");
    if (holder) holder.innerHTML = document.documentElement.getAttribute("data-theme") === "light" ? icon("moon") : icon("sun");
  }

  const initialsOf = (name, email) => String(name || email || "?").split(/[\s._@-]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "?";

  async function loadProfile() {
    if (profileCache) return profileCache;
    const cached = cacheGet("profile");
    if (cached) profileCache = cached;
    else { try { profileCache = (await App.api("/auth/me")).user || null; cacheSet("profile", profileCache); } catch { profileCache = null; } }
    const initials = profileCache ? initialsOf(profileCache.username, profileCache.email) : "?";
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    set("ws-profile-name", profileCache?.username || "Not signed in");
    set("ws-profile-email", profileCache?.email || "");
    set("ws-profile-avatar", initials);
    set("ws-account", initials);
    return profileCache;
  }

  async function loadProjectsCached(force) {
    if (projectsCache.length && !force) return projectsCache;
    const cached = !force && cacheGet("projects");
    if (cached) { projectsCache = cached; return projectsCache; }
    try { projectsCache = (await App.api("/projects")).projects || []; cacheSet("projects", projectsCache); } catch { projectsCache = []; }
    return projectsCache;
  }

  async function refreshProjectLabel() {
    const label = document.getElementById("ws-project-label"); if (!label) return;
    const id = selectedProject();
    if (!id) { label.textContent = selectedFile() ? "Live Snippet" : "No project"; label.title = selectedFile() ? "Working on a standalone snippet, not a stored project" : "No project selected"; renderBreadcrumb(); return; }
    const projects = await loadProjectsCached();
    label.textContent = projects.find((p) => p.id === id)?.name || id;
    renderBreadcrumb();
  }

  async function renderProjectMenu() {
    const menu = document.getElementById("ws-project-menu");
    const projects = await loadProjectsCached(true);
    menu.innerHTML = projects.length
      ? projects.map((p) => `<button type="button" data-pick="${esc(p.id)}" class="${p.id === selectedProject() ? "active" : ""}">${icon("folder")} <span>${esc(p.name)}</span><small>${p.fileCount} files</small></button>`).join("")
      : `<div class="ws-menu-empty">No saved projects. <a href="projects.html">Create one</a></div>`;
    menu.querySelectorAll("[data-pick]").forEach((button) => button.addEventListener("click", () => {
      setContext({ projectId: button.dataset.pick });
      closeMenus();
      refreshProjectLabel();
      window.dispatchEvent(new CustomEvent("bugai:project", { detail: { projectId: button.dataset.pick } }));
    }));
  }

  async function refreshNotificationBadge() {
    const cached = cacheGet("notifications");
    if (cached) notificationsCache = cached;
    else { try { notificationsCache = (await App.api("/notifications")).notifications || []; cacheSet("notifications", notificationsCache); } catch { notificationsCache = []; } }
    const unread = notificationsCache.filter((n) => !n.read).length;
    const badge = document.getElementById("ws-bell-badge");
    if (badge) { badge.textContent = String(unread); badge.hidden = unread === 0; }
  }

  async function renderNotifications() {
    const menu = document.getElementById("ws-notifications");
    menu.innerHTML = `<div class="ws-menu-head"><b>Notifications</b><small>${notificationsCache.filter((n) => !n.read).length} unread</small></div>` + (notificationsCache.length
      ? notificationsCache.slice(0, 10).map((n) => `<button type="button" class="ws-note ${n.read ? "" : "unread"}" data-note="${esc(n.id)}"><b>${esc(n.title)}</b><span>${esc(n.message)}</span><small>${new Date(n.createdAt).toLocaleString()}</small></button>`).join("")
      : `<div class="ws-menu-empty">Nothing yet. Notifications appear when a scan completes.</div>`);
    menu.querySelectorAll("[data-note]").forEach((button) => button.addEventListener("click", async () => {
      try { await App.api(`/notifications/${button.dataset.note}/read`, { method: "POST" }); cacheClear("notifications"); } catch { /* surfaced by the online pill */ }
      button.classList.remove("unread");
      await refreshNotificationBadge();
    }));
  }

  // Breadcrumb: Projects > Project > folders > file, with a lock only when the
  // active file actually carries a CRITICAL/HIGH finding from the last scan.
  function renderBreadcrumb(activeFile) {
    const bar = document.getElementById("ws-breadcrumb"); if (!bar) return;
    const file = activeFile !== undefined ? activeFile : selectedFile();
    const projectName = projectsCache.find((p) => p.id === selectedProject())?.name || (selectedProject() ? "Project" : (file ? "Live Snippet" : null));
    const crumbs = [`<a href="projects.html">Projects</a>`];
    if (projectName) crumbs.push(`<span>${esc(projectName)}</span>`);
    if (file) String(file).split("/").forEach((part, index, all) => {
      const last = index === all.length - 1;
      crumbs.push(last ? `<span class="current">${riskLock(file)}${esc(part)}</span>` : `<span>${esc(part)}</span>`);
    });
    bar.innerHTML = crumbs.join(`<i class="ws-crumb-sep">${icon("chevron")}</i>`);
  }

  function riskLock(file) {
    const scan = currentScan();
    const risky = (scan?.findings || []).some((f) => f.file === file && ["CRITICAL", "HIGH"].includes(String(f.severity).toUpperCase()));
    return risky ? `<span class="ws-crumb-lock" title="This file has a CRITICAL or HIGH finding">${icon("lock")}</span>` : "";
  }

  // Client-side only: current project's file names + current scan's finding titles.
  function searchIndex() {
    const scan = currentScan();
    const files = (window.BugStudioFiles || []).map((name) => ({ kind: "file", label: name }));
    const findings = (scan?.findings || []).map((f) => ({ kind: "finding", label: f.title, sub: `${f.file}:${f.line}`, line: f.line, file: f.file }));
    return [...files, ...findings];
  }

  function renderSearch(query) {
    const box = document.getElementById("ws-search-results"); if (!box) return;
    const q = String(query || "").trim().toLowerCase();
    if (!q) { box.hidden = true; return; }
    const hits = searchIndex().filter((item) => item.label.toLowerCase().includes(q)).slice(0, 8);
    box.innerHTML = hits.length
      ? `<div class="ws-menu-head"><b>Results</b><small>file names and finding titles only</small></div>` + hits.map((h) => `<button type="button" data-hit='${esc(JSON.stringify(h))}'>${icon(h.kind === "file" ? "folder" : "bug")} <span>${esc(h.label)}</span><small>${esc(h.sub || h.kind)}</small></button>`).join("")
      : `<div class="ws-menu-empty">No match in file names or finding titles.</div>`;
    box.hidden = false;
    box.querySelectorAll("[data-hit]").forEach((button) => button.addEventListener("click", () => {
      const hit = JSON.parse(button.dataset.hit);
      window.dispatchEvent(new CustomEvent("bugai:jump", { detail: hit }));
      closeMenus();
    }));
  }

  function renderContext() { renderBreadcrumb(); refreshProjectLabel(); }

  function findingCard(item) {
    return `<article class="finding ${String(item.severity || "info").toLowerCase()}"><div><span class="ws-badge ${String(item.severity || "info").toLowerCase()}">${esc(item.severity)}</span> <span class="ws-badge">${esc(item.source || "deterministic")}</span></div><strong>${esc(item.title)}</strong><p>${esc(item.description || item.explanation || "")}</p><p class="ws-muted">${esc(item.file || "snippet")}:${item.line || "?"} · confidence ${Math.round(Number(item.confidence || 0) * (Number(item.confidence || 0) <= 1 ? 100 : 1))}%</p><p><b>Evidence:</b> ${esc(Array.isArray(item.evidence) ? item.evidence.join(" ") : item.whyItHappens || "Unavailable")}</p><p><b>Recommendation:</b> ${esc(item.recommendation || item.fix || "Review the code.")}</p></article>`;
  }

  // One connected environment: any page can hand a file+line to the editor.
  function openInStudio({ file, line, column, findingId, panel } = {}) {
    const params = new URLSearchParams();
    if (file) params.set("file", file);
    if (line) params.set("line", String(line));
    if (column) params.set("column", String(column));
    if (findingId) params.set("finding", findingId);
    if (panel) params.set("panel", panel);
    if (file) localStorage.setItem("bugai_current_file", file);
    location.href = `studio.html${params.toString() ? `?${params}` : ""}`;
  }

  // Never render a discovered credential in full.
  function maskSecret(text) {
    return String(text == null ? "" : text).replace(/([A-Za-z0-9_\-]{8,})/g, (m) => (m.length < 12 ? m : `${m.slice(0, 4)}${"•".repeat(Math.min(12, m.length - 8))}${m.slice(-4)}`));
  }

  // Consistent, honest empty states instead of fabricated placeholder data.
  function emptyState({ title, body, actionHref, actionLabel } = {}) {
    return `<div class="ws-empty"><h2>${esc(title || "Nothing here yet")}</h2><p>${esc(body || "")}</p>${actionHref ? `<a class="ws-button primary" href="${esc(actionHref)}">${esc(actionLabel || "Continue")}</a>` : ""}</div>`;
  }

  async function loadProjects() { return (await App.api("/projects")).projects || []; }
  function requireScan(target) { const scan = currentScan(); if (!scan) { target.innerHTML = `<div class="ws-empty"><h2>No active analysis</h2><p>Open Code Studio, analyze code, then return here.</p><a class="ws-button primary" href="studio.html">Open Code Studio</a></div>`; return null; } return scan; }

  return { renderShell, setContext, cacheClear, selectedProject, selectedFile, currentScan, esc, findingCard, loadProjects, requireScan, icon, renderBreadcrumb, refreshNotificationBadge, loadProfile, openInStudio, maskSecret, emptyState };
})();
window.BugWorkspace = BugWorkspace;
document.addEventListener("DOMContentLoaded", () => { BugWorkspace.renderShell(); });

// Shared by studio.js and tests.html so the two render generated tests identically.
window.renderGeneratedTests = function (out, esc) {
  const list = (out.tests || []).length
    ? out.tests.map((t) => `<li><b>${esc(t.name)}</b> — ${esc(t.intent || "")}${t.code ? `<pre class="ws-code">${esc(t.code)}</pre>` : ""}</li>`).join("")
    : "";
  const detail = out.status === "generated" ? esc(out.framework || "") : esc(out.reason || out.framework || "");
  return `<p><b>${esc(out.status)}</b> · ${detail}</p>` + (list ? `<ul class="ws-list">${list}</ul>` : "<div class='ws-empty'>No tests generated.</div>");
};
