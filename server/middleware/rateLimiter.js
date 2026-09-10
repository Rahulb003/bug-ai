const requests = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 120;

export function requestRateLimiter(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.headers["x-forwarded-for"] || "local";
  const current = requests.get(key) || [];
  const recent = current.filter((time) => now - time < WINDOW_MS);

  recent.push(now);
  requests.set(key, recent);

  if (recent.length > MAX_REQUESTS) {
    return res.status(429).json({
      error: "Rate limit exceeded. Please retry shortly."
    });
  }

  return next();
}
