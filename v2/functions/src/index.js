const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();
const FieldValue = admin.firestore.FieldValue;

const APP_ID = "scis-house-points";
const BASE = `artifacts/${APP_ID}/public/data`;
const FALLBACK_ADMIN_EMAIL = "dolguin@scis-bo.com";
const HOUSES = ["centaurs", "pegasus", "titans", "unicorns"];
const POINTS_BY_RANK = { first: 10, second: 7, third: 4, fourth: 3 };
const PERMISSION_KEYS = [
  "canSubmitPoints",
  "canGiveAR",
  "canGiveDR",
  "canSubmitAttendance",
  "canManageCalendar",
  "canManageStudents",
  "canApproveReflections",
  "canProcessHousePoints",
  "canManageRoles"
];

function dataCollection(name) {
  return db.collection(`${BASE}/${name}`);
}

function dataDoc(collectionName, id) {
  return db.doc(`${BASE}/${collectionName}/${id}`);
}

function settingsDoc(id = "roles") {
  return db.doc(`${BASE}/settings/${id}`);
}

function normalizeEmail(email = "") {
  return String(email || "").trim().toLowerCase();
}

function emailKey(email = "") {
  return normalizeEmail(email).replace(/[^a-z0-9_-]/g, "_");
}

function getSafeArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value) return [value];
  return [];
}

function defaultRoles(roles = {}) {
  return {
    teacher: roles.teacher !== false,
    coordinator: roles.coordinator === true,
    admin: roles.admin === true
  };
}

function defaultPermissions(permissions = {}) {
  const out = {};
  for (const key of PERMISSION_KEYS) out[key] = permissions[key] === true;
  return out;
}

function adminPermissions() {
  const out = {};
  for (const key of PERMISSION_KEYS) out[key] = true;
  return out;
}

function applyRolePermissionDefaults(inputRoles, inputPermissions) {
  const roles = defaultRoles(inputRoles);
  let permissions = defaultPermissions(inputPermissions);

  if (roles.admin) {
    roles.teacher = true;
    roles.coordinator = true;
    permissions = adminPermissions();
  }

  if (roles.coordinator) {
    permissions.canApproveReflections = true;
    permissions.canProcessHousePoints = true;
  }

  return { roles, permissions };
}

function requestEmail(request) {
  return normalizeEmail(request.auth?.token?.email || "");
}

async function writeAuditLog({ action, actorEmail, targetEmail = null, before = null, after = null, details = null }) {
  await dataCollection("auditLogs").add({
    action,
    actorEmail: normalizeEmail(actorEmail),
    targetEmail: targetEmail ? normalizeEmail(targetEmail) : null,
    before,
    after,
    details,
    createdAt: FieldValue.serverTimestamp(),
    sourceApp: "unified-v2-functions"
  });
}

