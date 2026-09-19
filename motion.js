// BUG AI motion runtime: the startup sequence, page-leave transitions, and the
// small interaction helpers pages share. Purely presentational; nothing here
// reports a state the backend has not produced.
const BugMotion = (() => {
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));

  // --- startup ---------------------------------------------------------------
  // Plays once per browser session. Six phases, ~4.4s, skippable after 0.8s:
  //   darkness → core activation → symbol formation → brand reveal →
  //   aurora hold → settle into the shell's brand slot.
  // Reduced motion collapses it to a short crossfade. Nothing here represents
  // loading or progress; the page beneath is already rendered.
  async function boot({ short = false } = {}) {
    // Once per tab, and no more than once every 12 hours across tabs — opening
    // a second tab should not replay the whole sequence.
    let played = false;
    try { played = sessionStorage.getItem("bugai_booted") === "1" || (Date.now() - Number(localStorage.getItem("bugai_boot_at") || 0)) < 12 * 3600 * 1000; } catch { played = false; }
    const done = () => { try { sessionStorage.setItem("bugai_booted", "1"); localStorage.setItem("bugai_boot_at", String(Date.now())); } catch { /* ignore */ } };
    if (played) { done(); return; }
    const markSvg = window.BugBrand ? BugBrand.mark({ size: 96 }) : "";
    const el = document.createElement("div");
    el.className = "boot aurora";
    el.innerHTML = `<div class="boot-stage"><i class="boot-point"></i><div class="boot-mark">${markSvg}</div><div class="boot-words"><b>BUG AI</b><small>CODE SMARTER. BUILD SAFER.</small></div></div><button class="boot-skip" type="button" hidden>Skip</button>`;
    document.body.appendChild(el);
    if (reduced()) { el.classList.add("is-reduced"); await new Promise((r) => setTimeout(r, 420)); el.classList.add("is-done"); await new Promise((r) => setTimeout(r, 200)); el.remove(); done(); return; }

    let skipped = false;
    const skip = el.querySelector(".boot-skip");
    skip.onclick = () => { skipped = true; };
    const until = async (ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms && !skipped) await new Promise((r) => setTimeout(r, 40)); };
    const phase = (n) => el.classList.add(`p${n}`);
    // Timeline (ms from start): the durations below are cumulative waits.
    phase(1); await until(700);                 // darkness, a point of light
    phase(2); await until(100); skip.hidden = false; await until(600);   // core activation + aurora
    phase(3); await until(800);                 // arcs draw in: symbol formation
    phase(4); await until(700);                 // BUG AI / tagline
    phase(5); await until(short ? 300 : 600);   // aurora hold
    // Phase 6: settle toward where the brand lives in the shell, if present.
    const target = document.querySelector(".ws-brand .bc-mark, .ws-brand-mark, .brand-mark");
    const mark = el.querySelector(".boot-mark");
    if (target) {
      const a = mark.getBoundingClientRect(), b = target.getBoundingClientRect();
      el.style.setProperty("--boot-dx", `${b.left + b.width / 2 - (a.left + a.width / 2)}px`);
      el.style.setProperty("--boot-dy", `${b.top + b.height / 2 - (a.top + a.height / 2)}px`);
      el.style.setProperty("--boot-scale", String(Math.max(0.16, b.width / a.width)));
    } else { el.style.setProperty("--boot-scale", "0.6"); }
    phase(6);
    document.body.classList.add("m-assembling");
    await new Promise((r) => setTimeout(r, skipped ? 220 : 620));
    el.classList.add("is-done");
    await new Promise((r) => setTimeout(r, 300));
    el.remove();
    setTimeout(() => document.body.classList.remove("m-assembling"), 400);
    done();
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
