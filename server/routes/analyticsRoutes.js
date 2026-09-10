import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { analyticsOverviewController } from "../controllers/analyticsController.js";

const router = Router();

router.get("/analytics", requireAuth, analyticsOverviewController);

export default router;