async function getAccessByUid(uid) {
  if (!uid) return null;
  const snap = await dataDoc("userAccess", uid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function getAccessByEmail(email) {
  const normalized = normalizeEmail(email);
  const snap = await dataCollection("userAccess").where("email", "==", normalized).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function getCallerAccess(request) {
  if (!request.auth?.uid) return null;
  const access = await getAccessByUid(request.auth.uid);
  if (access) return access;

  const email = requestEmail(request);
  if (email === FALLBACK_ADMIN_EMAIL) {
    return {
      uid: request.auth.uid,
      email,
      active: true,
      roles: { teacher: true, coordinator: true, admin: true },
      permissions: adminPermissions(),
      fallbackAdmin: true
    };
  }
  return null;
}

function hasPermission(access, permission) {
  if (!access || access.active === false) return false;
  if (access.roles?.admin === true) return true;
  return access.permissions?.[permission] === true;
}

async function assertPermission(request, permission) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const access = await getCallerAccess(request);
  if (!hasPermission(access, permission)) {
    throw new HttpsError("permission-denied", `Missing permission: ${permission}`);
  }
  return access;
}

async function syncLegacyRoles(actorEmail = "system") {
  const admins = new Set([FALLBACK_ADMIN_EMAIL]);
  const coordinators = new Set();

  const consume = (data) => {
    if (!data?.email || data.active === false) return;
    const email = normalizeEmail(data.email);
    if (data.roles?.admin) admins.add(email);
    if (data.roles?.coordinator || data.roles?.admin) coordinators.add(email);
  };

  const [users, invites] = await Promise.all([
    dataCollection("userAccess").get(),
    dataCollection("accessInvites").get()
  ]);
  users.forEach((doc) => consume(doc.data()));
  invites.forEach((doc) => consume(doc.data()));

  await settingsDoc("roles").set({
    admins: [...admins].sort(),
    coordinators: [...coordinators].sort(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: normalizeEmail(actorEmail),
    sourceApp: "unified-v2-functions"
  }, { merge: true });
}

async function setCustomClaimsForUid(uid, access) {
  if (!uid) return;
  const user = await auth.getUser(uid);
  const current = user.customClaims || {};
  const roles = defaultRoles(access.roles || {});
  const permissions = defaultPermissions(access.permissions || {});

  await auth.setCustomUserClaims(uid, {
    ...current,
    schoolUser: access.active !== false,
    teacher: roles.teacher === true,
    coordinator: roles.coordinator === true,
    admin: roles.admin === true,
    roles,
    permissions
  });
}

async function projectedAdminCount({ targetRefPath, nextRecord }) {
  const existing = new Map();
  const [users, invites] = await Promise.all([
    dataCollection("userAccess").get(),
    dataCollection("accessInvites").get()
  ]);

  users.forEach((doc) => existing.set(doc.ref.path, doc.data()));
  invites.forEach((doc) => existing.set(doc.ref.path, doc.data()));
  existing.set(targetRefPath, nextRecord);

  let count = 0;
  for (const data of existing.values()) {
    if (data?.active !== false && data.roles?.admin === true) count += 1;
  }
  return count;
}

exports.syncUserAccessAfterLogin = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");

  const uid = request.auth.uid;
  const email = normalizeEmail(request.auth.token.email || request.data?.email || "");
  const displayName = String(request.data?.displayName || request.auth.token.name || "");
  if (!email) throw new HttpsError("failed-precondition", "Your Microsoft account did not provide an email.");

  const accessRef = dataDoc("userAccess", uid);
  const existing = await accessRef.get();
  if (existing.exists) return { ok: true, access: { id: uid, ...existing.data() } };

  const inviteRef = dataDoc("accessInvites", emailKey(email));
  const invite = await inviteRef.get();

  let access;
  if (invite.exists) {
    const inviteData = invite.data();
    const normalized = applyRolePermissionDefaults(inviteData.roles || {}, inviteData.permissions || {});
    access = {
      uid,
      email,
      displayName: displayName || inviteData.displayName || "",
      active: inviteData.active !== false,
      roles: normalized.roles,
      permissions: normalized.permissions,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: inviteData.createdBy || "invite",
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "syncUserAccessAfterLogin",
      sourceApp: "unified-v2-functions"
    };
    await accessRef.set(access, { merge: true });
    await inviteRef.delete();
    await setCustomClaimsForUid(uid, access);
    await syncLegacyRoles(email);
    await writeAuditLog({ action: "syncUserAccessAfterLogin", actorEmail: email, targetEmail: email, details: { fromInvite: true } });
    return { ok: true, access: { id: uid, ...access } };
  }

  const rolesSnap = await settingsDoc("roles").get();
  const rolesDoc = rolesSnap.exists ? rolesSnap.data() : { admins: [], coordinators: [] };
  const admins = (rolesDoc.admins || []).map(normalizeEmail);
  const coordinators = (rolesDoc.coordinators || []).map(normalizeEmail);
  const isAdmin = admins.includes(email) || email === FALLBACK_ADMIN_EMAIL;
  const isCoordinator = coordinators.includes(email) || isAdmin;
  const normalized = applyRolePermissionDefaults(
    { teacher: true, coordinator: isCoordinator, admin: isAdmin },
    isAdmin ? adminPermissions() : isCoordinator ? { canApproveReflections: true, canProcessHousePoints: true } : {}
  );

  access = {
    uid,
    email,
    displayName,
    active: true,
    roles: normalized.roles,
    permissions: normalized.permissions,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: isAdmin || isCoordinator ? "legacy-roles" : "self-signin",
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: "syncUserAccessAfterLogin",
    sourceApp: "unified-v2-functions"
  };
  await accessRef.set(access, { merge: true });
  await setCustomClaimsForUid(uid, access);
  await syncLegacyRoles(email);
  return { ok: true, access: { id: uid, ...access } };
});

exports.setUserAccess = onCall({ region: "us-central1" }, async (request) => {
  const caller = await assertPermission(request, "canManageRoles");
  const actorEmail = requestEmail(request);

  const email = normalizeEmail(request.data?.email);
  if (!email || !email.includes("@")) throw new HttpsError("invalid-argument", "A valid email is required.");

  const uid = request.data?.uid || null;
  const displayName = String(request.data?.displayName || "").trim();
  const active = request.data?.active !== false;
  const normalized = applyRolePermissionDefaults(request.data?.roles || {}, request.data?.permissions || {});

  if (actorEmail === email && (!active || normalized.roles.admin !== true)) {
    throw new HttpsError("failed-precondition", "You cannot remove or disable your own admin access.");
  }

  const existingByEmail = await getAccessByEmail(email);
  const targetId = uid || existingByEmail?.id || null;
  const targetRef = targetId ? dataDoc("userAccess", targetId) : dataDoc("accessInvites", emailKey(email));
  const beforeSnap = await targetRef.get();
  const before = beforeSnap.exists ? beforeSnap.data() : null;

  const nextRecord = {
    ...(before || {}),
    ...(targetId ? { uid: targetId } : {}),
    email,
    displayName: displayName || before?.displayName || "",
    active,
    roles: normalized.roles,
    permissions: normalized.permissions,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorEmail,
    sourceApp: "unified-v2-functions"
  };
  if (!before) {
    nextRecord.createdAt = FieldValue.serverTimestamp();
    nextRecord.createdBy = actorEmail;
  }

  const adminCount = await projectedAdminCount({ targetRefPath: targetRef.path, nextRecord });
  if (adminCount < 1) throw new HttpsError("failed-precondition", "At least one active admin must remain.");

  await targetRef.set(nextRecord, { merge: true });
  if (targetId) await setCustomClaimsForUid(targetId, nextRecord);
  await syncLegacyRoles(actorEmail);
  await writeAuditLog({
    action: "setUserAccess",
    actorEmail,
    targetEmail: email,
    before,
    after: { ...nextRecord, updatedAt: null, createdAt: nextRecord.createdAt ? null : undefined }
  });

  return { ok: true, id: targetRef.id, kind: targetId ? "user" : "invite" };
});

exports.processHousePointSubmissions = onCall({ region: "us-central1" }, async (request) => {
  await assertPermission(request, "canProcessHousePoints");
  const actorEmail = requestEmail(request);

  const pendingSnap = await dataCollection("rankings").where("processed", "==", false).get();
  const pending = [];
  pendingSnap.forEach((doc) => pending.push({ id: doc.id, ...doc.data() }));

  const tally = Object.fromEntries(HOUSES.map((id) => [id, 0]));
  for (const submission of pending) {
    for (const [rank, points] of Object.entries(POINTS_BY_RANK)) {
      for (const houseId of getSafeArray(submission.ranks?.[rank])) {
        if (tally[houseId] !== undefined) tally[houseId] += points;
      }
    }
  }

  const batch = db.batch();
  for (const submission of pending) {
    batch.update(dataDoc("rankings", submission.id), {
      processed: true,
      processedAt: FieldValue.serverTimestamp(),
      processedBy: actorEmail
    });
  }
  for (const [houseId, points] of Object.entries(tally)) {
    if (points > 0) {
      batch.set(dataDoc("houseTotals", houseId), { points: FieldValue.increment(points) }, { merge: true });
    }
  }
  await batch.commit();
  await writeAuditLog({ action: "processHousePointSubmissions", actorEmail, details: { count: pending.length, tally } });
  return { ok: true, count: pending.length, tally };
});

exports.resetHouseTotals = onCall({ region: "us-central1" }, async (request) => {
  await assertPermission(request, "canProcessHousePoints");
  const actorEmail = requestEmail(request);
  const batch = db.batch();
  for (const houseId of HOUSES) {
    batch.set(dataDoc("houseTotals", houseId), { points: 0, updatedAt: FieldValue.serverTimestamp(), updatedBy: actorEmail }, { merge: true });
  }
  await batch.commit();
  await writeAuditLog({ action: "resetHouseTotals", actorEmail });
  return { ok: true };
});

exports.approveReflection = onCall({ region: "us-central1" }, async (request) => {
  await assertPermission(request, "canApproveReflections");
  const actorEmail = requestEmail(request);
  const reflectionId = String(request.data?.reflectionId || "");
  if (!reflectionId) throw new HttpsError("invalid-argument", "reflectionId is required.");

  const reflectionRef = dataDoc("active_reflections", reflectionId);
  const snap = await reflectionRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Reflection record not found.");
  const record = snap.data();
  if (record.status === "approved") return { ok: true, alreadyApproved: true };
  if (!HOUSES.includes(record.house)) throw new HttpsError("failed-precondition", "Record has an invalid house.");

  const pointsToDeduct = Number(record.type === "DR" ? 30 : (record.pointDeduction || 3));
  const batch = db.batch();
  batch.set(dataDoc("houseTotals", record.house), { points: FieldValue.increment(-pointsToDeduct) }, { merge: true });
  batch.update(reflectionRef, {
    status: "approved",
    approvedAt: FieldValue.serverTimestamp(),
    approvedBy: actorEmail,
    pointsDeducted: pointsToDeduct
  });
  await batch.commit();
  await writeAuditLog({ action: "approveReflection", actorEmail, targetEmail: record.teacherEmail, details: { reflectionId, house: record.house, pointsToDeduct } });
  return { ok: true, pointsDeducted: pointsToDeduct };
});

exports.deleteReflection = onCall({ region: "us-central1" }, async (request) => {
  await assertPermission(request, "canApproveReflections");
  const actorEmail = requestEmail(request);
  const reflectionId = String(request.data?.reflectionId || "");
  if (!reflectionId) throw new HttpsError("invalid-argument", "reflectionId is required.");

  const reflectionRef = dataDoc("active_reflections", reflectionId);
  const snap = await reflectionRef.get();
  if (!snap.exists) return { ok: true, alreadyDeleted: true };
  const before = snap.data();
  await reflectionRef.delete();
  await writeAuditLog({ action: "deleteReflection", actorEmail, targetEmail: before.teacherEmail, before, details: { reflectionId } });
  return { ok: true };
});
