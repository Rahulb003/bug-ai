import { getScansByUserId, findScanById, saveScan } from "../models/scanModel.js";
import { getAllUsers, findUserByEmail, findUserById } from "../models/userModel.js";
import { createNotificationRecord, listNotificationsByUserId, markNotificationRead } from "../models/notificationModel.js";
import { saveWorkspaceRecord } from "../models/workspaceModel.js";
import { assertScanAccess, resolveWorkspaceForUser } from "./accessService.js";
import { createAppError } from "../utils/errors.js";
import { generateId } from "../utils/hash.js";

async function ensureWorkspaceForUser(user) {
  const existing = await resolveWorkspaceForUser(user);
  if (existing) return existing;

  const workspace = {
    id: generateId("ws"),
    ownerId: user.id,
    name: `${user.username}'s Workspace`,
    members: [
      {
        userId: user.id,
        email: user.email,
        role: user.role === "admin" ? "admin" : "admin",
        status: "active"
      }
    ],
    achievements: [],
    createdAt: new Date().toISOString()
  };

  await saveWorkspaceRecord(workspace);
  return workspace;
}

function buildAchievements(scans) {
  const achievements = [];
  const lowRiskScans = scans.filter((scan) => scan.riskScore <= 25).length;

  if (scans.length >= 1) {
    achievements.push({ id: "first-scan", label: "First Scan", tone: "low" });
  }
  if (lowRiskScans >= 3) {
    achievements.push({ id: "quality-guardian", label: "Quality Guardian", tone: "success" });
  }
  if (scans.some((scan) => scan.inputType === "github")) {
    achievements.push({ id: "repo-sentinel", label: "Repo Sentinel", tone: "high" });
  }

  return achievements;
}

