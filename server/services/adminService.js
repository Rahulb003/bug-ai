import { getAnalyticsSnapshot } from "../models/analyticsModel.js";
import { getAllUsers } from "../models/userModel.js";
import { getScansByUserId } from "../models/scanModel.js";

export async function getAdminOverview() {
  const [users, scans, analytics] = await Promise.all([
    getAllUsers(),
    getScansByUserId(undefined, true),
    getAnalyticsSnapshot()
  ]);

  const bugTally = {};
  scans.forEach((scan) => {
    scan.bugs.forEach((bug) => {
      bugTally[bug.title] = (bugTally[bug.title] || 0) + 1;
    });
  });

  const topBugs = Object.entries(bugTally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    totalUsers: users.length,
    totalScans: scans.length,
    activeToday: scans.filter((scan) => new Date(scan.createdAt).toDateString() === new Date().toDateString()).length,
    // No billing exists, so there is no revenue to report. The previous value
    // was users * 2499, a number with no source.
    revenue: { status: "not_measured", reason: "No billing or subscription data is recorded." },
    topBugs,
    analytics,
    avgRiskScore: scans.length ? Math.round(scans.reduce((sum, scan) => sum + scan.riskScore, 0) / scans.length) : null,
    // codeQualityScore is never computed; averaging it reported a constant 0.
    avgQualityScore: null,
    qualityStatus: "not_measured",
    activeUsers: users.filter((user) => scans.some((scan) => scan.userId === user.id)).length
  };
}
