import {
  compareScans,
  createShareLink,
  exportScanReport,
  getScanHistory,
  getSharedReport
} from "../services/historyService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getHistoryController = asyncHandler(async (req, res) => {
  const history = await getScanHistory(req.user);
  res.json(history);
});

export const compareScansController = asyncHandler(async (req, res) => {
  const comparison = await compareScans(req.user, req.body);
  res.json(comparison);
});

export const shareReportController = asyncHandler(async (req, res) => {
  const share = await createShareLink(req.user, req.params.scanId);
  res.json(share);
});

export const getSharedReportController = asyncHandler(async (req, res) => {
  const report = await getSharedReport(req.params.shareId);
  res.json(report);
});

export const exportReportController = asyncHandler(async (req, res) => {
  const result = await exportScanReport(req.user, req.params.scanId, req.query.format);
  res.json(result);
});
