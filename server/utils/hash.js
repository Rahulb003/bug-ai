import crypto from "crypto";
import { promisify } from "util";

const pbkdf2 = promisify(crypto.pbkdf2);

// PBKDF2-HMAC-SHA512 at the current OWASP guidance (210,000 iterations).
// Hashing is async so a ~140ms derivation never blocks the event loop while
// other requests are being served.
export const PBKDF2_ITERATIONS = 210000;
const DIGEST = "sha512";
const KEY_BYTES = 64;
const SALT_BYTES = 16;

// Hashes written before this change used `<salt>:<digest>` with a fixed 10,000
// iterations. They still verify; `needsRehash` flags them so a successful login
// can transparently upgrade them.
const LEGACY_ITERATIONS = 10000;

export function generateId(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

// Stored form: pbkdf2$<digest>$<iterations>$<salt>$<hash>. The parameters travel
// with the hash, so they can be raised again later without breaking old records.
const encode = ({ digest, iterations, salt, hash }) => `pbkdf2$${digest}$${iterations}$${salt}$${hash}`;

function parseHash(stored) {
  const value = String(stored || "");
  if (value.startsWith("pbkdf2$")) {
    const [, digest, iterations, salt, hash] = value.split("$");
    const rounds = Number(iterations);
    if (!digest || !Number.isInteger(rounds) || rounds <= 0 || !salt || !hash) return null;
    return { digest, iterations: rounds, salt, hash, legacy: false };
  }
  const [salt, hash] = value.split(":");
  if (!salt || !hash) return null;
  return { digest: DIGEST, iterations: LEGACY_ITERATIONS, salt, hash, legacy: true };
}

export async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  const salt = crypto.randomBytes(SALT_BYTES).toString("hex");
  const hash = (await pbkdf2(String(password), salt, iterations, KEY_BYTES, DIGEST)).toString("hex");
  return encode({ digest: DIGEST, iterations, salt, hash });
}

export async function verifyPassword(password, storedHash) {
  const parsed = parseHash(storedHash);
  if (!parsed) return false;
  const expected = Buffer.from(parsed.hash, "hex");
  if (!expected.length) return false;
  let derived;
  try {
    // Key length comes from the stored hash so records written with other
    // parameters still verify.
    derived = await pbkdf2(String(password), parsed.salt, parsed.iterations, expected.length, parsed.digest);
  } catch {
    return false;
  }
  // timingSafeEqual throws on a length mismatch, so guard it rather than letting
  // a malformed record turn into a 500.
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

// True when the stored hash was produced with weaker parameters than we now use.
export function needsRehash(storedHash) {
  const parsed = parseHash(storedHash);
  if (!parsed) return true;
  return parsed.legacy || parsed.digest !== DIGEST || parsed.iterations < PBKDF2_ITERATIONS;
}
