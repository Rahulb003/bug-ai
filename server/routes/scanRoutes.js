import { Router } from "express";
import {
  legacyFixController,
  legacyPredictController,
  scanCodeController,
  scanGithubController,
  uploadProjectController,
  analyzeController,
  fixController,
  optimizeController,
  generateTestsController,
  verifyController,
  explainController,
  getScanController,
  getScanFindingsController,
  getScanVerificationController
} from "../controllers/scanController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/scan-code", requireAuth, scanCodeController);
router.post("/upload-project", requireAuth, uploadProjectController);
router.post("/scan-github", requireAuth, scanGithubController);
router.post("/scan", requireAuth, scanCodeController);
router.post("/analyze", requireAuth, analyzeController);
router.post("/fix", requireAuth, fixController);
router.post("/optimize", requireAuth, optimizeController);
router.post("/test/generate", requireAuth, generateTestsController);
router.post("/verify", requireAuth, verifyController);
router.post("/explain", requireAuth, explainController);
router.post("/project/analyze", requireAuth, uploadProjectController);
router.get("/scans/:scanId", requireAuth, getScanController);
router.get("/scans/:scanId/findings", requireAuth, getScanFindingsController);
router.get("/scans/:scanId/verification", requireAuth, getScanVerificationController);
router.post("/legacy/predict", legacyPredictController);
router.post("/legacy/fix", legacyFixController);

export default router;
