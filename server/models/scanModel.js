import { readDatabase, updateDatabase } from "./database.js";

export async function persistScan(scan) {
  await updateDatabase((db) => {
    db.scans.push(scan);
    return db;
  });
  return scan;
}

export async function getScansByUserId(userId, includeAll = false) {
  const db = await readDatabase();
  if (includeAll) return db.scans;
  return db.scans.filter((scan) => scan.userId === userId);
}

export async function findScanById(id) {
  const db = await readDatabase();
  return db.scans.find((scan) => scan.id === id);
}

export async function saveScan(scan) {
  await updateDatabase((db) => {
    const index = db.scans.findIndex((entry) => entry.id === scan.id);
    if (index >= 0) {
      db.scans[index] = scan;
    }
    return db;
  });
  return scan;
}
