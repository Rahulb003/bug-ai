import { createUserRecord, findUserByEmail, findUserById, findUserByUsername, upsertUser, updateUserById } from "../models/userModel.js";
import { attachWorkspaceInvites, claimWorkspaceInvite } from "../models/workspaceModel.js";
import { createAppError } from "../utils/errors.js";
import { generateId, hashPassword, needsRehash, verifyPassword } from "../utils/hash.js";
import { signJwt, verifyJwt } from "../utils/jwt.js";

function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    provider: user.provider,
    createdAt: user.createdAt,
    preferences: user.preferences || {}
  };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function createSession(user) {
  const token = signJwt({
    sub: user.id,
    role: user.role,
    username: user.username
  });

  return {
    token,
    user: toPublicUser(user)
  };
}

export async function registerUser(payload) {
  const username = String(payload.username || "").trim();
  const email = String(payload.email || `${username}@bugzero.local`).trim().toLowerCase();
  const password = String(payload.password || "");

  if (username.length < 3) {
    throw createAppError(400, "Username must be at least 3 characters.");
  }

  if (password.length < 6) {
    throw createAppError(400, "Password must be at least 6 characters.");
  }

  if (!isValidEmail(email)) {
    throw createAppError(400, "Please enter a valid email address.");
  }

  if (await findUserByUsername(username)) {
    throw createAppError(409, "Username already exists.");
  }

  if (await findUserByEmail(email)) {
    throw createAppError(409, "Email already exists.");
  }

  const passwordHash = await hashPassword(password);
  const user = await createUserRecord({
    id: generateId("usr"),
    username,
    email,
    passwordHash,
    role: username.toLowerCase() === "admin" ? "admin" : "user",
    provider: "local",
    createdAt: new Date().toISOString()
  });

  await attachWorkspaceInvites(user.email, user.id);
  await claimWorkspaceInvite(user.email, user.id);

  return createSession(user);
}

export async function loginUser(payload) {
  const identifier = String(payload.username || payload.email || "").trim();
  const password = String(payload.password || "");

  const user = (await findUserByUsername(identifier)) || (await findUserByEmail(identifier.toLowerCase()));
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw createAppError(401, "Invalid credentials.");
  }

  // Transparent upgrade: a password proved correct against weaker stored
  // parameters is re-hashed at the current cost. The user notices nothing, and
  // a failure here must never block a valid login.
  if (needsRehash(user.passwordHash)) {
    try { await updateUserById(user.id, { passwordHash: await hashPassword(password) }); }
    catch { /* keep the old hash; the next login retries the upgrade */ }
  }

  return createSession(user);
}

// buildGoogleSession was removed. It accepted any email with no token
// verification and returned a session for an existing user with that email —
// an authentication bypass. Reinstate only behind real ID-token verification
// (google-auth-library verifyIdToken against a configured GOOGLE_CLIENT_ID).

export async function findUserByToken(token) {
  const payload = verifyJwt(token);
  const user = await findUserById(payload.sub);

  if (!user) {
    throw createAppError(401, "Session expired.");
  }

  return toPublicUser(user);
}

// Profile fields a user may change about themselves. Preferences are an
// allow-listed object so the record cannot be used as arbitrary storage.
const PREF_KEYS = ["theme", "variant", "accent", "density", "editorFontSize", "editorMinimap", "editorWordWrap", "defaultLanguage", "includeAiOnScan", "toasts", "confirmAiFixes"];
export async function updateProfile(user, payload = {}) {
  const patch = {};
  if (payload.username !== undefined) {
    const username = String(payload.username).trim();
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) throw createAppError(400, "Username must be 3-32 characters: letters, digits, . _ -");
    const taken = await findUserByUsername(username);
    if (taken && taken.id !== user.id) throw createAppError(409, "Username already exists.");
    patch.username = username;
  }
  if (payload.email !== undefined) {
    const email = String(payload.email).trim().toLowerCase();
    if (!isValidEmail(email)) throw createAppError(400, "Enter a valid email address.");
    const taken = await findUserByEmail(email);
    if (taken && taken.id !== user.id) throw createAppError(409, "Email already registered.");
    patch.email = email;
  }
  if (payload.preferences !== undefined) {
    if (!payload.preferences || typeof payload.preferences !== "object" || Array.isArray(payload.preferences)) throw createAppError(400, "Preferences must be an object.");
    const prefs = {};
    for (const key of PREF_KEYS) if (key in payload.preferences) { const v = payload.preferences[key]; if (["string", "number", "boolean"].includes(typeof v) && String(v).length <= 40) prefs[key] = v; }
    patch.preferences = prefs;
  }
  if (!Object.keys(patch).length) throw createAppError(400, "Nothing to update.");
  const updated = await updateUserById(user.id, patch);
  if (!updated) throw createAppError(404, "User not found.");
  return { user: toPublicUser(updated) };
}

export async function changePassword(user, payload = {}) {
  const current = String(payload.currentPassword || "");
  const next = String(payload.newPassword || "");
  const record = await findUserById(user.id);
  if (!record || !(await verifyPassword(current, record.passwordHash))) throw createAppError(401, "Current password is incorrect.");
  if (next.length < 8) throw createAppError(400, "New password must be at least 8 characters.");
  if (next === current) throw createAppError(400, "New password must differ from the current one.");
  await updateUserById(user.id, { passwordHash: await hashPassword(next), passwordChangedAt: new Date().toISOString() });
  return { ok: true };
}
