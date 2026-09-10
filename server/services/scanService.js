import { persistScan } from "../models/scanModel.js";
import { recordAnalyticsEvent } from "../models/analyticsModel.js";
import { createNotificationRecord } from "../models/notificationModel.js";
import { analyzeWithEngine, analyzeProjectWithEngine } from "./engine/analysisPipeline.js";
import { fetchGithubRepositoryFiles } from "./engine/githubClient.js";
import { createAppError } from "../utils/errors.js";
import { detectLanguageFromName, normalizeProjectFiles } from "../utils/files.js";
import { generateId } from "../utils/hash.js";

const MAX_SNIPPET_CHARS = 200000;

function buildStoredScan({ userId, inputType, sourceName, language, sourceText, result }) {
  return {
    id: generateId("scan"),
    userId,
    inputType,
    sourceName,
    language,
    sourceCode: sourceText,
    sourcePreview: sourceText.slice(0, 400),
    createdAt: new Date().toISOString(),
    sharedId: null,
    ...result
  };
}

async function createScanNotifications(scan) {
  await createNotificationRecord({
    id: generateId("note"),
    userId: scan.userId,
    type: "scan_completed",
    title: "Scan completed",
    message: `${scan.sourceName} finished with a ${scan.riskLevel} risk score of ${scan.riskScore}%.`,
    read: false,
    createdAt: new Date().toISOString()
  });

  if (scan.riskScore >= 70 || scan.severityBreakdown.critical > 0) {
    await createNotificationRecord({
      id: generateId("note"),
      userId: scan.userId,
      type: "high_risk_alert",
      title: "New bugs detected",
      message: `${scan.bugs.length} findings need attention, including ${scan.severityBreakdown.critical} critical issues.`,
      read: false,
      createdAt: new Date().toISOString()
    });
  }
}

export async function analyzeCodeSnippet({ userId, payload }) {
  const code = String(payload.code || "").trim();
  const language = payload.language || detectLanguageFromName(payload.filename || "snippet.js");

  if (!code) {
    throw createAppError(400, "Code input is required.");
  }
  if (code.length > MAX_SNIPPET_CHARS) {
    throw createAppError(413, "Code input exceeds the 200,000-character scan limit.");
  }

  const result = await analyzeWithEngine({
    source: code,
    language,
    sourceName: payload.filename || "Live snippet"
  });

  const scan = buildStoredScan({
    userId,
    inputType: "code",
    sourceName: payload.filename || "Live snippet",
    language,
    sourceText: code,
    result
  });

  await persistScan(scan);
  await recordAnalyticsEvent(scan);
  await createScanNotifications(scan);
  return scan;
}

export async function analyzeProjectBundle({ userId, payload }) {
  const normalized = normalizeProjectFiles(payload.files || []);
  if (!normalized.length) {
    throw createAppError(400, "At least one source file is required.");
  }

  const result = await analyzeProjectWithEngine({ files: normalized, sourceName: payload.projectName || "Uploaded project" });

  const scan = buildStoredScan({
    userId,
    inputType: "project",
    sourceName: payload.projectName || "Uploaded project",
    language: "multi-language",
    sourceText: normalized.map((file) => `// FILE: ${file.name}\n${file.content}`).join("\n\n"),
    result
  });

  scan.projectFiles = normalized.map((file) => ({
    name: file.name,
    size: file.content.length
  }));

  await persistScan(scan);
  await recordAnalyticsEvent(scan);
  await createScanNotifications(scan);
  return scan;
}

export async function analyzeGithubRepository({ userId, payload }) {
  const repoUrl = String(payload.repoUrl || "").trim();
  if (!repoUrl) {
    throw createAppError(400, "GitHub repository URL is required.");
  }

  const files = await fetchGithubRepositoryFiles(repoUrl);
  const result = await analyzeProjectWithEngine({ files, sourceName: repoUrl });

  const scan = buildStoredScan({
    userId,
    inputType: "github",
    sourceName: repoUrl,
    language: "multi-language",
    sourceText: files.map((file) => `// FILE: ${file.path || file.name}\n${file.content}`).join("\n\n"),
    result
  });

  scan.projectFiles = files.map((file) => ({
    name: file.path,
    size: file.content.length
  }));

  await persistScan(scan);
  await recordAnalyticsEvent(scan);
  await createScanNotifications(scan);
  return scan;
}
