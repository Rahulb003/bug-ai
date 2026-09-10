function sanitizeValue(value) {
  if (typeof value === "string") {
    return value
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/[<>]/g, "")
      .replace(/\u0000/g, "")
      .trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeValue(item)])
    );
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
    // Source files are untrusted data, but they are not HTML. Altering their
    // contents here corrupts valid programs (for example comparisons and JSX).
    // Validation is performed at each API boundary; only metadata is normalised.
    const sourceKeys = new Set(["code", "content", "source", "files"]);
    req.body = Object.fromEntries(
      Object.entries(req.body).map(([key, value]) => [
        key,
        sourceKeys.has(key) ? value : sanitizeValue(value)
      ])
    );
  }
  next();
}
