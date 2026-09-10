import { Router } from "express";
import { adminOverviewController } from "../controllers/adminController.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/overview", requireAuth, requireAdmin, adminOverviewController);

export default router;
