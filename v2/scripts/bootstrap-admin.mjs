#!/usr/bin/env node
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

const [serviceAccountPath, emailArg, uidArg] = process.argv.slice(2);
if (!serviceAccountPath || !emailArg) {
  console.error("Usage: node scripts/bootstrap-admin.mjs ./service-account.json admin@scis-bo.com [firebaseAuthUid]");
  process.exit(1);
}

const serviceAccount = require(process.cwd() + "/" + serviceAccountPath.replace(/^\.\//, ""));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const auth = admin.auth();
const email = emailArg.trim().toLowerCase();
const uid = uidArg || null;
const APP_ID = "scis-house-points";
const BASE = `artifacts/${APP_ID}/public/data`;
const permissions = {
  canSubmitPoints: true,
  canGiveAR: true,
  canGiveDR: true,
  canSubmitAttendance: true,
  canManageCalendar: true,
  canManageStudents: true,
  canApproveReflections: true,
  canProcessHousePoints: true,
  canManageRoles: true
};
const roles = { teacher: true, coordinator: true, admin: true };

function emailKey(value) {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

const record = {
  ...(uid ? { uid } : {}),
  email,
  displayName: "Bootstrap Admin",
  active: true,
  roles,
  permissions,
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  createdBy: "bootstrap-admin-script",
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedBy: "bootstrap-admin-script",
  sourceApp: "unified-v2-bootstrap"
};

if (uid) {
  await db.doc(`${BASE}/userAccess/${uid}`).set(record, { merge: true });
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, {
    ...(user.customClaims || {}),
    schoolUser: true,
    teacher: true,
    coordinator: true,
    admin: true,
    roles,
    permissions
  });
  console.log(`Updated userAccess/${uid} and custom claims for ${email}`);
} else {
  await db.doc(`${BASE}/accessInvites/${emailKey(email)}`).set(record, { merge: true });
  console.log(`Created access invite for ${email}`);
}

const rolesRef = db.doc(`${BASE}/settings/roles`);
const rolesSnap = await rolesRef.get();
const data = rolesSnap.exists ? rolesSnap.data() : { admins: [], coordinators: [] };
const admins = new Set([...(data.admins || []).map((x) => String(x).toLowerCase()), email]);
const coordinators = new Set([...(data.coordinators || []).map((x) => String(x).toLowerCase()), email]);
await rolesRef.set({
  admins: [...admins].sort(),
  coordinators: [...coordinators].sort(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedBy: "bootstrap-admin-script"
}, { merge: true });

console.log("Done.");
process.exit(0);
