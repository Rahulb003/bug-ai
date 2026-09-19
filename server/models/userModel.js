import { readDatabase, updateDatabase } from "./database.js";

export async function getAllUsers() {
  const db = await readDatabase();
  return db.users;
}

export async function findUserByUsername(username) {
  const db = await readDatabase();
  return db.users.find((user) => user.username.toLowerCase() === String(username).toLowerCase());
}

export async function findUserByEmail(email) {
  const db = await readDatabase();
  return db.users.find((user) => user.email.toLowerCase() === String(email).toLowerCase());
}

export async function findUserById(id) {
  const db = await readDatabase();
  return db.users.find((user) => user.id === id);
}

export async function createUserRecord(user) {
  await updateDatabase((db) => {
    db.users.push(user);
    return db;
  });
  return user;
}

export async function upsertUser(user) {
  await updateDatabase((db) => {
    const index = db.users.findIndex((entry) => entry.email === user.email);
    if (index >= 0) {
      db.users[index] = { ...db.users[index], ...user };
    } else {
      db.users.push(user);
    }
    return db;
  });
  return user;
}

export async function updateUserById(id, patch) {
  let updated = null;
  await updateDatabase((db) => {
    const index = db.users.findIndex((entry) => entry.id === id);
    if (index >= 0) { db.users[index] = { ...db.users[index], ...patch }; updated = db.users[index]; }
    return db;
  });
  return updated;
}
