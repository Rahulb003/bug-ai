import {
  buildGoogleSession,
  createSession,
  findUserByToken,
  loginUser,
  registerUser
} from "../services/authService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const registerController = asyncHandler(async (req, res) => {
  const session = await registerUser(req.body);
  res.status(201).json(session);
});

export const loginController = asyncHandler(async (req, res) => {
  const session = await loginUser(req.body);
  res.json(session);
});

export const googleLoginController = asyncHandler(async (req, res) => {
  const session = await buildGoogleSession(req.body);
  res.json(session);
});

export const meController = asyncHandler(async (req, res) => {
  const user = await findUserByToken(req.authToken);
  res.json({ user });
});
