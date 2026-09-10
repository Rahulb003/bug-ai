import { readDatabase, updateDatabase } from "./database.js";

export async function listProjectsByUserId(userId) {
  const db = await readDatabase();
  return db.projects.filter((project) => project.ownerId === userId);
}

export async function findProjectById(id) {
  const db = await readDatabase();
  return db.projects.find((project) => project.id === id) || null;
}

export async function saveProject(project) {
  await updateDatabase((db) => {
    db.projects = db.projects || [];
    const index = db.projects.findIndex((item) => item.id === project.id);
    if (index >= 0) db.projects[index] = project;
    else db.projects.push(project);
    return db;
  });
  return project;
}

export async function removeProject(id) {
  await updateDatabase((db) => {
    db.projects = (db.projects || []).filter((project) => project.id !== id);
    return db;
  });
}
