import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  addReportCommentController,
  assistantChatController,
  devopsTemplatesController,
  inviteWorkspaceMemberController,
  listReportCommentsController,
  markNotificationReadController,
  notificationsController,
  workspaceOverviewController
} from "../controllers/workspaceController.js";

const router = Router();

router.get("/workspace", requireAuth, workspaceOverviewController);
router.post("/workspace/invite", requireAuth, inviteWorkspaceMemberController);
router.get("/reports/:scanId/comments", requireAuth, listReportCommentsController);
router.post("/reports/:scanId/comments", requireAuth, addReportCommentController);
router.get("/notifications", requireAuth, notificationsController);
router.post("/notifications/:notificationId/read", requireAuth, markNotificationReadController);
router.post("/assistant/chat", requireAuth, assistantChatController);
router.get("/devops/templates", requireAuth, devopsTemplatesController);

export default router;
