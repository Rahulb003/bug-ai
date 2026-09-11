import { getAnalyticsSnapshot } from "../models/analyticsModel.js";
import { getScansByUserId } from "../models/scanModel.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const analyticsOverviewController = asyncHandler(async (req, res) => {
  const [analytics, scans] = await Promise.all([
    getAnalyticsSnapshot(),
    getScansByUserId(req.user.id)
  ]);

  const latest = scans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  const severityTotals = scans.reduce((acc, scan) => {
    acc.critical += scan.severityBreakdown?.critical || 0;
    acc.high += scan.severityBreakdown?.high || 0;
    acc.medium += scan.severityBreakdown?.medium || 0;
    acc.low += scan.severityBreakdown?.low || 0;
    return acc;
  }, { critical: 0, high: 0, medium: 0, low: 0 });

  // codeQualityScore is never computed by the pipeline, so averaging it
  // produced a constant 0 presented as a quality figure. Report the real
  // measured values and say plainly that quality is not measured.
  const measuredQuality = scans.map((scan) => scan.codeQualityScore).filter((value) => Number.isFinite(value));

  res.json({
    analytics,
    totals: {
      scans: scans.length,
      latestRisk: latest?.riskScore ?? null,
      latestRiskLevel: latest?.riskLevel || null,
      lastScanAt: latest?.createdAt || null,
      avgQuality: measuredQuality.length ? Math.round(measuredQuality.reduce((sum, value) => sum + value, 0) / measuredQuality.length) : null,
      qualityStatus: measuredQuality.length ? "measured" : "not_measured",
      qualityReason: measuredQuality.length ? undefined : "A code quality score is not computed by the analysis pipeline."
    },
    severityTotals,
    evaluation: { status: "not_configured", message: "Evaluation benchmark not configured." }
  });
});
