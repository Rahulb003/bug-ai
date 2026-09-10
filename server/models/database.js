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

export async function writeDatabase(nextData) {
  await ensureDatabase();
  writeQueue = writeQueue.then(() => fs.writeFile(dbFile, JSON.stringify(nextData, null, 2), "utf8"));
  await writeQueue;
}

export async function updateDatabase(updater) {
  const data = await readDatabase();
  const updated = await updater(data);
  await writeDatabase(updated);
  return updated;
}
