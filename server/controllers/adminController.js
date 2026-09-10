import { getAdminOverview } from "../services/adminService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const adminOverviewController = asyncHandler(async (req, res) => {
  const overview = await getAdminOverview();
  res.json(overview);
});
