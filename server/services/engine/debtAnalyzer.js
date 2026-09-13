// Technical debt as a view over the project's real findings. Nothing here is
// estimated: every number is a count from a stored analysis, and a trend is
// reported only when a previous analysis of the same project exists.

const PRIORITY = { CRITICAL: "critical", HIGH: "high", MEDIUM: "medium", LOW: "low", INFO: "low" };
const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function groupByRule(findings) {
  const groups = new Map();
  for (const f of findings || []) {
    const key = f.rule || f.title;
    const g = groups.get(key) || { rule: f.rule || null, title: f.title, category: f.category || "quality", severity: String(f.severity || "INFO").toUpperCase(), count: 0, files: new Set(), lines: [], recommendation: f.recommendation || f.fix || "Review the affected code.", source: f.source || "deterministic" };
    g.count += 1;
    if (f.file) g.files.add(f.file);
    if (f.line) g.lines.push({ file: f.file, line: f.line });
    groups.set(key, g);
  }
  return groups;
}

export function buildTechnicalDebt(project) {
  const current = project?.lastAnalysis;
  if (!current) {
    return { status: "not_available", reason: "This project has not been analyzed yet. Run Analyze Project to derive its technical debt from real findings.", items: [], totals: null, trend: { status: "not_available", reason: "No analysis." } };
  }
  const groups = groupByRule(current.findings);
  const previous = project.previousAnalysis ? groupByRule(project.previousAnalysis.findings) : null;

  const items = [...groups.values()].map((g) => {
    const priority = PRIORITY[g.severity] || "low";
    const before = previous ? (previous.get(g.rule || g.title)?.count || 0) : null;
    return {
      id: g.rule || g.title,
      title: g.title,
      category: g.category,
      priority,
      severity: g.severity,
      occurrences: g.count,
      affectedFiles: [...g.files].sort(),
      locations: g.lines.slice(0, 20),
      recommendedAction: g.recommendation,
      detectionSource: g.source,
      status: "open",
      trend: before === null ? { status: "not_available" } : { status: "measured", previous: before, current: g.count, delta: g.count - before }
    };
  }).sort((a, b) => (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) || (b.occurrences - a.occurrences));

  // Items that existed before and are now gone are resolved debt, worth showing.
  const resolved = previous ? [...previous.values()].filter((g) => !groups.has(g.rule || g.title)).map((g) => ({ id: g.rule || g.title, title: g.title, category: g.category, priority: PRIORITY[g.severity] || "low", occurrences: 0, previous: g.count })) : [];

  const totals = { critical: 0, high: 0, medium: 0, low: 0, occurrences: 0 };
  for (const item of items) { totals[item.priority] += 1; totals.occurrences += item.occurrences; }
  const currentCount = (current.findings || []).length;
  const previousCount = project.previousAnalysis ? (project.previousAnalysis.findings || []).length : null;

  return {
    status: "derived",
    analyzedAt: current.createdAt,
    items,
    resolved,
    totals,
    trend: previousCount === null
      ? { status: "not_available", reason: "Only one analysis is stored for this project. Re-analyze after changes to see a trend." }
      : { status: "measured", previousAt: project.previousAnalysis.createdAt, previous: previousCount, current: currentCount, delta: currentCount - previousCount },
    note: "Derived from stored findings only. No time or cost estimates are produced because nothing here measures effort."
  };
}
