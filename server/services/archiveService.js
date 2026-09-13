import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { createAppError } from "../utils/errors.js";

// Hard ceilings, enforced before any per-file work so a hostile archive cannot
// exhaust memory. normalizeProjectFiles applies the project-level caps after.
const MAX_ARCHIVE_BYTES = 15 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;

function isProbablyBinary(bytes) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious += 1;
  }
  return sample.length > 0 && suspicious / sample.length > 0.1;
}

// Zip-slip and absolute-path guard. Returns null for anything that must be dropped.
function safeEntryName(rawName) {
  let name = String(rawName || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!name || name.endsWith("/")) return null;               // directory entries
  if (/^[a-zA-Z]:/.test(name)) return null;                    // Windows drive prefix
  const parts = name.split("/");
  if (parts.some((part) => part === ".." || part === "" || part === ".")) return null;
  if (parts.length > 40 || name.length > 512) return null;
  return name;
}

// Turns an uploaded archive into the same {name, content} list the project
// APIs already accept. Binary and oversized entries are skipped and counted so
// the caller can report exactly what was dropped and why.
export function extractArchive(base64) {
  const raw = String(base64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!raw) throw createAppError(400, "An archive is required.");
  const bytes = Buffer.from(raw, "base64");
  if (!bytes.length) throw createAppError(400, "The archive could not be decoded.");
  if (bytes.length > MAX_ARCHIVE_BYTES) throw createAppError(413, `Archive exceeds the ${MAX_ARCHIVE_BYTES / (1024 * 1024)} MB limit.`);

  let entries;
  try { entries = unzipSync(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)); }
  catch (error) { throw createAppError(400, "The upload is not a valid ZIP archive."); }

  const names = Object.keys(entries);
  if (names.length > MAX_ENTRIES) throw createAppError(413, `Archive has ${names.length} entries; the limit is ${MAX_ENTRIES}.`);

  const files = [];
  const skipped = { directories: 0, unsafePath: 0, binary: 0, oversized: 0 };
  for (const rawName of names) {
    const data = entries[rawName];
    if (rawName.endsWith("/")) { skipped.directories += 1; continue; }
    const name = safeEntryName(rawName);
    if (!name) { skipped.unsafePath += 1; continue; }
    if (data.length > MAX_ENTRY_BYTES) { skipped.oversized += 1; continue; }
    if (isProbablyBinary(data)) { skipped.binary += 1; continue; }
    files.push({ name, content: strFromU8(data) });
  }
  return { files, skipped, entryCount: names.length };
}

// Strip a single top-level folder when every entry shares it, which is how
// most zips made from a directory arrive (project-name/src/...).
export function stripCommonRoot(files) {
  if (files.length < 2) return files;
  const first = files[0].name.split("/")[0];
  if (!files.every((f) => f.name.split("/").length > 1 && f.name.split("/")[0] === first)) return files;
  return files.map((f) => ({ ...f, name: f.name.split("/").slice(1).join("/") }));
}

export function buildArchive(files) {
  const tree = {};
  for (const file of files || []) {
    const name = safeEntryName(file.name);
    if (!name) continue;
    tree[name] = strToU8(String(file.content ?? ""));
  }
  return Buffer.from(zipSync(tree, { level: 6 }));
}
