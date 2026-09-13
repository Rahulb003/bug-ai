import { asyncHandler } from "../utils/asyncHandler.js";
import * as projects from "../services/projectService.js";

export const listProjectsController = asyncHandler(async (req, res) => res.json(await projects.listProjects(req.user)));
export const createProjectController = asyncHandler(async (req, res) => res.status(201).json(await projects.createProject(req.user, req.body)));
export const getProjectController = asyncHandler(async (req, res) => res.json(await projects.getProject(req.user, req.params.projectId)));
export const getProjectFilesController = asyncHandler(async (req, res) => res.json(await projects.getProjectFiles(req.user, req.params.projectId)));
export const renameProjectController = asyncHandler(async (req, res) => res.json(await projects.renameProject(req.user, req.params.projectId, req.body)));
export const updateProjectFileController = asyncHandler(async (req, res) => res.json(await projects.updateProjectFile(req.user, req.params.projectId, req.body)));
export const analyzeStoredProjectController = asyncHandler(async (req, res) => res.json(await projects.analyzeStoredProject(req.user, req.params.projectId, req.body)));
export const projectDependenciesController = asyncHandler(async (req, res) => res.json(await projects.projectDependencies(req.user, req.params.projectId)));
export const projectArchitectureController = asyncHandler(async (req, res) => res.json(await projects.projectArchitecture(req.user, req.params.projectId)));
export const deleteProjectController = asyncHandler(async (req, res) => res.json(await projects.deleteProject(req.user, req.params.projectId)));

export const importArchiveController = asyncHandler(async (req, res) => res.status(201).json(await projects.importProjectFromArchive(req.user, req.body)));
export const importGithubController = asyncHandler(async (req, res) => res.status(201).json(await projects.importProjectFromGithub(req.user, req.body)));
export const exportProjectController = asyncHandler(async (req, res) => {
  const { filename, buffer } = await projects.exportProjectArchive(req.user, req.params.projectId);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
});
