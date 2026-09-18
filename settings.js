document.addEventListener("DOMContentLoaded", async () => {
  if (!App.requireAuth()) return;
  const root = document.getElementById("workspace-content");
  const esc = BugWorkspace.esc;

  // Preferences are browser-local; there is no server-side settings model.
  // Defaults are what the pages already assume, so an unset preference changes nothing.
  const DEFAULTS = { theme: "system", variant: "graphite", accent: "indigo", density: "comfortable", editorFontSize: 13, editorMinimap: true, editorWordWrap: false, defaultLanguage: "auto", includeAiOnScan: true, toasts: true, confirmAiFixes: true };
  const load = () => { try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem("bugai_prefs") || "{}")) }; } catch { return { ...DEFAULTS }; } };
  const save = (prefs) => { try { localStorage.setItem("bugai_prefs", JSON.stringify(prefs)); } catch { /* private mode */ } };
  let prefs = load();

  root.innerHTML = BugPages.header({ title: "Settings", subtitle: "Profile and configuration status come from the server; preferences are stored in this browser only." })
    + '<div class="ws-grid cols-2">'
    + '<section class="ws-card" id="s-profile"><h3>Profile</h3><p class="ws-muted">Loading…</p></section>'
    + '<section class="ws-card" id="s-ai"><h3>AI configuration</h3><p class="ws-muted">Loading…</p></section>'
    + '<section class="ws-card"><h3>Editor</h3>'
    + '<label class="s-row"><span>Font size</span><input class="ws-input" type="number" min="10" max="22" id="p-font" style="width:90px"></label>'
    + '<label class="s-row"><span>Minimap</span><input type="checkbox" id="p-minimap"></label>'
    + '<label class="s-row"><span>Word wrap</span><input type="checkbox" id="p-wrap"></label>'
    + '<label class="s-row"><span>Theme</span><select class="ws-select" id="p-theme" style="width:auto"><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select></label>'
    + '<label class="s-row"><span>Variant <small class="ws-muted">(dark only)</small></span><select class="ws-select" id="p-variant" style="width:auto"><option value="graphite">Graphite</option><option value="aurora">Obsidian Aurora</option><option value="midnight">Midnight</option></select></label>'
    + '<label class="s-row"><span>Accent</span><select class="ws-select" id="p-accent" style="width:auto"><option value="indigo">Indigo</option><option value="blue">Blue</option><option value="violet">Violet</option><option value="cyan">Cyan</option><option value="emerald">Emerald</option></select></label>'
    + '<label class="s-row"><span>Density</span><select class="ws-select" id="p-density" style="width:auto"><option value="comfortable">Comfortable</option><option value="compact">Compact</option><option value="spacious">Spacious</option></select></label></section>'
    + '<section class="ws-card"><h3>Analysis</h3>'
    + '<label class="s-row"><span>Default language for new snippets</span><select class="ws-select" id="p-lang" style="width:auto"><option value="auto">Auto detect</option><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="python">Python</option><option value="java">Java</option><option value="go">Go</option><option value="rust">Rust</option></select></label>'
    + '<label class="s-row"><span>Include AI reasoning when analyzing</span><input type="checkbox" id="p-ai"></label>'
    + '<label class="s-row"><span>Confirm each AI-proposed fix before applying</span><input type="checkbox" id="p-confirm"></label>'
    + '<p class="ws-muted">Deterministic analysis always runs. AI reasoning is additive and separately labelled.</p></section>'
    + '<section class="ws-card"><h3>Notifications</h3><label class="s-row"><span>Show toast notifications</span><input type="checkbox" id="p-toasts"></label><p class="ws-muted">Server-side notifications (scan completed, invites) are unaffected and still appear in the bell.</p></section>'
    + '<section class="ws-card" id="s-env"><h3>Verification environment</h3><p class="ws-muted">Loading…</p></section>'
    + "</div>"
    + '<section class="ws-card" style="margin-top:16px"><h3>Workspace state</h3><p class="ws-muted">Project, file and scan selection are stored in this browser.</p><pre class="ws-code" id="state"></pre><div class="ws-toolbar"><button class="ws-button danger" id="clear">Clear local workspace selection</button><button class="ws-button" id="reset-prefs">Reset preferences</button></div></section>';

  // Bind preference controls.
  const bind = (id, key, kind) => {
    const el = document.getElementById(id);
    if (kind === "check") { el.checked = Boolean(prefs[key]); el.onchange = () => { prefs[key] = el.checked; save(prefs); if (key === "theme") App.setTheme?.(prefs.theme); App.showToast("Preference saved.", "success", "Settings"); }; }
    else { el.value = prefs[key]; el.onchange = () => { prefs[key] = kind === "number" ? Number(el.value) : el.value; save(prefs); if (key === "theme") { localStorage.setItem("bugzero_theme", prefs.theme); location.reload(); } else { App.applyAppearance?.(); App.showToast("Preference saved.", "success", "Settings"); } }; }
  };
  bind("p-variant", "variant", "select"); bind("p-accent", "accent", "select"); bind("p-density", "density", "select");
  bind("p-font", "editorFontSize", "number"); bind("p-minimap", "editorMinimap", "check"); bind("p-wrap", "editorWordWrap", "check");
  document.getElementById("p-theme").value = localStorage.getItem("bugzero_theme") || "system";
  document.getElementById("p-theme").onchange = (e) => { localStorage.setItem("bugzero_theme", e.target.value); location.reload(); };
  bind("p-lang", "defaultLanguage", "select"); bind("p-ai", "includeAiOnScan", "check"); bind("p-confirm", "confirmAiFixes", "check"); bind("p-toasts", "toasts", "check");

  document.getElementById("state").textContent = JSON.stringify({ project: BugWorkspace.selectedProject() || null, file: BugWorkspace.selectedFile() || null, scan: BugWorkspace.currentScan()?.id || null }, null, 2);
  document.getElementById("clear").onclick = () => { BugWorkspace.setContext({ projectId: "", file: "", scan: null }); BugWorkspace.cacheClear(); location.reload(); };
  document.getElementById("reset-prefs").onclick = () => { localStorage.removeItem("bugai_prefs"); location.reload(); };

  // Server-backed sections.
  const [profile, caps] = await Promise.all([BugWorkspace.loadProfile(), App.api("/system/capabilities").catch((e) => ({ error: e.message }))]);
  document.getElementById("s-profile").innerHTML = "<h3>Profile</h3>" + (profile
    ? '<dl class="pg-kv"><dt>Username</dt><dd>' + esc(profile.username) + "</dd><dt>Email</dt><dd>" + esc(profile.email) + "</dd><dt>Role</dt><dd>" + esc(profile.role || "user") + "</dd><dt>Member since</dt><dd>" + esc(profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "—") + '</dd></dl><p class="ws-muted">Password change and profile editing have no server endpoint yet, so they are not offered here.</p>'
    : '<p class="ws-muted">Profile could not be loaded.</p>');
  if (caps.error) {
    document.getElementById("s-ai").innerHTML = "<h3>AI configuration</h3><p class=\"ws-muted\">" + esc(caps.error) + "</p>";
    document.getElementById("s-env").innerHTML = "<h3>Verification environment</h3><p class=\"ws-muted\">" + esc(caps.error) + "</p>";
  } else {
    document.getElementById("s-ai").innerHTML = "<h3>AI configuration</h3>"
      + '<dl class="pg-kv"><dt>Provider</dt><dd>Google Gemini</dd><dt>API key</dt><dd>' + (caps.ai.configured ? '<span class="ws-badge low">configured</span> <code>' + esc(caps.ai.keyHint) + "</code>" : '<span class="ws-badge high">not configured</span>') + "</dd><dt>Model</dt><dd><code>" + esc(caps.ai.model) + "</code></dd><dt>Explain modes</dt><dd>" + esc(caps.ai.explainModes.join(", ")) + "</dd></dl>"
      + '<p class="ws-muted">The key lives in <code>.env</code> on the server and is never sent to the browser. Change <code>GEMINI_API_KEY</code> or <code>GEMINI_MODEL</code> there and restart.</p>';
    document.getElementById("s-env").innerHTML = "<h3>Verification environment</h3>"
      + '<dl class="pg-kv"><dt>Execution sandbox</dt><dd>' + (caps.sandbox.enabled ? '<span class="ws-badge low">enabled</span>' : '<span class="ws-badge">disabled</span>') + " · " + esc(caps.sandbox.isolation) + " · network " + esc(caps.sandbox.network) + " · " + caps.sandbox.timeoutMs + "ms timeout</dd>"
      + "<dt>JavaScript tests</dt><dd>" + esc(caps.testRunners.javascript.status.replaceAll("_", " ")) + " — " + esc(caps.testRunners.javascript.reason) + "</dd>"
      + "<dt>Python tests</dt><dd>" + esc(caps.testRunners.python.status.replaceAll("_", " ")) + " — " + esc(caps.testRunners.python.reason) + "</dd>"
      + "<dt>Rate limit</dt><dd>" + caps.rateLimit.perMinute + "/min, " + esc(caps.rateLimit.scope) + "</dd>"
      + "<dt>JWT secret</dt><dd>" + (caps.jwtSecretConfigured ? '<span class="ws-badge low">set</span>' : '<span class="ws-badge high">using the built-in dev default</span> — set JWT_SECRET before deploying') + "</dd>"
      + "<dt>Node</dt><dd>" + esc(caps.node) + "</dd></dl>"
      + '<p class="ws-muted">Toggle the sandbox with <code>EXECUTION_SANDBOX_ENABLED</code> in <code>.env</code>. Compilation, type checking and linting have no configured toolchain and report not available.</p>';
  }
});
