import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import apiRouter from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { requestRateLimiter } from "./middleware/rateLimiter.js";
import { attachRequestContext, securityHeaders, sanitizeBody } from "./middleware/security.js";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicFiles = new Set([
  "index.html", "dashboard.html", "history.html", "login.html", "signup.html", "admin.html",
  "analyzer.html", "upload.html", "frontend.html", "style.css", "ui.js", "workspace.css", "workspace.js",
  "studio.html", "studio.js", "pages.js", "optimizer.js", "tests.js", "projects.js", "dashboard.js", "favicon.svg", "projects.html", "optimizer.html", "security.html", "tests.html", "review.html", "architecture.html", "dependencies.html", "assistant.html", "git.html", "analytics.html", "settings.html"
]);

app.get("/favicon.ico", (req, res) => res.type("image/svg+xml").sendFile(path.join(rootDir, "favicon.svg")));

app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(attachRequestContext);
app.use(securityHeaders);
app.use(sanitizeBody);
app.get("/", (req, res) => {
  res.sendFile(path.join(rootDir, "index.html"));
});

// Deliberately serve only the browser UI assets. Never expose the repository
// root: it contains database records, server source, package metadata, and .env.
app.get("/:filename", (req, res, next) => {
  const filename = decodeURIComponent(req.params.filename || "");
  if (!publicFiles.has(filename)) return next();
  return res.sendFile(path.join(rootDir, filename), { dotfiles: "deny" });
});

app.use("/api", requestRateLimiter, apiRouter);

app.post("/signup", async (req, res, next) => {
  try {
    const { registerController } = await import("./controllers/authController.js");
    return registerController(req, res, next);
  } catch (error) {
    return next(error);
  }
});

app.post("/login", async (req, res, next) => {
  try {
    const { loginController } = await import("./controllers/authController.js");
    return loginController(req, res, next);
  } catch (error) {
    return next(error);
  }
});

app.post("/predict-bugs", async (req, res, next) => {
  try {
    const { legacyPredictController } = await import("./controllers/scanController.js");
    return legacyPredictController(req, res, next);
  } catch (error) {
    return next(error);
  }
});

app.post("/ai-fix", async (req, res, next) => {
  try {
    const { legacyFixController } = await import("./controllers/scanController.js");
    return legacyFixController(req, res, next);
  } catch (error) {
    return next(error);
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
