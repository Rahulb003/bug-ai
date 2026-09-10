import { createUserRecord, findUserByEmail, findUserById, findUserByUsername, upsertUser } from "../models/userModel.js";
import { attachWorkspaceInvites, claimWorkspaceInvite } from "../models/workspaceModel.js";
import { createAppError } from "../utils/errors.js";
import { generateId, hashPassword, verifyPassword } from "../utils/hash.js";
import { signJwt, verifyJwt } from "../utils/jwt.js";

function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    provider: user.provider,
    createdAt: user.createdAt
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

  const passwordHash = hashPassword(password);
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
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw createAppError(401, "Invalid credentials.");
  }

  return createSession(user);
}

export async function buildGoogleSession(payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const name = String(payload.name || "Google User").trim();

  if (!email || !isValidEmail(email)) {
    throw createAppError(400, "Google login requires a valid email.");
  }

  const existing = await findUserByEmail(email);
  const user = existing || await upsertUser({
    id: generateId("usr"),
    username: name.replace(/\s+/g, "").toLowerCase().slice(0, 18) || "googleuser",
    email,
    passwordHash: hashPassword(generateId("temp")),
    role: "user",
    provider: "google",
    createdAt: new Date().toISOString()
  });

  await attachWorkspaceInvites(user.email, user.id);
  await claimWorkspaceInvite(user.email, user.id);

  return createSession(user);
}

export async function findUserByToken(token) {
  const payload = verifyJwt(token);
  const user = await findUserById(payload.sub);

  if (!user) {
    throw createAppError(401, "Session expired.");
  }

  return toPublicUser(user);
}
