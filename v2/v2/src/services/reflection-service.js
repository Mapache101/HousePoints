import {
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  setDoc,
  updateDoc,
  increment,
  httpsCallable
} from "../firebase.js";
import { functions } from "../firebase.js";
import { col, ref, COLLECTIONS } from "../paths.js";
import { SOURCE_APP, SCHEMA_VERSION, shouldUseFunctions } from "../config.js";
import { normalizeEmail } from "../utils.js";
import { writeAuditLog } from "./audit-service.js";

export function listenReflections({ user, canViewAll }, callback) {
  const q = canViewAll
    ? col(COLLECTIONS.activeReflections)
    : query(col(COLLECTIONS.activeReflections), where("teacherEmail", "==", user.email));

  return onSnapshot(q, (snapshot) => {
    const rows = [];
    snapshot.forEach((docSnap) => rows.push({ id: docSnap.id, ...docSnap.data() }));
    rows.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    callback(rows);
  });
}

export async function submitReflection({ user, type, student, manualStudent, reason, customReason, subject, pointDeduction }) {
  const source = student || {};
  const studentName = source.name || source.displayName || manualStudent.studentName || "Unknown student";
  const grade = source.grade || manualStudent.grade || "";
  const house = source.house || manualStudent.house || "";

  const data = {
    type,
    studentId: source.id || null,
    studentName,
    grade,
    house,
    reason,
    customReason: reason === "Other - Otro" ? customReason || "" : null,
    subject,
    teacherEmail: user.email,
    timestamp: serverTimestamp(),
    status: "pending",
    pointDeduction: type === "DR" ? 30 : Number(pointDeduction || 3),
    sourceApp: SOURCE_APP,
    schemaVersion: SCHEMA_VERSION
  };

  const created = await addDoc(col(COLLECTIONS.activeReflections), data);
  return created.id;
}

export async function approveReflection({ record, actorEmail }) {
  if (shouldUseFunctions()) {
    const callable = httpsCallable(functions, "approveReflection");
    return (await callable({ reflectionId: record.id })).data;
  }

  const pointsToDeduct = Number(record.type === "DR" ? 30 : (record.pointDeduction || 3));
  await setDoc(ref(COLLECTIONS.houseTotals, record.house), {
    points: increment(-pointsToDeduct)
  }, { merge: true });
  await updateDoc(ref(COLLECTIONS.activeReflections, record.id), {
    status: "approved",
    approvedAt: serverTimestamp(),
    approvedBy: normalizeEmail(actorEmail),
    pointsDeducted: pointsToDeduct
  });
  await writeAuditLog({ action: "approveReflection", actorEmail, targetEmail: record.teacherEmail, details: { reflectionId: record.id, pointsToDeduct } });
  return { ok: true, pointsDeducted: pointsToDeduct, mode: "clientFallback" };
}

export async function deleteReflection({ record, actorEmail }) {
  if (shouldUseFunctions()) {
    const callable = httpsCallable(functions, "deleteReflection");
    return (await callable({ reflectionId: record.id })).data;
  }

  await deleteDoc(ref(COLLECTIONS.activeReflections, record.id));
  await writeAuditLog({ action: "deleteReflection", actorEmail, targetEmail: record.teacherEmail, details: { reflectionId: record.id } });
  return { ok: true, mode: "clientFallback" };
}
