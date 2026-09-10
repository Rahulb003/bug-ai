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

  res.json({
    analytics,
    totals: {
      scans: scans.length,
      latestRisk: latest?.riskScore || 0,
      avgQuality: scans.length ? Math.round(scans.reduce((sum, scan) => sum + scan.codeQualityScore, 0) / scans.length) : 0
    },
    severityTotals
  });
});
