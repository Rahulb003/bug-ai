import { Router } from "express";
import {
  googleLoginController,
  loginController,
  meController,
  registerController
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/register", registerController);
router.post("/login", loginController);
router.post("/google", googleLoginController);
router.get("/me", requireAuth, meController);

export default router;
