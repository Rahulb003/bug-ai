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
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    logout: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="m15 8 4 4-4 4M19 12H9"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>'
  };
  const icon = (name, cls = "") => `<svg class="ws-i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || ""}</svg>`;

  const links = [
    ["Main", [["dashboard.html", "Dashboard", "home"], ["studio.html", "Code Studio", "studio"], ["projects.html", "Projects", "folder"]]],
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
  let projectsFailed = false; // true when /projects could not be fetched, so a missing id is unknown rather than gone
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
          <span class="ws-brand-mark" id="ws-brand-core">${window.BugBrand ? BugBrand.mark({ size: 18 }) : icon("bot")}</span>
          <span class="ws-brand-text"><b>BUG AI</b><small>Code Smarter. Build Safer.</small></span>
        </a>
        <nav class="ws-nav">${links.map(([title, group]) => `${title ? `<div class="ws-nav-title">${title}</div>` : ""}${group.map(([href, label, ic]) => `<a class="${href === pageFile ? "active" : ""}" href="${href}" title="${label}" aria-label="${label}"${href === pageFile ? " aria-current=\"page\"" : ""}>${icon(ic)}<span>${label}</span></a>`).join("")}`).join("")}</nav>
        <button class="ws-collapse" id="ws-collapse" type="button" aria-label="Collapse sidebar" title="Collapse sidebar">${icon("chevron")}</button>
        <button class="ws-profile" id="ws-profile" type="button" aria-haspopup="menu">
          <span class="ws-avatar" id="ws-profile-avatar">··</span>
          <span class="ws-profile-text"><b id="ws-profile-name">Loading…</b><small id="ws-profile-email"></small></span>
          ${icon("chevron", "ws-profile-caret")}
        </button>
      </aside>
      <main class="ws-main">
        <header class="ws-topbar">
          <button class="ws-icon-button ws-nav-toggle" id="ws-nav-toggle" type="button" aria-label="Open navigation">${icon("sidebar")}</button>
          <div class="ws-project-switch">
            <button class="ws-select-button" id="ws-project-button" type="button" aria-haspopup="listbox"><span id="ws-project-label">No project</span>${icon("caret")}</button>
            <div class="ws-menu" id="ws-project-menu" hidden></div>
          </div>
          <div class="ws-search">
            <button class="ws-cmd-trigger" id="ws-search" type="button" aria-label="Open command palette" aria-haspopup="dialog">${icon("search")}<span>Search or run a command…</span><kbd>${/Mac/.test(navigator.platform) ? "⌘" : "Ctrl"} K</kbd></button>
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
    if (page === "dashboard" && window.BugMotion) BugMotion.boot({ short: true }).then(maybeOnboard);
    else if (page === "dashboard") maybeOnboard();
  }

  // First launch only: a short, skippable orientation. Never shown again once
  // dismissed, and never while the user already has projects.
  async function maybeOnboard() {
    try { if (localStorage.getItem("bugai_onboarded") === "1") return; } catch { return; }
    const projects = await loadProjectsCached().catch(() => []);
    if (projects.length) { try { localStorage.setItem("bugai_onboarded", "1"); } catch { /* ignore */ } return; }
    const el = document.createElement("div");
    el.className = "cp-overlay";
    el.innerHTML = `<div class="cp ob" role="dialog" aria-modal="true" aria-label="Welcome to BUG AI"><div class="ob-head">${window.BugBrand ? BugBrand.mark({ size: 34 }) : ""}<div><b>Welcome to BUG AI</b><small>CODE SMARTER. BUILD SAFER.</small></div></div><ol class="ob-steps"><li><b>Create a project</b><span>Upload files, a ZIP, or import a public GitHub repository.</span></li><li><b>Add code</b><span>Open a file in Code Studio, or paste a snippet.</span></li><li><b>Analyze</b><span>Deterministic rules run always; AI reasoning is labelled separately.</span></li><li><b>Review</b><span>Every finding carries evidence, rule, confidence and a recommendation.</span></li><li><b>Fix</b><span>Fixes are proposals shown as diffs; nothing is applied silently.</span></li><li><b>Verify</b><span>Rescans confirm what actually changed; nothing is claimed otherwise.</span></li></ol><div class="ob-actions"><button type="button" class="ws-button" data-skip>Skip</button><a class="ws-button primary" href="projects.html" data-go>Create a project</a></div></div>`;
    document.body.appendChild(el);
    const done = () => { try { localStorage.setItem("bugai_onboarded", "1"); } catch { /* ignore */ } el.remove(); };
    el.querySelector("[data-skip]").onclick = done;
    el.querySelector("[data-go]").addEventListener("click", () => { try { localStorage.setItem("bugai_onboarded", "1"); } catch { /* ignore */ } });
    el.addEventListener("click", (e) => { if (e.target === el) done(); });
    el.querySelector("[data-skip]").focus();
  }

  // --- topbar behaviour -----------------------------------------------------

  const closeMenus = (except) => document.querySelectorAll(".ws-menu").forEach((m) => { if (m !== except) m.hidden = true; });
  function toggleMenu(menu) { const open = menu.hidden; closeMenus(menu); menu.hidden = !open; }

  async function wireTopbar() {
    document.getElementById("ws-nav-toggle")?.addEventListener("click", () => {
      const root = document.getElementById("workspace-shell");
      root.classList.toggle("nav-open");
      let veil = document.getElementById("ws-nav-veil");
      if (!veil) { veil = document.createElement("div"); veil.id = "ws-nav-veil"; veil.className = "ws-nav-veil"; veil.addEventListener("click", () => root.classList.remove("nav-open")); root.appendChild(veil); }
    });
    document.querySelector(".ws-nav")?.addEventListener("click", () => document.getElementById("workspace-shell")?.classList.remove("nav-open"));
    document.getElementById("ws-collapse")?.addEventListener("click", () => {
      const root = document.getElementById("workspace-shell");
      const collapsed = root.classList.toggle("collapsed");
      try { localStorage.setItem("bugai_sidebar", collapsed ? "collapsed" : "open"); } catch { /* ignore */ }
    });
    document.addEventListener("click", (event) => { if (!event.target.closest(".ws-menu, #ws-project-button, #ws-bell, #ws-account, #ws-profile, .ws-search")) closeMenus(); });

    document.getElementById("ws-search")?.addEventListener("click", () => openPalette());

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
    try { projectsCache = (await App.api("/projects")).projects || []; projectsFailed = false; cacheSet("projects", projectsCache); } catch { projectsCache = []; projectsFailed = true; }
    return projectsCache;
  }

  async function refreshProjectLabel() {
    const label = document.getElementById("ws-project-label"); if (!label) return;
    const id = selectedProject();
    if (!id) { label.textContent = selectedFile() ? "Live Snippet" : "No project"; label.title = selectedFile() ? "Working on a standalone snippet, not a stored project" : "No project selected"; renderBreadcrumb(); return; }
    const projects = await loadProjectsCached();
    const project = projects.find((p) => p.id === id);
    // A stored id that this account cannot see (deleted, or another user's) must
    // not be shown as the active project; drop it so header and page agree.
    if (!project && !projectsFailed) { setContext({ projectId: "" }); return; }
    if (!project) { label.textContent = "Project unavailable"; renderBreadcrumb(); return; }
    label.textContent = project.name;
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

  // --- command registry + palette ---------------------------------------------
  // One registry powers the palette, global shortcuts and contextual actions.
  // A command is { id, label, category, icon, sub, shortcut, when(), run() }.
  // Every command performs a real operation: navigation, an API call, a jump,
  // or a page-registered action bound to an existing control.
  const registry = new Map();
  function registerCommands(list) { for (const c of list) registry.set(c.id, c); }
  const RECENT_KEY = "bugai_recent_commands";
  const recents = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } };
  const remember = (id) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recents().filter((x) => x !== id)].slice(0, 8))); } catch { /* ignore */ } };
  const isMac = /Mac/.test(navigator.platform);
  const kbd = (s) => s.replace("Mod", isMac ? "⌘" : "Ctrl");

  registerCommands([
    ...links.flatMap(([, group]) => group).map(([href, label, ic]) => ({ id: `go.${href.replace(".html", "")}`, label: `Go to ${label}`, category: "Navigate", icon: ic, sub: href.replace(".html", ""), when: () => href !== pageFile, run: () => { location.href = href; } })),
    { id: "project.analyze", label: "Analyze project", category: "Actions", icon: "bug", sub: "Full analysis of the selected project", when: () => Boolean(selectedProject()), run: async () => {
      App.showToast("Analyzing project…", "info", "Analysis");
      const result = await App.api(`/projects/${selectedProject()}/analyze`, { method: "POST" });
      setContext({ scan: result.analysis });
      App.showToast(`${result.analysis.summary.totalFindings} finding(s)`, "success", "Analysis complete");
      if (page !== "analyzer") location.href = "analyzer.html"; else location.reload();
    } },
    { id: "scan.open", label: "Open current analysis in Studio", category: "Actions", icon: "studio", sub: () => currentScan()?.sourceName || currentScan()?.id, when: () => Boolean(currentScan()), run: () => openInStudio({ scanId: currentScan().id, file: selectedFile() }) },
    { id: "scan.findings", label: "View current findings", category: "Actions", icon: "bug", when: () => Boolean(currentScan()) && page !== "analyzer", run: () => { location.href = `analyzer.html?scanId=${encodeURIComponent(currentScan().id)}`; } },
    { id: "scan.security", label: "Security findings of current scan", category: "Actions", icon: "shield", when: () => Boolean(currentScan()) && page !== "security", run: () => { location.href = `security.html?scanId=${encodeURIComponent(currentScan().id)}`; } },
    { id: "ui.theme", label: "Toggle theme", category: "Actions", icon: "sun", run: () => document.querySelector("[data-theme-toggle]")?.click() },
    { id: "ui.sidebar", label: "Toggle sidebar", category: "Actions", icon: "sidebar", shortcut: "Mod+B", run: () => document.getElementById("ws-collapse")?.click() },
    { id: "ui.palette", label: "Command palette", category: "Actions", icon: "search", shortcut: "Mod+K", when: () => false, run: () => openPalette() },
    { id: "auth.logout", label: "Log out", category: "Actions", icon: "logout", run: () => (App.logout ? App.logout() : (localStorage.removeItem("bugzero_token"), location.href = "login.html")) }
  ]);

  function dynamicCommands() {
    const scan = currentScan();
    const files = (window.BugStudioFiles || []).map((name) => ({ id: `file.${name}`, label: name, category: "Files", icon: "file", sub: "Open in editor", run: () => jump({ kind: "file", label: name }) }));
    const findings = (scan?.findings || []).map((f) => ({ id: `finding.${f.id}`, label: f.title, category: "Findings", icon: "bug", sub: `${f.file || "snippet"}:${f.line || "?"} · ${f.severity}`, run: () => jump({ kind: "finding", label: f.title, file: f.file, line: f.line, findingId: f.id }) }));
    return [...files, ...findings];
  }
  function availableCommands() {
    return [...registry.values(), ...dynamicCommands()].filter((c) => !c.when || c.when());
  }
  function runCommand(id) { const c = registry.get(id); if (c && (!c.when || c.when())) return c.run(); }
  function jump(hit) {
    if (page === "studio") window.dispatchEvent(new CustomEvent("bugai:jump", { detail: hit }));
    else openInStudio({ file: hit.file || hit.label, line: hit.line, findingId: hit.findingId });
  }

  // Subsequence fuzzy match: "gsec" → "Go to Security Center". Higher is better.
  function fuzzy(text, q) {
    const t = text.toLowerCase(); if (!q) return 1;
    if (t.startsWith(q)) return 100; if (t.includes(q)) return 60 + Math.max(0, 20 - t.indexOf(q));
    let ti = 0, score = 0, streak = 0;
    for (const ch of q) { const i = t.indexOf(ch, ti); if (i < 0) return 0; streak = i === ti ? streak + 1 : 0; score += 1 + streak + (i === 0 || /[\s\/._-]/.test(t[i - 1]) ? 3 : 0); ti = i + 1; }
    return score;
  }

  // Global shortcuts never fire while typing.
  // Monaco's .inputarea is exempt: app chords (Mod+Shift+F, Mod+S, Mod+Enter) must work while editing.
  const typing = (e) => e.target.closest?.("input, select, [contenteditable], textarea:not(.inputarea)");
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
    if (e.key === "Escape") { closeMenus(); return; }
    if (!mod || typing(e)) return;
    const want = `Mod+${e.shiftKey ? "Shift+" : ""}${e.altKey ? "Alt+" : ""}${e.key.length === 1 ? e.key.toUpperCase() : e.key}`;
    for (const c of registry.values()) { if (c.shortcut === want && (!c.when || c.when())) { e.preventDefault(); Promise.resolve(c.run()).catch((err) => App.showToast(err.message, "error", c.label)); return; } }
  });

  let paletteEl = null;
  function openPalette() {
    if (paletteEl) return;
    closeMenus();
    const all = availableCommands();
    const rec = recents();
    let active = 0; let shown = [];
    paletteEl = document.createElement("div");
    paletteEl.className = "cp-overlay";
    paletteEl.innerHTML = `<div class="cp" role="dialog" aria-modal="true" aria-label="Command palette"><div class="cp-input">${icon("search")}<input type="text" placeholder="Search files, findings, pages or run a command…" aria-label="Command" autocomplete="off" spellcheck="false"></div><div class="cp-list" role="listbox"></div><div class="cp-foot"><span><kbd class="ws-kbd">↑↓</kbd> navigate</span><span><kbd class="ws-kbd">↵</kbd> run</span><span><kbd class="ws-kbd">esc</kbd> close</span></div></div>`;
    document.body.appendChild(paletteEl);
    const input = paletteEl.querySelector("input");
    const list = paletteEl.querySelector(".cp-list");
    const ORDER = ["Recent", "Studio", "Actions", "Navigate", "Files", "Findings"];
    const rank = (g) => { const i = ORDER.indexOf(g); return i < 0 ? ORDER.length : i; };
    function paint() {
      const q = input.value.trim().toLowerCase();
      let rows;
      if (!q) {
        const recentRows = rec.map((id) => all.find((c) => c.id === id)).filter(Boolean).map((c) => ({ ...c, category: "Recent" }));
        rows = [...recentRows, ...all.filter((c) => !rec.includes(c.id))];
        rows.sort((a, b) => rank(a.category) - rank(b.category));
      } else {
        rows = all.map((c) => ({ c, s: Math.max(fuzzy(c.label, q), fuzzy(typeof c.sub === "function" ? c.sub() || "" : c.sub || "", q) * 0.6) })).filter((x) => x.s > 0).sort((a, b) => (rank(a.c.category) - rank(b.c.category)) || (b.s - a.s)).map((x) => x.c);
      }
      shown = rows.slice(0, 40);
      if (active >= shown.length) active = 0;
      if (!shown.length) { list.innerHTML = `<div class="cp-empty">Nothing matches "${esc(input.value)}".</div>`; return; }
      let html = ""; let last = "";
      shown.forEach((c, i) => {
        if (c.category !== last) { html += `<div class="cp-group">${esc(c.category)}</div>`; last = c.category; }
        const sub = typeof c.sub === "function" ? c.sub() : c.sub;
        html += `<button type="button" class="cp-item ${i === active ? "is-active" : ""}" data-i="${i}" role="option" aria-selected="${i === active}">${icon(c.icon || "arrow")}<span>${esc(c.label)}</span>${sub ? `<small>${esc(sub)}</small>` : ""}${c.shortcut ? `<kbd class="ws-kbd">${esc(kbd(c.shortcut))}</kbd>` : ""}</button>`;
      });
      list.innerHTML = html;
      list.querySelectorAll("[data-i]").forEach((b) => { b.onclick = () => run(shown[+b.dataset.i]); b.onmousemove = () => { if (active === +b.dataset.i) return; active = +b.dataset.i; list.querySelectorAll(".cp-item").forEach((x) => x.classList.toggle("is-active", +x.dataset.i === active)); }; });
      list.querySelector(".cp-item.is-active")?.scrollIntoView({ block: "nearest" });
    }
    async function run(cmd) {
      if (!cmd) return;
      remember(cmd.id);
      closePalette();
      try { await cmd.run(); } catch (error) { App.showToast(error.message, "error", cmd.label); }
    }
    input.addEventListener("input", () => { active = 0; paint(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(shown.length - 1, active + 1); paint(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); paint(); }
      else if (e.key === "Enter") { e.preventDefault(); run(shown[active]); }
      else if (e.key === "Escape") { e.preventDefault(); closePalette(); }
      e.stopPropagation();
    });
    paletteEl.addEventListener("click", (e) => { if (e.target === paletteEl) closePalette(); });
    paint();
    input.focus();
  }
  function closePalette() { paletteEl?.remove(); paletteEl = null; }

  function renderContext() { renderBreadcrumb(); refreshProjectLabel(); }

  function findingCard(item) {
    return `<article class="finding ${String(item.severity || "info").toLowerCase()}"><div><span class="ws-badge ${String(item.severity || "info").toLowerCase()}">${esc(item.severity)}</span> <span class="ws-badge">${esc(item.source || "deterministic")}</span></div><strong>${esc(item.title)}</strong><p>${esc(item.description || item.explanation || "")}</p><p class="ws-muted">${esc(item.file || "snippet")}:${item.line || "?"} · confidence ${Math.round(Number(item.confidence || 0) * (Number(item.confidence || 0) <= 1 ? 100 : 1))}%</p><p><b>Evidence:</b> ${esc(Array.isArray(item.evidence) ? item.evidence.join(" ") : item.whyItHappens || "Unavailable")}</p><p><b>Recommendation:</b> ${esc(item.recommendation || item.fix || "Review the code.")}</p></article>`;
  }

  // One connected environment: any page can hand a file+line to the editor.
  function openInStudio({ file, line, column, findingId, panel, scanId } = {}) {
    const params = new URLSearchParams();
    const scan = scanId || currentScan()?.id;
    if (scan) params.set("scanId", scan);
    if (file) params.set("file", file);
    if (line) params.set("line", String(line));
    if (column) params.set("column", String(column));
    if (findingId) params.set("finding", findingId);
    if (panel) params.set("panel", panel);
    if (file) localStorage.setItem("bugai_current_file", file);
    location.href = `studio.html${params.toString() ? `?${params}` : ""}`;
  }

  // Honour ?scanId= on any page: fetch that stored scan and make it the current
  // context, so links between pages restore the same analysis without rescanning.
  async function resolveScanFromUrl() {
    const wanted = new URLSearchParams(location.search).get("scanId");
    const current = currentScan();
    if (!wanted || (current && current.id === wanted)) return current;
    try {
      const { scan } = await App.api(`/scans/${wanted}`);
      setContext({ scan, file: scan.inputType === "code" ? (scan.sourceName || "") : selectedFile() });
      return scan;
    } catch (error) {
      App.showToast(error.message, "error", "Scan not available");
      return current;
    }
  }

  // Persist a triage decision on the stored scan and mirror it into the cached copy.
  async function setFindingStatus(findingId, status) {
    const scan = currentScan();
    if (!scan?.id) throw new Error("This analysis is not stored, so triage cannot be saved.");
    const out = await App.api(`/scans/${scan.id}/findings/${encodeURIComponent(findingId)}/status`, { method: "POST", body: { status } });
    (scan.findings || []).forEach((f) => { if (f.id === findingId) f.triage = out.triage; });
    setContext({ scan });
    return out.triage;
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

  return { renderShell, setContext, cacheClear, registerCommands, runCommand, availableCommands, openPalette, resolveScanFromUrl, setFindingStatus, selectedProject, selectedFile, currentScan, esc, findingCard, loadProjects, requireScan, icon, renderBreadcrumb, refreshNotificationBadge, loadProfile, openInStudio, maskSecret, emptyState };
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
