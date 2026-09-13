// BUG AI motion runtime: the startup sequence, page-leave transitions, and the
// small interaction helpers pages share. Purely presentational; nothing here
// reports a state the backend has not produced.
const BugMotion = (() => {
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));

  // --- startup ---------------------------------------------------------------
  // Plays once per browser session. Authenticated returning users get the short
  // form (~1.2s); first-time visitors the full form (~1.7s). Skippable.
  async function boot({ short = false } = {}) {
    let played = false;
    try { played = sessionStorage.getItem("bugai_booted") === "1"; } catch { played = false; }
    if (played || reduced()) { try { sessionStorage.setItem("bugai_booted", "1"); } catch { /* ignore */ } return; }
    const el = document.createElement("div");
    el.className = "boot";
    el.innerHTML = '<div class="boot-beam"></div><div class="boot-mark"><b>BUG AI</b><small>CODE SMARTER. BUILD SAFER.</small></div><button class="boot-skip" type="button">Skip</button>';
    document.body.appendChild(el);
    let skipped = false;
    el.querySelector(".boot-skip").onclick = () => { skipped = true; };
    // Stage 1-3: mark scales in, tagline fades, beam passes (CSS-timed).
    for (let t = 0; t < (short ? 620 : 1000) && !skipped; t += 50) await wait(50);
    // Stage 4: settle toward where the brand lives in the shell, if present.
    const target = document.querySelector(".ws-brand-mark") || document.querySelector(".ws-brand");
    const mark = el.querySelector(".boot-mark");
    if (target && !skipped) {
      const a = mark.getBoundingClientRect(), b = target.getBoundingClientRect();
      el.style.setProperty("--boot-dx", `${b.left + b.width / 2 - (a.left + a.width / 2)}px`);
      el.style.setProperty("--boot-dy", `${b.top + b.height / 2 - (a.top + a.height / 2)}px`);
      el.style.setProperty("--boot-scale", String(Math.max(0.12, b.height / a.height)));
    }
    el.classList.add("is-settling");
    await wait(skipped ? 0 : 420);
    // Stage 5: fade the overlay away; the page beneath is already rendered.
    el.classList.add("is-done");
    await wait(260);
    el.remove();
    try { sessionStorage.setItem("bugai_booted", "1"); } catch { /* ignore */ }
  }

  // --- page-leave transition ------------------------------------------------
  // Same-origin sidebar/topbar links fade the content area out before the
  // browser navigates. The shell itself never moves.
  function wireNavigation() {
    document.addEventListener("click", (event) => {
      const a = event.target.closest("a[href]");
      if (!a || a.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto:")) return;
      if (!a.closest(".ws-sidebar, .ws-topbar, .ws-breadcrumb, .ws-content")) return;
      if (reduced()) return;
      event.preventDefault();
      document.body.classList.add("m-leaving");
      setTimeout(() => { location.href = href; }, 130);
    });
  }

  // --- interaction helpers ----------------------------------------------------
  // Button state cycle: label -> busy label -> done label -> label. Only ever
  // driven by the real promise it wraps.
  async function busy(button, promiseOrFn, { busyLabel = "Working…", doneLabel = "✓ Done", holdMs = 1100 } = {}) {
    if (!button) return promiseOrFn instanceof Function ? promiseOrFn() : promiseOrFn;
    const original = button.innerHTML;
    button.disabled = true; button.textContent = busyLabel;
    try {
      const result = await (promiseOrFn instanceof Function ? promiseOrFn() : promiseOrFn);
      button.textContent = doneLabel;
      setTimeout(() => { button.innerHTML = original; button.disabled = false; }, holdMs);
      return result;
    } catch (error) {
      button.innerHTML = original; button.disabled = false;
      throw error;
    }
  }

  // One-shot flash on an element (a changed line, a new finding row).
  function flash(el) { if (!el) return; el.classList.remove("m-flash"); void el.offsetWidth; el.classList.add("m-flash"); }

  // Mark a container as scanning only while a promise is genuinely pending.
  async function whileScanning(el, promise) {
    el?.classList.add("m-scanning");
    try { return await promise; } finally { el?.classList.remove("m-scanning"); }
  }

  document.addEventListener("DOMContentLoaded", wireNavigation);
  return { boot, busy, flash, whileScanning, reduced };
})();
window.BugMotion = BugMotion;
