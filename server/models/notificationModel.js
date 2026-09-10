import { readDatabase, updateDatabase } from "./database.js";

export async function listNotificationsByUserId(userId) {
  const db = await readDatabase();
  return db.notifications
    .filter((notification) => notification.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function createNotificationRecord(notification) {
  await updateDatabase((db) => {
    db.notifications.push(notification);
    return db;
  });

  return notification;
}

export async function markNotificationRead(userId, notificationId) {
  let updatedRecord = null;

  await updateDatabase((db) => {
    const record = db.notifications.find((notification) => notification.id === notificationId && notification.userId === userId);
    if (record) {
      record.read = true;
      updatedRecord = record;
    }
    return db;
  });

  return updatedRecord;
}
