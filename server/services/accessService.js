import { claimWorkspaceInvite, getWorkspaceByUserId } from "../models/workspaceModel.js";
import { createAppError } from "../utils/errors.js";

export async function resolveWorkspaceForUser(user) {
  const directWorkspace = await getWorkspaceByUserId(user.id);
  if (directWorkspace) return directWorkspace;

  if (user.email) {
    return claimWorkspaceInvite(user.email, user.id);
  }

  return null;
}

export async function getAccessibleUserIds(user) {
  const workspace = await resolveWorkspaceForUser(user);
  const ids = new Set([user.id]);

  (workspace?.members || []).forEach((member) => {
    if (member.userId) {
      ids.add(member.userId);
    }
  });

  return Array.from(ids);
}

export async function canAccessScan(user, scan) {
  if (!scan) return false;
  const accessibleUserIds = await getAccessibleUserIds(user);
  return accessibleUserIds.includes(scan.userId);
}

export async function assertScanAccess(user, scan, message = "Scan not found.") {
  if (!scan || !(await canAccessScan(user, scan))) {
    throw createAppError(404, message);
  }

  return scan;
}
