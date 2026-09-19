import { Router } from "express";
import {
  loginController,
  logoutController,
  meController,
  registerController,
  sessionController,
  updateProfileController,
  changePasswordController
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/register", registerController);
router.post("/login", loginController);
router.get("/me", requireAuth, meController);
router.patch("/me", requireAuth, updateProfileController);
router.post("/password", requireAuth, changePasswordController);
// Bearer -> cookie exchange for clients that obtained a token via the API.
router.post("/session", requireAuth, sessionController);
router.post("/logout", logoutController);

export default router;
