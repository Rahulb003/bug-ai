const BugWorkspace = (() => {
  const page = document.body.dataset.page || "dashboard";
  const links = [
    ["Main", [["dashboard.html", "Dashboard"], ["studio.html", "Code Studio"], ["projects.html", "Projects"]]],
    ["Analyze", [["analyzer.html", "Bug Analyzer"], ["optimizer.html", "Optimizer"], ["security.html", "Security"], ["tests.html", "Test Lab"], ["review.html", "Code Review"]]],
    ["Understand", [["architecture.html", "Architecture"], ["dependencies.html", "Dependencies"], ["assistant.html", "AI Assistant"]]],
    ["Development", [["git.html", "Git / GitHub"]]],
    ["Insights", [["analytics.html", "Analytics"], ["history.html", "History"]]],
    ["Settings", [["settings.html", "Settings"]]]
  ];
  const pageFile = `${page}.html`;
  const selectedProject = () => localStorage.getItem("bugai_current_project") || "";
  const selectedFile = () => localStorage.getItem("bugai_current_file") || "";
  const currentScan = () => { try { return JSON.parse(localStorage.getItem("bugai_current_scan") || "null"); } catch { return null; } };
  const setContext = ({ projectId, file, scan } = {}) => { if (projectId !== undefined) localStorage.setItem("bugai_current_project", projectId || ""); if (file !== undefined) localStorage.setItem("bugai_current_file", file || ""); if (scan !== undefined) localStorage.setItem("bugai_current_scan", JSON.stringify(scan || null)); renderContext(); };
  const esc = (value) => App.escapeHtml(value);
  function renderShell() {
    const root = document.getElementById("workspace-shell"); if (!root) return;
    root.classList.add("ws-shell"); // workspace.css defines the sidebar/main grid on this class.
    root.innerHTML = `<aside class="ws-sidebar"><a class="ws-brand" href="dashboard.html"><i>◈</i> BUG AI</a><nav class="ws-nav">${links.map(([title, group]) => `<div class="ws-nav-title">${title}</div>${group.map(([href,label]) => `<a class="${href === pageFile ? "active" : ""}" href="${href}">${label}</a>`).join("")}`).join("")}</nav></aside><main class="ws-main"><header class="ws-topbar"><div><h1>${document.title.replace(" | BUG AI", "")}</h1><div class="ws-context" id="ws-context">No project selected</div></div><div class="ws-toolbar"><button class="ws-button" data-theme-toggle>Theme</button><a class="ws-button" href="dashboard.html">Workspace</a></div></header><section class="ws-content" id="workspace-content"></section></main>`;
    renderContext();
  }
  function renderContext() { const el = document.getElementById("ws-context"); if (el) el.textContent = selectedProject() ? `Project: ${selectedProject()}${selectedFile() ? ` · ${selectedFile()}` : ""}` : "No project selected · paste code in Studio"; }
  function findingCard(item) { return `<article class="finding ${String(item.severity || "info").toLowerCase()}"><div><span class="ws-badge ${String(item.severity || "info").toLowerCase()}">${esc(item.severity)}</span> <span class="ws-badge">${esc(item.source || "deterministic")}</span></div><strong>${esc(item.title)}</strong><p>${esc(item.description || item.explanation || "")}</p><p class="ws-muted">${esc(item.file || "snippet")}:${item.line || "?"} · confidence ${Math.round(Number(item.confidence || 0) * (Number(item.confidence || 0) <= 1 ? 100 : 1))}%</p><p><b>Evidence:</b> ${esc(Array.isArray(item.evidence) ? item.evidence.join(" ") : item.whyItHappens || "Unavailable")}</p><p><b>Recommendation:</b> ${esc(item.recommendation || item.fix || "Review the code.")}</p></article>`; }
  async function loadProjects() { return (await App.api("/projects")).projects || []; }
  function requireScan(target) { const scan = currentScan(); if (!scan) { target.innerHTML = `<div class="ws-empty"><h2>No active analysis</h2><p>Open Code Studio, analyze code, then return here.</p><a class="ws-button primary" href="studio.html">Open Code Studio</a></div>`; return null; } return scan; }
  return { renderShell, setContext, selectedProject, selectedFile, currentScan, esc, findingCard, loadProjects, requireScan };
})();
window.BugWorkspace = BugWorkspace;
document.addEventListener("DOMContentLoaded", () => { BugWorkspace.renderShell(); });
