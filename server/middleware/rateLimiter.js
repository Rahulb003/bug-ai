import { tokenFromRequest } from "./auth.js";
import { verifyJwt } from "../utils/jwt.js";

// Authenticated requests are limited per account; anonymous ones per IP, so a
// team behind one NAT does not share a single budget.
const requests = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 120;
const MAX_ANONYMOUS = 60;

function keyFor(req) {
  const { token } = tokenFromRequest(req);
  if (token) { try { return { key: `user:${verifyJwt(token).sub}`, max: MAX_REQUESTS }; } catch { /* fall through to IP */ } }
  return { key: `ip:${req.ip || req.headers["x-forwarded-for"] || "local"}`, max: MAX_ANONYMOUS };
}

export function requestRateLimiter(req, res, next) {
  const now = Date.now();
  const { key, max } = keyFor(req);
  const recent = (requests.get(key) || []).filter((time) => now - time < WINDOW_MS);
  recent.push(now);
  requests.set(key, recent);
  if (requests.size > 5000) for (const [k, v] of requests) if (!v.some((t) => now - t < WINDOW_MS)) requests.delete(k);
  res.setHeader("X-RateLimit-Limit", String(max));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - recent.length)));
  if (recent.length > max) {
    return res.status(429).json({ error: "Rate limit exceeded. Please retry shortly." });
  }
  return next();
}