function buildLeaderboard(users, scans) {
  const map = new Map();

  users.forEach((user) => {
    map.set(user.id, {
      userId: user.id,
      username: user.username,
      score: 0,
      scans: 0,
      avgRisk: 0
    });
  });

  scans.forEach((scan) => {
    const entry = map.get(scan.userId);
    if (!entry) return;
    entry.scans += 1;
    entry.score += Math.max(0, 100 - scan.riskScore) + Math.max(0, scan.codeQualityScore);
    entry.avgRisk += scan.riskScore;
  });

  return Array.from(map.values())
    .map((entry) => ({
      ...entry,
      avgRisk: entry.scans ? Math.round(entry.avgRisk / entry.scans) : 0
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export async function getWorkspaceOverview(user) {
  const [workspace, scans, notifications, users, allScans] = await Promise.all([
    ensureWorkspaceForUser(user),
    getScansByUserId(user.id),
    listNotificationsByUserId(user.id),
    getAllUsers(),
    getScansByUserId(undefined, true)
  ]);

  const sortedScans = scans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const latestScan = sortedScans[0] || null;
  let lowRiskStreak = 0;
  for (const scan of sortedScans) {
    if (scan.riskScore <= 30) {
      lowRiskStreak += 1;
    } else {
      break;
    }
  }

  return {
    workspace: {
      ...workspace,
      currentMemberRole: workspace.members.find((member) => member.userId === user.id)?.role || "viewer",
      memberProfiles: await Promise.all(workspace.members.map(async (member) => {
        const profile = member.userId ? await findUserById(member.userId) : await findUserByEmail(member.email);
        return {
          name: profile?.username || member.email,
          email: member.email,
          role: member.role,
          status: member.status
        };
      }))
    },
    gamification: {
      bugFreeStreak: lowRiskStreak,
      qualityRank: latestScan ? Math.max(1, 100 - latestScan.riskScore) : 0,
      achievements: buildAchievements(sortedScans)
    },
    notifications: notifications.slice(0, 8),
    leaderboard: buildLeaderboard(users, allScans)
  };
}

export async function inviteWorkspaceMember(user, payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const role = ["admin", "member", "viewer"].includes(String(payload.role || "").toLowerCase())
    ? String(payload.role).toLowerCase()
    : "member";

  if (!email) {
    throw createAppError(400, "Invite email is required.");
  }

  const workspace = await ensureWorkspaceForUser(user);
  const currentMember = workspace.members.find((member) => member.userId === user.id);
  if (currentMember?.role === "viewer") {
    throw createAppError(403, "Viewer access cannot invite teammates.");
  }
  if (workspace.members.some((member) => member.email === email)) {
    throw createAppError(409, "That teammate is already in the workspace.");
  }

  const teammate = await findUserByEmail(email);
  workspace.members.push({
    userId: teammate?.id || null,
    email,
    role,
    status: teammate ? "active" : "invited"
  });
  await saveWorkspaceRecord(workspace);

  if (teammate) {
    await createNotificationRecord({
      id: generateId("note"),
      userId: teammate.id,
      type: "workspace_invite",
      title: "Workspace access granted",
      message: `${user.username} added you to ${workspace.name} as ${role}.`,
      read: false,
      createdAt: new Date().toISOString()
    });
  }

  return { workspace };
}

export async function addReportComment(user, scanId, payload) {
  const scan = await findScanById(scanId);
  await assertScanAccess(user, scan, "Report not found.");

  const message = String(payload.message || "").trim();
  if (!message) {
    throw createAppError(400, "Comment message is required.");
  }

  scan.comments = scan.comments || [];
  scan.comments.push({
    id: generateId("comment"),
    authorId: user.id,
    authorName: user.username,
    message,
    createdAt: new Date().toISOString()
  });

  await saveScan(scan);

  return { comments: scan.comments };
}

export async function getReportComments(user, scanId) {
  const scan = await findScanById(scanId);
  await assertScanAccess(user, scan, "Report not found.");

  return { comments: scan.comments || [] };
}

export async function getUserNotifications(user) {
  return { notifications: await listNotificationsByUserId(user.id) };
}

export async function markUserNotificationRead(user, notificationId) {
  const notification = await markNotificationRead(user.id, notificationId);
  if (!notification) {
    throw createAppError(404, "Notification not found.");
  }

  return { notification };
}

export async function getAssistantReply(user, payload) {
  const prompt = String(payload.message || "").trim();
  if (!prompt) {
    throw createAppError(400, "Assistant message is required.");
  }

  const scan = payload.scanId ? await findScanById(payload.scanId) : null;
  if (scan) {
    await assertScanAccess(user, scan, "Scan not found.");
  }

  const latestScan = scan || (await getScansByUserId(user.id)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const lowerPrompt = prompt.toLowerCase();
  let answer = "I can help explain the latest scan, summarize risk, or suggest the next remediation step.";

  if (latestScan) {
    if (lowerPrompt.includes("risk")) {
      answer = `The current risk score is ${latestScan.riskScore}% with a ${latestScan.riskLevel} rating. The biggest drivers are ${latestScan.bugs.slice(0, 3).map((bug) => bug.title.toLowerCase()).join(", ") || "no active findings"}.`;
    } else if (lowerPrompt.includes("fix") || lowerPrompt.includes("repair")) {
      answer = latestScan.suggestedFixes.length
        ? `Start with these fixes: ${latestScan.suggestedFixes.slice(0, 4).join(" ")}`
        : "This scan does not have suggested fixes yet, so I would begin by re-running the scan on the exact source you want me to inspect.";
    } else if (lowerPrompt.includes("explain") || lowerPrompt.includes("bug")) {
      const firstBug = latestScan.bugs[0];
      answer = firstBug
        ? `${firstBug.title} is marked ${firstBug.severity}. It happens because ${firstBug.whyItHappens} The suggested fix is: ${firstBug.fix}`
        : "The latest scan did not flag a bug, so the code currently looks relatively safe based on the active rules.";
    } else if (lowerPrompt.includes("improve") || lowerPrompt.includes("quality")) {
      answer = `Your quality score is ${latestScan.codeQualityScore}. To improve it quickly, reduce ${latestScan.bugs.length ? latestScan.bugs[0].category : "residual"} issues first, then rescan the fixed version to confirm the score lifts.`;
    }
  }

  return {
    reply: answer,
    suggestions: [
      "Explain this bug",
      "Why is the risk score high?",
      "What should I fix first?",
      "How can I improve code quality?"
    ]
  };
}

export function getDevopsTemplates() {
  return {
    githubActions: `name: BugZero AI Scan\non: [push, pull_request]\njobs:\n  scan:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Send source to BugZero AI\n        run: curl -X POST \"$BUGZERO_API/api/scan-github\" -H \"Authorization: Bearer $BUGZERO_TOKEN\" -H \"Content-Type: application/json\" -d '{\"repoUrl\":\"https://github.com/${"{ github.repository }"}\"}'\n`,
    gitlabCi: `bugzero_scan:\n  image: curlimages/curl:latest\n  stage: test\n  script:\n    - 'curl -X POST \"$BUGZERO_API/api/scan-github\" -H \"Authorization: Bearer $BUGZERO_TOKEN\" -H \"Content-Type: application/json\" -d \"{\\\"repoUrl\\\":\\\"$CI_PROJECT_URL\\\"}\"'\n`,
    jenkins: `pipeline {\n  agent any\n  stages {\n    stage('BugZero Scan') {\n      steps {\n        sh 'curl -X POST \"$BUGZERO_API/api/scan-github\" -H \"Authorization: Bearer $BUGZERO_TOKEN\" -H \"Content-Type: application/json\" -d \"{\\\"repoUrl\\\":\\\"$GIT_URL\\\"}\"'\n      }\n    }\n  }\n}\n`
  };
}
