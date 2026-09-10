import { findUserByToken } from "../services/authService.js";
import { createAppError } from "../utils/errors.js";

export async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") || req.query.token;
    if (!token) {
      throw createAppError(401, "Authentication required.");
    }

    req.authToken = token;
    req.user = await findUserByToken(token);
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return next(createAppError(403, "Admin access required."));
  }

  return next();
}
