// BUG AI brand: the BUG-CORE mark as inline SVG so it can take the current
// text colour, scale to any size, and reflect a real operation state.
//
//   ( ◆ )   two bracket arcs — code's parentheses, a scanner's reticle —
//           enclosing a solid rotated core: the thing being inspected.
//
// States are presentational only and are set by callers when the matching
// backend operation is actually in flight or has actually completed:
//   normal · scanning · finding · fixing · verifying · verified
const BugBrand = (() => {
  const MARK = '<path class="bc-arc bc-arc-l" d="M8.83 5.76A12.5 12.5 0 0 0 8.83 26.24"/><path class="bc-arc bc-arc-r" d="M23.17 5.76A12.5 12.5 0 0 1 23.17 26.24"/><path class="bc-core" d="M16 9.5 22.5 16 16 22.5 9.5 16Z"/><path class="bc-check" d="m12.6 16.2 2.3 2.3 4.6-4.8"/>';

  function mark({ size = 24, state = "normal", cls = "" } = {}) {
    return `<svg class="bc-mark is-${state} ${cls}" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-state="${state}">${MARK}</svg>`;
  }

  // Wordmark and lockup are plain text set in the UI face so they stay crisp.
  function lockup({ size = 28, tagline = true } = {}) {
    return `<span class="bc-lockup">${mark({ size })}<span class="bc-words"><b>BUG AI</b>${tagline ? "<small>Code Smarter. Build Safer.</small>" : ""}</span></span>`;
  }

  function setState(el, state) {
    const svg = el?.matches?.(".bc-mark") ? el : el?.querySelector?.(".bc-mark");
    if (!svg) return;
    svg.className.baseVal = svg.className.baseVal.replace(/\bis-\w+/g, "").trim() + ` is-${state}`;
    svg.dataset.state = state;
  }

  return { mark, lockup, setState, MARK };
})();
window.BugBrand = BugBrand;
