import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  analyzeStoredProjectController, createProjectController, deleteProjectController, getProjectController, getProjectFilesController,
  listProjectsController, projectArchitectureController, importArchiveController, importGithubController, exportProjectController, projectDependenciesController, renameProjectController, updateProjectFileController
} from "../controllers/projectController.js";

const router = Router();
router.use(requireAuth);
router.get("/projects", listProjectsController);
router.post("/projects", createProjectController);
router.post("/projects/import-zip", importArchiveController);
router.post("/projects/import-github", importGithubController);
router.get("/projects/:projectId/export", exportProjectController);
router.get("/projects/:projectId", getProjectController);
router.patch("/projects/:projectId", renameProjectController);
router.delete("/projects/:projectId", deleteProjectController);
router.get("/projects/:projectId/files", getProjectFilesController);
router.put("/projects/:projectId/files", updateProjectFileController);
router.post("/projects/:projectId/analyze", analyzeStoredProjectController);
router.get("/projects/:projectId/dependencies", projectDependenciesController);
router.get("/projects/:projectId/architecture", projectArchitectureController);
export default router;
