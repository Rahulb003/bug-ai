import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Tests and isolated deployments may supply a separate database; production
// keeps the existing data/db.json path for backward compatibility.
const dbFile = process.env.BUG_AI_DB_PATH
  ? path.resolve(process.env.BUG_AI_DB_PATH)
  : path.resolve(__dirname, "../../data/db.json");

const defaultData = {
  users: [],
  scans: [],
  projects: [],
  workspaces: [],
  notifications: [],
  analytics: {
    totalScans: 0,
    scansByType: {
      code: 0,
      project: 0,
      github: 0
    },
    scansByDay: {},
    issueCategories: {},
    exports: {
      pdf: 0,
      csv: 0,
      json: 0,
      excel: 0
    }
  }
};

let writeQueue = Promise.resolve();

async function ensureDirectory() {
  await fs.mkdir(path.dirname(dbFile), { recursive: true });
}

export async function ensureDatabase() {
  await ensureDirectory();
  try {
    await fs.access(dbFile);
  } catch {
    await fs.writeFile(dbFile, JSON.stringify(defaultData, null, 2), "utf8");
  }
}

export async function readDatabase() {
  await ensureDatabase();
  const raw = await fs.readFile(dbFile, "utf8");
  const parsed = JSON.parse(raw || JSON.stringify(defaultData));
  return {
    ...defaultData,
    ...parsed,
    analytics: {
      ...defaultData.analytics,
      ...(parsed.analytics || {}),
      scansByType: {
        ...defaultData.analytics.scansByType,
        ...(parsed.analytics?.scansByType || {})
      },
      scansByDay: {
        ...defaultData.analytics.scansByDay,
        ...(parsed.analytics?.scansByDay || {})
      },
      issueCategories: {
        ...defaultData.analytics.issueCategories,
        ...(parsed.analytics?.issueCategories || {})
      },
      exports: {
        ...defaultData.analytics.exports,
        ...(parsed.analytics?.exports || {})
      }
    },
    workspaces: parsed.workspaces || [],
    projects: parsed.projects || [],
    notifications: parsed.notifications || []
  };
}

// Writes go to a temp file and are renamed into place so a concurrent
// readDatabase never observes a half-written (unparseable) file.
async function atomicWrite(nextData) {
  const tmp = dbFile + "." + process.pid + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(nextData, null, 2), "utf8");
  // On Windows the rename fails with EPERM/EBUSY while a reader still holds
  // the file open; retry briefly rather than falling back to a truncating write.
  for (let attempt = 0; ; attempt++) {
    try { await fs.rename(tmp, dbFile); return; }
    catch (error) {
      if (!["EPERM", "EBUSY", "EACCES"].includes(error.code) || attempt >= 50) { await fs.rm(tmp, { force: true }); throw error; }
      await new Promise((resolve) => setTimeout(resolve, 5 + attempt * 2));
    }
  }
}

export async function writeDatabase(nextData) {
  await ensureDatabase();
  const run = writeQueue.then(() => atomicWrite(nextData));
  writeQueue = run.catch(() => {});
  await run;
}

// The read-modify-write runs inside the queue so two concurrent updates
// cannot overwrite each other with stale data.
export async function updateDatabase(updater) {
  await ensureDatabase();
  const run = writeQueue.then(async () => {
    const data = await readDatabase();
    const updated = await updater(data);
    await atomicWrite(updated);
    return updated;
  });
  writeQueue = run.catch(() => {});
  return run;
}
