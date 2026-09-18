import { findUserByToken } from "../services/authService.js";
import { createAppError } from "../utils/errors.js";

// Browser sessions ride in an httpOnly cookie so page scripts can never read
// the token. API clients and tests keep using a bearer header. Query-string
// tokens are no longer accepted: they end up in logs and referrers.
export const SESSION_COOKIE = "bugai_session";
const CSRF_HEADER = "x-requested-with";
const CSRF_VALUE = "BugAI";

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function tokenFromRequest(req) {
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (bearer) return { token: bearer, via: "bearer" };
  const cookie = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (cookie) return { token: cookie, via: "cookie" };
  return { token: "", via: null };
}

export function sessionCookie(token, req, { clear = false } = {}) {
  const secure = req.secure || String(req.headers["x-forwarded-proto"] || "").startsWith("https");
  const attrs = [`${SESSION_COOKIE}=${clear ? "" : encodeURIComponent(token)}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${clear ? 0 : 60 * 60 * 24 * 7}`];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export async function requireAuth(req, res, next) {
  try {
    const { token, via } = tokenFromRequest(req);
    if (!token) throw createAppError(401, "Authentication required.");
    // A cookie is sent automatically by the browser, so a state-changing
    // request must also carry a header that cross-site forms cannot set.
    if (via === "cookie" && !["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers[CSRF_HEADER] !== CSRF_VALUE) {
      throw createAppError(403, "Missing request header for a cookie-authenticated request.");
    }
    req.authToken = token;
    req.authVia = via;
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
