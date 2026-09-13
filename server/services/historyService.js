import { findScanById, getScansByUserId, saveScan } from "../models/scanModel.js";
import { recordExportEvent } from "../models/analyticsModel.js";
import { getAllUsers } from "../models/userModel.js";
import { assertScanAccess, getAccessibleUserIds } from "./accessService.js";
import { createAppError } from "../utils/errors.js";
import { generateId } from "../utils/hash.js";

export async function getScanHistory(user) {
  const [allScans, accessibleUserIds, users] = await Promise.all([
    getScansByUserId(undefined, true),
    getAccessibleUserIds(user),
    getAllUsers()
  ]);
  const userMap = new Map(users.map((entry) => [entry.id, entry.username]));
  const scans = allScans
    .filter((scan) => accessibleUserIds.includes(scan.userId))
    .map((scan) => ({
      ...scan,
      ownerName: userMap.get(scan.userId) || "Developer",
      isMine: scan.userId === user.id
    }));

  return {
    scans: scans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  };
}

export async function compareScans(user, payload) {
  const current = await findScanById(payload.currentScanId);
  const previous = await findScanById(payload.previousScanId);

  await assertScanAccess(user, current, "Comparison scans could not be found.");
  await assertScanAccess(user, previous, "Comparison scans could not be found.");

  return {
    current,
    previous,
    delta: {
      riskScore: current.riskScore - previous.riskScore,
      bugCount: current.bugs.length - previous.bugs.length,
      // codeQualityScore is never computed, so a numeric delta would be null - null.
      qualityScore: null,
      qualityStatus: "not_measured"
    }
  };
}

export async function createShareLink(user, scanId) {
  const scan = await findScanById(scanId);
  await assertScanAccess(user, scan);

  scan.sharedId = scan.sharedId || generateId("share");
  await saveScan(scan);

  return {
    shareId: scan.sharedId,
    url: `/api/reports/${scan.sharedId}`
  };
}

export async function getSharedReport(shareId) {
  const scans = await getScansByUserId(undefined, true);
  const scan = scans.find((entry) => entry.sharedId === shareId);
  if (!scan) {
    throw createAppError(404, "Shared report not found.");
  }

  return { scan };
}

function toCsv(scan) {
  const header = ["line", "severity", "category", "title", "fix"];
  const rows = (scan.bugs || []).map((bug) => [
    bug.line,
    bug.severity,
    bug.category,
    `"${String(bug.title || "").replace(/"/g, "\"\"")}"`,
    `"${String(bug.fix || "").replace(/"/g, "\"\"")}"`
  ].join(","));

  return [header.join(","), ...rows].join("\n");
}

function toExcelHtml(scan) {
  return `
    <table>
      <tr><th>Source</th><td>${scan.sourceName}</td></tr>
      <tr><th>Risk score</th><td>${scan.riskScore}</td></tr>
      <tr><th>Quality</th><td>${scan.codeQualityScore}</td></tr>
    </table>
    <table>
      <thead>
        <tr><th>Line</th><th>Severity</th><th>Category</th><th>Title</th><th>Fix</th></tr>
      </thead>
      <tbody>
        ${(scan.bugs || []).map((bug) => `
          <tr>
            <td>${bug.line}</td>
            <td>${bug.severity}</td>
            <td>${bug.category}</td>
            <td>${bug.title}</td>
            <td>${bug.fix}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `.trim();
}

export async function exportScanReport(user, scanId, format) {
  const scan = await findScanById(scanId);
  await assertScanAccess(user, scan);

  const exportFormat = String(format || "json").toLowerCase();
  let mime = "application/json";
  let content = JSON.stringify(scan, null, 2);
  let filename = `${scan.sourceName || "bugzero-report"}.json`;

  if (exportFormat === "csv") {
    mime = "text/csv";
    content = toCsv(scan);
    filename = `${scan.sourceName || "bugzero-report"}.csv`;
  } else if (exportFormat === "excel") {
    mime = "application/vnd.ms-excel";
    content = toExcelHtml(scan);
    filename = `${scan.sourceName || "bugzero-report"}.xls`;
  } else if (exportFormat === "pdf") {
    mime = "text/html";
    content = `<html><body><h1>${scan.sourceName}</h1><p>${scan.summary}</p></body></html>`;
    filename = `${scan.sourceName || "bugzero-report"}.html`;
  }

  await recordExportEvent(exportFormat);

  return {
    filename: filename.replace(/[\\/:*?"<>|]+/g, "-"),
    mime,
    content
  };
}
