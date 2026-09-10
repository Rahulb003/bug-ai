import {
  addReportComment,
  getAssistantReply,
  getDevopsTemplates,
  getReportComments,
  getUserNotifications,
  getWorkspaceOverview,
  inviteWorkspaceMember,
  markUserNotificationRead
} from "../services/workspaceService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const workspaceOverviewController = asyncHandler(async (req, res) => {
  const data = await getWorkspaceOverview(req.user);
  res.json(data);
});

export const inviteWorkspaceMemberController = asyncHandler(async (req, res) => {
  const data = await inviteWorkspaceMember(req.user, req.body);
  res.status(201).json(data);
});

export const listReportCommentsController = asyncHandler(async (req, res) => {
  const data = await getReportComments(req.user, req.params.scanId);
  res.json(data);
});

export const addReportCommentController = asyncHandler(async (req, res) => {
  const data = await addReportComment(req.user, req.params.scanId, req.body);
  res.status(201).json(data);
});

export const notificationsController = asyncHandler(async (req, res) => {
  const data = await getUserNotifications(req.user);
  res.json(data);
});

export const markNotificationReadController = asyncHandler(async (req, res) => {
  const data = await markUserNotificationRead(req.user, req.params.notificationId);
  res.json(data);
});

export const assistantChatController = asyncHandler(async (req, res) => {
  const data = await getAssistantReply(req.user, req.body);
  res.json(data);
});

export const devopsTemplatesController = asyncHandler(async (req, res) => {
  res.json(getDevopsTemplates());
});
