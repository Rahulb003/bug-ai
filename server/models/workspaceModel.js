import { readDatabase, updateDatabase } from "./database.js";

export async function getWorkspaceByOwnerId(ownerId) {
  const db = await readDatabase();
  return db.workspaces.find((workspace) => workspace.ownerId === ownerId) || null;
}

export async function getWorkspaceByUserId(userId) {
  const db = await readDatabase();
  return db.workspaces.find((workspace) => workspace.members?.some((member) => member.userId === userId)) || null;
}

export async function getWorkspaceByMemberEmail(email) {
  const db = await readDatabase();
  return db.workspaces.find((workspace) => workspace.members?.some((member) => member.email === email)) || null;
}

export async function attachWorkspaceInvites(email, userId) {
  let attached = 0;

  await updateDatabase((db) => {
    db.workspaces.forEach((workspace) => {
      workspace.members = (workspace.members || []).map((member) => {
        if (member.email === email && !member.userId) {
          attached += 1;
          return {
            ...member,
            userId,
            status: "active"
          };
        }
        return member;
      });
    });

    return db;
  });

  return attached;
}

export async function claimWorkspaceInvite(email, userId) {
  let claimedWorkspace = null;

  await updateDatabase((db) => {
    db.workspaces.forEach((workspace) => {
      const nextMembers = (workspace.members || []).map((member) => {
        if (member.email === email && (!member.userId || member.userId === userId)) {
          claimedWorkspace = claimedWorkspace || workspace;
          return {
            ...member,
            userId,
            status: "active"
          };
        }
        return member;
      });

      workspace.members = nextMembers;
    });

    return db;
  });

  return claimedWorkspace;
}

export async function saveWorkspaceRecord(workspace) {
  await updateDatabase((db) => {
    const index = db.workspaces.findIndex((entry) => entry.id === workspace.id);
    if (index >= 0) {
      db.workspaces[index] = workspace;
    } else {
      db.workspaces.push(workspace);
    }
    return db;
  });

  return workspace;
}
