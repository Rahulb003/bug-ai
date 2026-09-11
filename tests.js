document.addEventListener("DOMContentLoaded", async () => {
  if (!App.requireAuth()) return;
  const root = document.getElementById("workspace-content");
  const esc = BugWorkspace.esc;
  const icon = (n, c) => BugWorkspace.icon(n, c);

  let input = null;
  try { input = JSON.parse(localStorage.getItem("bugai_studio_input") || "null"); } catch { input = null; }
  const scan = BugWorkspace.currentScan();
  if (!input?.code) input = scan?.sourceCode ? { code: scan.sourceCode, filename: scan.sourceName, language: scan.language } : null;

  const projectId = BugWorkspace.selectedProject();
  let generated = [];

  root.innerHTML = BugPages.header({
    title: "Test Lab",
    subtitle: input ? esc(input.filename || "snippet") + " · " + esc(input.language || "auto") : "No file loaded — existing project tests can still be discovered",
    actions: '<a class="ws-button" href="studio.html">Back to Studio</a>'
  })
  + '<div id="tl-capability" class="ws-notice">Checking what can actually be executed here…</div>'
  + '<div class="tl-tabs">' + [["generate", "Generate"], ["existing", "Existing tests"], ["results", "Run results"]].map(([v, l], i) => '<button class="op-tab' + (i === 0 ? " active" : "") + '" data-tl="' + v + '">' + l + "</button>").join("") + "</div>"
  + '<div data-tlp="generate">'
  + '<div class="ws-toolbar" style="margin:14px 0">'
  + '<button class="ws-button primary" id="tl-generate">' + icon("flask") + " Generate tests</button>"
  + '<button class="ws-button" id="tl-run" disabled>' + icon("studio") + " Run generated tests</button>"
  + '<button class="ws-button" id="tl-download" disabled>Download</button>'
  + "</div><div id=\"tl-generated\"></div></div>"
  + '<div data-tlp="existing" hidden><div id="tl-existing"></div></div>'
  + '<div data-tlp="results" hidden><div id="tl-results"></div></div>';

  document.querySelectorAll("[data-tl]").forEach((t) => t.onclick = () => {
    document.querySelectorAll("[data-tl]").forEach((x) => x.classList.toggle("active", x === t));
    document.querySelectorAll("[data-tlp]").forEach((p) => p.hidden = p.dataset.tlp !== t.dataset.tl);
  });

  // ---- capability: say up front whether execution is possible -----------
  let capability = { status: "not_available", reason: "Unknown." };
  try {
    capability = await App.api("/test/capability?language=" + encodeURIComponent(input?.language || "javascript"));
  } catch (error) { capability = { status: "not_available", reason: error.message }; }
  const capEl = document.getElementById("tl-capability");
  capEl.className = "ws-notice " + (capability.status === "available" ? "tone-ok" : "tone-warn");
  capEl.innerHTML = capability.status === "available"
    ? "<b>Execution available</b> — " + esc(capability.reason)
    : "<b>Execution NOT AVAILABLE</b> — " + esc(capability.reason) + " Tests can still be generated and inspected; they will not be reported as passing.";

  if (!input) {
    document.getElementById("tl-generated").innerHTML = BugWorkspace.emptyState({ title: "No file loaded", body: "Open a file in Code Studio and press Generate tests, or switch to the Existing tests tab.", actionHref: "studio.html", actionLabel: "Open Code Studio" });
    document.getElementById("tl-generate").disabled = true;
  }

  // ---- generate ---------------------------------------------------------
  document.getElementById("tl-generate").onclick = async () => {
    const box = document.getElementById("tl-generated");
    box.innerHTML = '<p class="ws-muted">Generating…</p>';
    try {
      const out = await App.api("/test/generate", { method: "POST", body: { code: input.code, filename: input.filename, language: input.language } });
      generated = (out.tests || []).filter((t) => String(t.code || "").trim());
      box.innerHTML = '<div class="ws-notice ' + (out.status === "generated" ? "tone-ok" : "tone-warn") + '"><b>' + esc(out.status) + "</b> · " + esc(out.framework || out.reason || "") + "</div>"
        + (out.tests?.length ? out.tests.map((t) => '<article class="ws-card tl-test"><header><b>' + esc(t.name) + '</b><span class="ws-badge">' + esc(t.status || "") + '</span></header><p class="ws-muted">' + esc(t.intent || "") + "</p>" + (t.code ? '<pre class="ws-code">' + esc(t.code) + "</pre>" : '<p class="ws-muted">No runnable code — this is a plan entry only.</p>') + "</article>").join("")
           : BugWorkspace.emptyState({ title: "No tests generated", body: out.reason || "Nothing was produced for this source." }));
      const canRun = generated.length && capability.status === "available";
      document.getElementById("tl-run").disabled = !canRun;
      document.getElementById("tl-download").disabled = !generated.length;
      if (generated.length && !canRun) App.showToast("Generated, but this environment cannot execute them.", "warning", "Not runnable here");
    } catch (error) { box.innerHTML = BugWorkspace.emptyState({ title: "Generation failed", body: error.message }); }
  };

  document.getElementById("tl-download").onclick = () => {
    const body = generated.map((t) => "// " + t.name + "\n" + t.code).join("\n\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    a.download = String(input?.filename || "generated").split("/").pop().replace(/\.[^.]+$/, "") + ".test.js";
    a.click(); URL.revokeObjectURL(a.href);
  };

  // ---- run --------------------------------------------------------------
  document.getElementById("tl-run").onclick = async () => {
    document.querySelector("[data-tl=results]").click();
    const box = document.getElementById("tl-results");
    box.innerHTML = '<p class="ws-muted">Executing in the sandbox…</p>';
    try {
      const out = await App.api("/test/run", { method: "POST", body: { tests: generated, language: input.language, filename: input.filename, code: input.code } });
      if (out.status !== "completed") { box.innerHTML = BugWorkspace.emptyState({ title: "Tests were NOT run", body: out.reason || "Execution is not available." }); return; }
      const t = out.totals;
      box.innerHTML = '<div class="ws-grid cols-3"><div class="ws-card"><span class="ws-muted">Suites executed</span><div class="ws-metric">' + t.suites + "</div></div>"
        + '<div class="ws-card"><span class="ws-muted">Assertions passed</span><div class="ws-metric" style="color:var(--ws-ok)">' + t.passed + "</div></div>"
        + '<div class="ws-card"><span class="ws-muted">Assertions failed</span><div class="ws-metric" style="color:' + (t.failed ? "var(--ws-danger)" : "var(--ws-muted)") + '">' + t.failed + "</div></div></div>"
        + '<p class="ws-muted" style="margin-top:12px">Runner: <code>' + esc(out.runner) + "</code> · coverage: <b>" + esc(out.coverage.status.replaceAll("_", " ")) + "</b> — " + esc(out.coverage.reason) + "</p>"
        + out.results.map((r) => {
            const tone = r.status === "passed" ? "ok" : r.status === "timed_out" ? "warn" : "bad";
            return '<article class="ws-card tl-result tone-' + tone + '"><header><b>' + esc(r.name) + '</b><span class="ws-badge ' + (r.status === "passed" ? "low" : "high") + '">' + esc(String(r.status).replaceAll("_", " ")) + "</span></header>"
              + '<p class="ws-muted">exit ' + esc(String(r.exitCode)) + " · " + (r.total || 0) + " test(s), " + (r.passed || 0) + " passed, " + (r.failed || 0) + " failed" + (r.durationMs ? " · " + r.durationMs + "ms" : "") + (r.timedOut ? " · killed by timeout" : "") + "</p>"
              + (r.command ? '<p class="ws-muted">Command: <code>' + esc(r.command) + "</code></p>" : "")
              + (r.failures?.length ? '<div class="tl-failures">' + r.failures.map((f) => "<div><b>" + esc(f.test) + "</b>" + (f.detail ? '<pre class="ws-code">' + esc(f.detail) + "</pre>" : "") + "</div>").join("") + "</div>" : "")
              + (r.stdout ? '<details class="fcard-more"><summary>stdout</summary><pre class="ws-code">' + esc(r.stdout) + "</pre></details>" : "")
              + (r.stderr ? '<details class="fcard-more"><summary>stderr</summary><pre class="ws-code">' + esc(r.stderr) + "</pre></details>" : "")
              + "</article>";
          }).join("")
        + '<p class="ws-muted">' + esc(out.note) + "</p>";
    } catch (error) { box.innerHTML = BugWorkspace.emptyState({ title: "Run failed", body: error.message }); }
  };

  // ---- existing project tests -------------------------------------------
  const exBox = document.getElementById("tl-existing");
  if (!projectId) {
    exBox.innerHTML = BugWorkspace.emptyState({ title: "No project selected", body: "Pick a project from the switcher to discover its test files.", actionHref: "projects.html", actionLabel: "Open Projects" });
  } else {
    try {
      const found = await App.api("/projects/" + projectId + "/tests");
      exBox.innerHTML = '<div class="ws-notice tone-warn"><b>Discovered, not executed</b> — ' + esc(found.executionReason) + "</div>"
        + (found.count ? found.files.map((f) => '<article class="ws-card tl-test"><header><button class="pg-link" data-file="' + esc(f.name) + '">' + esc(f.name) + '</button><span class="ws-badge">' + esc(f.language || "unknown") + '</span><span class="ws-badge">' + f.lines + " lines</span></header>"
            + (f.cases.length ? '<ul class="ws-list">' + f.cases.map((c) => "<li>" + esc(c) + "</li>").join("") + "</ul>" : '<p class="ws-muted">No test case names were parsed from this file.</p>') + "</article>").join("")
          : BugWorkspace.emptyState({ title: "No test files found", body: "Nothing in this project matched a test path or *.test.* / *.spec.* name." }));
      exBox.querySelectorAll("[data-file]").forEach((b) => b.onclick = () => BugWorkspace.openInStudio({ file: b.dataset.file }));
    } catch (error) { exBox.innerHTML = BugWorkspace.emptyState({ title: "Could not read project tests", body: error.message }); }
  }
});
