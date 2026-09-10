import crypto from "crypto";

export function generateId(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return `${salt}:${digest}`;
}

export function verifyPassword(password, storedHash) {
  const [salt, originalDigest] = String(storedHash || "").split(":");
  if (!salt || !originalDigest) return false;
  const digest = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(originalDigest, "utf8"));
}
