// Every field that can legitimately carry source code, at ANY depth of the
// body. Stripping angle brackets from these silently corrupts comparisons,
// generics, JSX, HTML and arrow functions ("=>" becomes "="). Only metadata
// is normalised; source is validated at each API boundary instead.
const SOURCE_KEYS = new Set(["code", "content", "source", "files", "selection", "optimizedCode", "suggestedFix", "patch", "originalCode", "tests", "password", "currentPassword", "newPassword"]);

function sanitizeString(value) {
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/[<>]/g, "")
    .replace(/\u0000/g, "")
    .trim();
}

// Key-aware: a value reached through a source key is passed through untouched,
// including everything nested inside it (e.g. tests[].code, files[].content).
function sanitizeValue(value, key) {
  if (key !== undefined && SOURCE_KEYS.has(key)) return value;
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, sanitizeValue(item, childKey)]));
  }
  return value;
}

export function attachRequestContext(req, res, next) {
  req.requestStartedAt = Date.now();
  next();
}

export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
}

export function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }
  next();
}
