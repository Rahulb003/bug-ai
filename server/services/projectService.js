import { findProjectById, listProjectsByUserId, removeProject, saveProject } from "../models/projectModel.js";
import { normalizeProjectFiles } from "../utils/files.js";
import { createAppError } from "../utils/errors.js";
import { generateId } from "../utils/hash.js";
import { analyseProject } from "./engine/projectAnalyzer.js";
import { analyzeProjectWithEngine } from "./engine/analysisPipeline.js";
import { extractArchive, stripCommonRoot, buildArchive } from "./archiveService.js";
import { buildTechnicalDebt } from "./engine/debtAnalyzer.js";
import { fetchGithubRepositoryFiles } from "./engine/githubClient.js";

function summary(project) {
  return {
    id: project.id, name: project.name, ownerId: project.ownerId, createdAt: project.createdAt, updatedAt: project.updatedAt,
    languages: project.metadata.languages, fileCount: project.files.length, manifests: project.metadata.manifests,
    dependencies: project.metadata.dependencies, architecture: project.metadata.architecture,
    lastAnalysis: project.lastAnalysis ? { summary: project.lastAnalysis.summary, verification: project.lastAnalysis.verification, createdAt: project.lastAnalysis.createdAt } : null
  };
}

export async function requireProject(user, id) {
  const project = await findProjectById(id);
  if (!project || project.ownerId !== user.id) throw createAppError(404, "Project not found.");
  return project;
}

function buildMetadata(files) {
  const analyzed = analyseProject(files);
  return { languages: analyzed.languages, manifests: analyzed.manifests, tests: analyzed.tests, dependencies: analyzed.dependencies, architecture: analyzed.architecture };
}

export async function listProjects(user) { return { projects: (await listProjectsByUserId(user.id)).map(summary) }; }

export async function createProject(user, payload) {
  const name = String(payload.name || payload.projectName || "Untitled project").trim().slice(0, 120);
  const files = normalizeProjectFiles(payload.files || []);
  if (!files.length) throw createAppError(400, "At least one supported source file or manifest is required.");
  const now = new Date().toISOString();
  const project = { id: generateId("project"), ownerId: user.id, name, files, metadata: buildMetadata(files), createdAt: now, updatedAt: now, lastAnalysis: null };
  await saveProject(project);
  return { project: summary(project) };
}

export async function getProject(user, id) { return { project: summary(await requireProject(user, id)) }; }

export async function getProjectFiles(user, id) {
  const project = await requireProject(user, id);
  return { files: project.files.map(({ name, language, content }) => ({ name, language, size: content.length, content })) };
}

export async function renameProject(user, id, payload) {
  const project = await requireProject(user, id);
  const name = String(payload.name || "").trim().slice(0, 120);
  if (!name) throw createAppError(400, "Project name is required.");
  project.name = name; project.updatedAt = new Date().toISOString();
  await saveProject(project);
  return { project: summary(project) };
}

export async function updateProjectFile(user, id, payload) {
  const project = await requireProject(user, id);
  const name = String(payload.name || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const content = String(payload.content ?? "");
  if (!name || name.includes("..") || content.length > 200000) throw createAppError(400, "Provide a safe filename and content under 200,000 characters.");
  const existing = project.files.find((file) => file.name === name);
  if (existing) existing.content = content;
  else project.files.push(...normalizeProjectFiles([{ name, content }]));
  project.metadata = buildMetadata(project.files); project.updatedAt = new Date().toISOString();
  await saveProject(project);
  return { project: summary(project) };
}

export async function analyzeStoredProject(user, id, payload = {}) {
  const project = await requireProject(user, id);
  const result = await analyzeProjectWithEngine({ files: project.files, sourceName: project.name, includeAi: payload.includeAi !== false });
  // Keep the prior analysis (findings + summary only) so trends can be measured
  // rather than guessed. Only one predecessor is retained.
  if (project.lastAnalysis) project.previousAnalysis = { findings: project.lastAnalysis.findings, summary: project.lastAnalysis.summary, createdAt: project.lastAnalysis.createdAt };
  project.lastAnalysis = { ...result, createdAt: new Date().toISOString() };
  project.metadata = buildMetadata(project.files); project.updatedAt = new Date().toISOString();
  await saveProject(project);
  return { project: summary(project), analysis: project.lastAnalysis };
}

export async function projectDependencies(user, id) { return { dependencies: (await requireProject(user, id)).metadata.dependencies }; }
export async function projectArchitecture(user, id) { return { architecture: (await requireProject(user, id)).metadata.architecture }; }
export async function deleteProject(user, id) { await requireProject(user, id); await removeProject(id); return { deleted: true }; }

// ZIP import: the archive becomes the same file list createProject accepts, so
// every existing cap and ignore rule applies. What was dropped is reported.
export async function importProjectFromArchive(user, payload) {
  const extracted = extractArchive(payload.archive || payload.zip || payload.zipBase64);
  const files = stripCommonRoot(extracted.files);
  const before = files.length;
  const result = await createProject(user, { name: payload.name || payload.filename?.replace(/\.zip$/i, "") || "Imported archive", files });
  return {
    ...result,
    import: {
      source: "zip",
      entriesInArchive: extracted.entryCount,
      textFilesFound: before,
      filesKept: result.project.fileCount,
      skipped: { ...extracted.skipped, unsupportedOrCapped: before - result.project.fileCount }
    }
  };
}

// GitHub import: only public repositories, read-only, through the existing
// client with its own path and size caps.
export async function importProjectFromGithub(user, payload) {
  const repoUrl = String(payload.repoUrl || "").trim();
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(repoUrl)) throw createAppError(400, "Provide a public repository URL like https://github.com/owner/repository.");
  const fetched = await fetchGithubRepositoryFiles(repoUrl);
  const files = (fetched.files || fetched || []).map((f) => ({ name: f.path || f.name, content: f.content }));
  const name = payload.name || repoUrl.split("/").slice(-2).join("/");
  const result = await createProject(user, { name, files });
  return { ...result, import: { source: "github", repoUrl, filesFetched: files.length, filesKept: result.project.fileCount } };
}

export async function exportProjectArchive(user, id) {
  const project = await requireProject(user, id);
  return { filename: `${project.name.replace(/[^\w.-]+/g, "_") || "project"}.zip`, buffer: buildArchive(project.files) };
}

export async function projectTechnicalDebt(user, id) { return { debt: buildTechnicalDebt(await requireProject(user, id)) }; }
