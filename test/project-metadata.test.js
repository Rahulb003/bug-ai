import test from "node:test";
import assert from "node:assert/strict";
import { analyseProject } from "../server/services/engine/projectAnalyzer.js";

test("builds deterministic dependency and architecture metadata from project files", () => {
  const project = analyseProject([
    { name: "package.json", content: JSON.stringify({ dependencies: { express: "1.0.0" } }) },
    { name: "src/routes/api.js", content: "import service from '../services/user.js'; const express = require('express');" },
    { name: "src/services/user.js", content: "export default function user() {}" },
    { name: "node_modules/ignored.js", content: "require('bad-package')" }
  ]);
  assert.deepEqual(project.dependencies.declared, ["express"]);
  assert.ok(project.dependencies.imported.includes("express"));
  assert.ok(project.dependencies.edges.some((edge) => edge.target === "../services/user.js" && edge.type === "internal"));
  assert.ok(project.architecture.components.some((component) => component.file === "src/routes/api.js" && component.layer === "interface"));
  assert.ok(!project.files.some((file) => file.name.includes("node_modules")));
});
