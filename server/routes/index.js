import { Router } from "express";
import adminRouter from "./adminRoutes.js";
import analyticsRouter from "./analyticsRoutes.js";
import authRouter from "./authRoutes.js";
import historyRouter from "./historyRoutes.js";
import scanRouter from "./scanRoutes.js";
import projectRouter from "./projectRoutes.js";
import workspaceRouter from "./workspaceRoutes.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "BUG AI",
    timestamp: new Date().toISOString()
  });
});

router.use("/auth", authRouter);
router.use("/", projectRouter);
router.use("/", scanRouter);
router.use("/", historyRouter);
router.use("/", analyticsRouter);
router.use("/", workspaceRouter);
router.use("/admin", adminRouter);

export default router;
