import {
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  httpsCallable
} from "../firebase.js";
import { functions } from "../firebase.js";
import { col, ref, settingsRef, COLLECTIONS } from "../paths.js";
import { shouldUseFunctions, FALLBACK_ADMIN_EMAIL } from "../config.js";
import {
  normalizeEmail,
  emailKey,
  buildAccessDoc,
  adminPermissions,
  defaultRoles,
  defaultPermissions,
  isFallbackAdmin
} from "../utils.js";
import { writeAuditLog } from "./audit-service.js";

function shouldFallback(error) {
  if (localStorage.getItem("scisDisableFunctionFallback") === "true") return false;
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return code.includes("not-found") || code.includes("unimplemented") || code.includes("internal") || message.includes("not found") || message.includes("not deployed");
}

export function listenCurrentAccess(user, callback) {
  if (!user) {
    callback(null);
    return () => {};
  }

  const accessRef = ref(COLLECTIONS.userAccess, user.uid);
  let triedSync = false;

  const unsubscribe = onSnapshot(accessRef, async (snapshot) => {
    if (snapshot.exists()) {
      callback({ id: snapshot.id, ...snapshot.data() });
      return;
    }

    if (!triedSync) {
      triedSync = true;
      try {
        const access = await syncUserAccessAfterLogin(user);
        callback(access);
        return;
      } catch (error) {
        console.warn("Access sync failed", error);
      }
    }

    const fallback = await getLegacyFallbackAccess(user);
    callback(fallback);
  }, async (error) => {
    console.warn("Could not listen to user access", error);
    const fallback = await getLegacyFallbackAccess(user);
    callback(fallback);
  });

  return unsubscribe;
}

export async function syncUserAccessAfterLogin(user) {
  if (!shouldUseFunctions()) {
    return clientSideSyncUserAccess(user);
  }
  try {
    const callable = httpsCallable(functions, "syncUserAccessAfterLogin");
    const result = await callable({
      email: normalizeEmail(user.email),
      displayName: user.displayName || ""
    });
    return result.data?.access || null;
  } catch (error) {
    if (!shouldFallback(error)) throw error;
    console.warn("Falling back to client-side access sync for testing.", error);
    return clientSideSyncUserAccess(user);
  }
}

async function clientSideSyncUserAccess(user) {
  const normalized = normalizeEmail(user.email);
  const userRef = ref(COLLECTIONS.userAccess, user.uid);
  const existing = await getDoc(userRef);
  if (existing.exists()) return { id: existing.id, ...existing.data() };

  const inviteRef = ref(COLLECTIONS.accessInvites, emailKey(normalized));
  const invite = await getDoc(inviteRef);
  if (invite.exists()) {
    const inviteData = invite.data();
    const access = {
      uid: user.uid,
      email: normalized,
      displayName: user.displayName || inviteData.displayName || "",
      active: inviteData.active !== false,
      roles: defaultRoles(inviteData.roles || {}),
      permissions: defaultPermissions(inviteData.permissions || {}),
      createdAt: serverTimestamp(),
      createdBy: inviteData.createdBy || "invite",
      updatedAt: serverTimestamp(),
      updatedBy: "syncUserAccessAfterLogin",
      sourceApp: "unified-v2"
    };
    await setDoc(userRef, access, { merge: true });
    return { id: user.uid, ...access };
  }

  const fallback = await getLegacyFallbackAccess(user);
  if (fallback?.roles?.admin || fallback?.roles?.coordinator) {
    await setDoc(userRef, fallback, { merge: true });
  }
  return fallback;
}

export async function getLegacyFallbackAccess(user) {
  if (!user?.email) return null;
  const normalized = normalizeEmail(user.email);
  const rolesSnapshot = await getDoc(settingsRef("roles")).catch(() => null);
  const rolesData = rolesSnapshot?.exists() ? rolesSnapshot.data() : { admins: [], coordinators: [] };
  const admins = (rolesData.admins || []).map(normalizeEmail);
  const coordinators = (rolesData.coordinators || []).map(normalizeEmail);

  const isAdmin = admins.includes(normalized) || isFallbackAdmin(user);
  const isCoordinator = coordinators.includes(normalized) || isAdmin;

  if (!isAdmin && !isCoordinator) {
    return {
      uid: user.uid,
      email: normalized,
      displayName: user.displayName || "",
      active: true,
      roles: defaultRoles({ teacher: true }),
      permissions: defaultPermissions(),
      legacyOnly: true
    };
  }

  const roles = defaultRoles({ teacher: true, coordinator: isCoordinator, admin: isAdmin });
  const permissions = isAdmin ? adminPermissions() : defaultPermissions({
    canApproveReflections: true,
    canProcessHousePoints: true
  });

  return {
    uid: user.uid,
    email: normalized,
    displayName: user.displayName || "",
    active: true,
    roles,
    permissions,
    legacyFallback: true
  };
}

