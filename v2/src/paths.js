import { collection, doc } from "./firebase.js";
import { db } from "./firebase.js";
import { APP_ID } from "./config.js";

export const BASE_PATH = ["artifacts", APP_ID, "public", "data"];

export const COLLECTIONS = {
  houseTotals: "houseTotals",
  rankings: "rankings",
  students: "students",
  activeReflections: "active_reflections",
  attendance: "attendance",
  scheduledTests: "scheduled_tests",
  userAccess: "userAccess",
  accessInvites: "accessInvites",
  auditLogs: "auditLogs",
  settings: "settings",
  publicScheduledTests: "publicScheduledTests",
  publicMetadata: "publicMetadata"
};

export function col(name) {
  return collection(db, ...BASE_PATH, name);
}

export function ref(name, id) {
  return doc(db, ...BASE_PATH, name, id);
}

export function settingsRef(id = "roles") {
  return doc(db, ...BASE_PATH, COLLECTIONS.settings, id);
}
