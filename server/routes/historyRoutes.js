import { Router } from "express";
import {
  compareScansController,
  exportReportController,
  getHistoryController,
  getSharedReportController,
  shareReportController
} from "../controllers/historyController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/history", requireAuth, getHistoryController);
router.post("/history/compare", requireAuth, compareScansController);
router.post("/share-report", requireAuth, (req, res, next) => {
  req.params.scanId = req.body.scanId;
  return shareReportController(req, res, next);
});
router.post("/history/:scanId/share", requireAuth, shareReportController);
router.get("/history/:scanId/export", requireAuth, exportReportController);
router.get("/reports/:shareId", getSharedReportController);

export default router;