export function listenAccessDirectory(callback) {
  const accessItems = new Map();
  const inviteItems = new Map();

  const emit = () => {
    callback({
      users: [...accessItems.values()].sort((a, b) => (a.email || "").localeCompare(b.email || "")),
      invites: [...inviteItems.values()].sort((a, b) => (a.email || "").localeCompare(b.email || ""))
    });
  };

  const unsubAccess = onSnapshot(col(COLLECTIONS.userAccess), (snapshot) => {
    accessItems.clear();
    snapshot.forEach((docSnap) => accessItems.set(docSnap.id, { id: docSnap.id, kind: "user", ...docSnap.data() }));
    emit();
  });

  const unsubInvites = onSnapshot(col(COLLECTIONS.accessInvites), (snapshot) => {
    inviteItems.clear();
    snapshot.forEach((docSnap) => inviteItems.set(docSnap.id, { id: docSnap.id, kind: "invite", ...docSnap.data() }));
    emit();
  });

  return () => {
    unsubAccess();
    unsubInvites();
  };
}

export async function findAccessByEmail(email) {
  const normalized = normalizeEmail(email);
  const q = query(col(COLLECTIONS.userAccess), where("email", "==", normalized));
  const snapshot = await getDocs(q);
  const users = [];
  snapshot.forEach((docSnap) => users.push({ id: docSnap.id, ...docSnap.data() }));
  return users[0] || null;
}

export async function saveAccessRecord({ actor, targetEmail, uid = null, displayName = "", roles = {}, permissions = {}, active = true }) {
  const normalized = normalizeEmail(targetEmail);
  if (!normalized) throw new Error("Email is required.");

  const payload = {
    uid,
    email: normalized,
    displayName,
    roles: defaultRoles(roles),
    permissions: defaultPermissions(permissions),
    active
  };

  if (payload.roles.admin) {
    payload.roles.coordinator = true;
    payload.roles.teacher = true;
    payload.permissions = adminPermissions();
  }

  if (payload.roles.coordinator) {
    payload.permissions.canApproveReflections = true;
    payload.permissions.canProcessHousePoints = true;
  }

  if (shouldUseFunctions()) {
    try {
      const callable = httpsCallable(functions, "setUserAccess");
      const result = await callable(payload);
      return result.data;
    } catch (error) {
      if (!shouldFallback(error)) throw error;
      console.warn("Falling back to client-side access save for testing.", error);
    }
  }

  return clientSideSaveAccessRecord({ actor, payload });
}

async function clientSideSaveAccessRecord({ actor, payload }) {
  const actorEmail = normalizeEmail(actor?.email || "unknown");
  const existing = payload.uid ? { id: payload.uid } : await findAccessByEmail(payload.email);
  const targetRef = existing?.id
    ? ref(COLLECTIONS.userAccess, existing.id)
    : ref(COLLECTIONS.accessInvites, emailKey(payload.email));

  const beforeSnap = await getDoc(targetRef).catch(() => null);
  const before = beforeSnap?.exists() ? beforeSnap.data() : null;

  const nowFields = {
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
    sourceApp: "unified-v2"
  };

  const record = {
    ...(before || {}),
    ...(payload.uid ? { uid: payload.uid } : {}),
    email: payload.email,
    displayName: payload.displayName || before?.displayName || "",
    active: payload.active !== false,
    roles: payload.roles,
    permissions: payload.permissions,
    ...nowFields
  };

  if (!before) {
    record.createdAt = serverTimestamp();
    record.createdBy = actorEmail;
  }

  await setDoc(targetRef, record, { merge: true });
  await syncLegacyRolesClientSide(actorEmail);
  await writeAuditLog({ action: "saveAccessRecord", actorEmail, targetEmail: payload.email, before, after: payload });
  return { ok: true, id: targetRef.id, mode: "clientFallback" };
}

export async function syncLegacyRolesClientSide(actorEmail = "system") {
  const usersSnap = await getDocs(col(COLLECTIONS.userAccess));
  const invitesSnap = await getDocs(col(COLLECTIONS.accessInvites));
  const admins = new Set([normalizeEmail(FALLBACK_ADMIN_EMAIL)]);
  const coordinators = new Set();

  const consume = (data) => {
    if (!data?.email || data.active === false) return;
    const email = normalizeEmail(data.email);
    if (data.roles?.admin) admins.add(email);
    if (data.roles?.coordinator || data.roles?.admin) coordinators.add(email);
  };

  usersSnap.forEach((docSnap) => consume(docSnap.data()));
  invitesSnap.forEach((docSnap) => consume(docSnap.data()));

  await setDoc(settingsRef("roles"), {
    admins: [...admins].sort(),
    coordinators: [...coordinators].sort(),
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
    sourceApp: "unified-v2"
  }, { merge: true });
}
