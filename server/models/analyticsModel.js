import { readDatabase, updateDatabase } from "./database.js";

export async function recordAnalyticsEvent(scan) {
  await updateDatabase((db) => {
    db.analytics.totalScans += 1;
    db.analytics.scansByType[scan.inputType] = (db.analytics.scansByType[scan.inputType] || 0) + 1;
    const dayKey = new Date(scan.createdAt || Date.now()).toISOString().slice(0, 10);
    db.analytics.scansByDay[dayKey] = (db.analytics.scansByDay[dayKey] || 0) + 1;
    (scan.bugs || []).forEach((bug) => {
      const category = bug.category || "other";
      db.analytics.issueCategories[category] = (db.analytics.issueCategories[category] || 0) + 1;
    });
    return db;
  });
}

export async function getAnalyticsSnapshot() {
  const db = await readDatabase();
  return db.analytics;
}

export async function recordExportEvent(format) {
  await updateDatabase((db) => {
    const key = String(format || "").toLowerCase();
    if (db.analytics.exports[key] !== undefined) {
      db.analytics.exports[key] += 1;
    }
    return db;
  });
}
