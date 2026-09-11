const App = (() => {
  const state = {
    token: localStorage.getItem("bugzero_token") || "",
    user: JSON.parse(localStorage.getItem("bugzero_user") || "null"),
    apiBase: localStorage.getItem("bugzero_api_base") || ""
  };

  function normalizeApiBase(value) {
    return String(value || "").replace(/\/$/, "");
  }

  function getApiBaseCandidates() {
    const candidates = [];
    const addCandidate = (value) => {
      const normalized = normalizeApiBase(value);
      if (normalized && !candidates.includes(normalized)) {
        candidates.push(normalized);
      }
    };

    addCandidate(state.apiBase);

    if (window.location.protocol !== "file:") {
      addCandidate(`${window.location.origin}/api`);
    }

    addCandidate("http://127.0.0.1:8080/api");
    addCandidate("http://localhost:8080/api");

    return candidates;
  }

  function setApiBase(value) {
    const normalized = normalizeApiBase(value);
    state.apiBase = normalized;
    if (normalized) {
      localStorage.setItem("bugzero_api_base", normalized);
    } else {
      localStorage.removeItem("bugzero_api_base");
    }
  }

  function resolveApiBase() {
    return getApiBaseCandidates()[0] || "http://127.0.0.1:8080/api";
  }

  async function discoverApiBase() {
    for (const candidate of getApiBaseCandidates()) {
      try {
        const response = await fetch(`${candidate}/health`);
        if (response.ok) {
          setApiBase(candidate);
          return candidate;
        }
      } catch {
        // Try the next candidate until one responds.
      }
    }

    return resolveApiBase();
  }

  function ensureToastContainer() {
    if (!document.getElementById("toast-container")) {
      const container = document.createElement("div");
      container.id = "toast-container";
      document.body.appendChild(container);
    }
  }

  function showToast(message, type = "success", title = "BUG AI") {
    ensureToastContainer();
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div>${type === "error" ? "!" : type === "warning" ? "~" : "+"}</div>
      <div>
        <strong>${title}</strong>
        <div>${message}</div>
      </div>
    `;
    document.getElementById("toast-container").appendChild(toast);
    setTimeout(() => toast.remove(), 3600);
  }

  function setTheme(theme) {
    const resolved = theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : theme;
    document.documentElement.setAttribute("data-theme", resolved);
    localStorage.setItem("bugzero_theme", theme);
    const toggle = document.querySelector("[data-theme-toggle]");
    if (toggle) {
      const label = theme === "system" ? "Auto" : resolved === "light" ? "Light" : "Dark";
      // The workspace shell renders an icon inside this button; only pages that
      // use the plain text button get their label overwritten.
      if (!toggle.querySelector("#ws-theme-icon")) toggle.textContent = label;
      else toggle.title = `Theme: ${label}`;
      toggle.setAttribute("aria-label", `Current theme ${resolved}`);
    }
  }

  function initTheme() {
    setTheme(localStorage.getItem("bugzero_theme") || "system");
    // Delegated: workspace pages render their shell after this runs, so a
    // listener bound to the button directly would never attach there.
    document.addEventListener("click", (event) => {
      if (!event.target.closest?.("[data-theme-toggle]")) return;
      const current = localStorage.getItem("bugzero_theme") || "system";
      const next = current === "dark" ? "light" : current === "light" ? "system" : "dark";
      setTheme(next);
      showToast(`Theme switched to ${next}.`, "success", "Display mode");
    });
    // Refresh the toggle label once any late-rendered shell exists.
    setTimeout(() => setTheme(localStorage.getItem("bugzero_theme") || "system"), 0);
  }

  function initReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
        }
      });
    }, { threshold: 0.12 });

    document.querySelectorAll(".reveal").forEach((node) => observer.observe(node));
  }

  function saveSession(session) {
    state.token = session.token;
    state.user = session.user;
    localStorage.setItem("bugzero_token", session.token);
    localStorage.setItem("bugzero_user", JSON.stringify(session.user));
  }

  function clearSession() {
    state.token = "";
    state.user = null;
    localStorage.removeItem("bugzero_token");
    localStorage.removeItem("bugzero_user");
  }

  function getUser() {
    return state.user;
  }

  function isAuthed() {
    return Boolean(state.token);
  }

  function requireAuth(redirect = "login.html") {
    if (!isAuthed()) {
      window.location.href = redirect;
      return false;
    }
    return true;
  }

  // The shell's Online pill reflects whether the last real call reached the API.
  function signalConnection(ok) {
    try { window.dispatchEvent(new CustomEvent("bugai:api", { detail: { ok } })); } catch { /* no DOM in tests */ }
  }

  async function api(path, options = {}) {
    const apiBase = await discoverApiBase();
    let response;
    try {
      response = await fetch(`${apiBase}${path}`, {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
          ...(options.headers || {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    } catch (error) {
      signalConnection(false);
      throw error;
    }
    signalConnection(true);

    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { error: text };
      }
    }
    if (!response.ok) {
      throw new Error(payload.error || "Request failed");
    }
    return payload;
  }

  async function checkServerConnection() {
    try {
      const apiBase = await discoverApiBase();
      const response = await fetch(`${apiBase}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  function bindLogout(selector = "[data-logout]") {
    document.querySelectorAll(selector).forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        clearSession();
        window.location.href = "login.html";
      });
    });
  }

  function bindUserText() {
    const user = getUser();
    document.querySelectorAll("[data-user-name]").forEach((node) => {
      node.textContent = user?.username || "Developer";
    });
  }

  function formatSeverityClass(severity) {
    const value = String(severity || "low").toLowerCase();
    return ["critical", "high", "medium", "low"].includes(value) ? value : "low";
  }

  function downloadTextFile(filename, content, mime = "text/plain") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function printReport(scan) {
    const sourceCode = scan.sourceCode || scan.sourcePreview || "";
    const fixedCode = scan.fixedCode || sourceCode;
    const html = `
      <html>
        <head>
          <title>${scan.sourceName} report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; line-height: 1.5; color: #111; }
            h1,h2,h3 { margin-bottom: 8px; }
            .card { border: 1px solid #ddd; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
            .badge { display:inline-block; padding: 4px 10px; border-radius:999px; background:#f1f5f9; margin-right:8px; }
            pre { background:#f8fafc; padding: 12px; border-radius: 8px; overflow:auto; }
          </style>
        </head>
        <body>
          <h1>BugZero AI Bug Prediction Report</h1>
          <p>${scan.summary}</p>
          <div class="card">
            <strong>Risk score:</strong> ${scan.riskScore}%<br>
            <strong>Risk level:</strong> ${scan.riskLevel}<br>
            <strong>Quality score:</strong> ${scan.codeQualityScore}/100<br>
            <strong>Generated:</strong> ${new Date(scan.createdAt).toLocaleString()}
          </div>
          <h2>Original Code</h2>
          <pre>${escapeHtml(sourceCode)}</pre>
          <h2>Detected Issues</h2>
          ${scan.bugs.map((bug) => `
            <div class="card">
              <div class="badge">${bug.severity.toUpperCase()}</div>
              <strong>Line ${bug.line}: ${bug.title}</strong>
              <p>${bug.explanation}</p>
              <p><strong>Why:</strong> ${bug.whyItHappens}</p>
              <p><strong>Fix:</strong> ${bug.fix}</p>
              <pre>${escapeHtml(bug.snippet || "")}</pre>
            </div>
          `).join("")}
          <h2>Fixed Code</h2>
          <pre>${escapeHtml(fixedCode)}</pre>
        </body>
      </html>
    `;
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  async function exportReport(scanId, format = "json") {
    const payload = await api(`/history/${scanId}/export?format=${encodeURIComponent(format)}`);
    downloadTextFile(payload.filename, payload.content, payload.mime);
    return payload;
  }

  async function getAnalytics() {
    return api("/analytics");
  }

  async function getWorkspace() {
    return api("/workspace");
  }

  async function inviteTeammate(body) {
    return api("/workspace/invite", {
      method: "POST",
      body
    });
  }

  async function getNotifications() {
    return api("/notifications");
  }

  async function markNotificationRead(notificationId) {
    return api(`/notifications/${notificationId}/read`, { method: "POST" });
  }

  async function getComments(scanId) {
    return api(`/reports/${scanId}/comments`);
  }

  async function addComment(scanId, message) {
    return api(`/reports/${scanId}/comments`, {
      method: "POST",
      body: { message }
    });
  }

  async function askAssistant(message, scanId, projectId) {
    return api("/assistant/chat", {
      method: "POST",
      body: { message, scanId, projectId }
    });
  }

  async function getDevopsTemplates() {
    return api("/devops/templates");
  }

  function createLoadingMarkup(label = "Scanning code intelligence") {
    return `
      <div class="panel">
        <div class="loading-bar"><span></span></div>
        <p style="margin-top:14px;">${label}...</p>
      </div>
    `;
  }

  document.addEventListener("DOMContentLoaded", () => {
    ensureToastContainer();
    initTheme();
    initReveal();
    bindLogout();
    bindUserText();
  });

  return {
    api,
    bindLogout,
    clearSession,
    createLoadingMarkup,
    downloadTextFile,
    formatSeverityClass,
    getUser,
    isAuthed,
    checkServerConnection,
    escapeHtml,
    exportReport,
    printReport,
    getAnalytics,
    getWorkspace,
    inviteTeammate,
    getNotifications,
    markNotificationRead,
    getComments,
    addComment,
    askAssistant,
    getDevopsTemplates,
    requireAuth,
    saveSession,
    showToast
  };
})();

window.App = App;
