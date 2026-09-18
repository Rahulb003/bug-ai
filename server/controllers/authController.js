import {
  createSession,
  findUserByToken,
  loginUser,
  registerUser
} from "../services/authService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sessionCookie } from "../middleware/auth.js";

// The token is set as an httpOnly cookie for browsers and also returned in the
// body for API clients. The web UI never stores it.
const respond = (req, res, session, status = 200) => {
  res.setHeader("Set-Cookie", sessionCookie(session.token, req));
  res.status(status).json(session);
};

export const registerController = asyncHandler(async (req, res) => respond(req, res, await registerUser(req.body), 201));
export const loginController = asyncHandler(async (req, res) => respond(req, res, await loginUser(req.body)));

export const meController = asyncHandler(async (req, res) => {
  const user = await findUserByToken(req.authToken);
  res.json({ user, via: req.authVia });
});

// Exchange a bearer token for a cookie session (used by tools that obtained a
// token via the API and then open the web UI).
export const sessionController = asyncHandler(async (req, res) => respond(req, res, createSession(req.user)));

export const logoutController = asyncHandler(async (req, res) => {
  res.setHeader("Set-Cookie", sessionCookie("", req, { clear: true }));
  res.json({ ok: true });
});
