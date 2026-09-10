import crypto from "crypto";
import { createAppError } from "./errors.js";

const secret = process.env.JWT_SECRET || "bugzero-dev-secret";

function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

export function signJwt(payload, expiresInSeconds = 60 * 60 * 24 * 7) {
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedBody = base64UrlEncode(JSON.stringify(body));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedBody}`)
    .digest("base64url");
  return `${encodedHeader}.${encodedBody}.${signature}`;
}

export function verifyJwt(token) {
  const [encodedHeader, encodedBody, signature] = String(token || "").split(".");
  if (!encodedHeader || !encodedBody || !signature) {
    throw createAppError(401, "Invalid token.");
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedBody}`)
    .digest("base64url");

  if (expected !== signature) {
    throw createAppError(401, "Invalid token signature.");
  }

  const payload = JSON.parse(base64UrlDecode(encodedBody));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw createAppError(401, "Token expired.");
  }

  return payload;
}
