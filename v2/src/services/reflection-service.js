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
import { normalizeEmail, normalizeGrade, studentName, timestampMillis } from "../utils.js";
import { writeAuditLog } from "./audit-service.js";

function sortRecords(rows) {
  rows.sort((a, b) => timestampMillis(b.timestamp) - timestampMillis(a.timestamp));
  return rows;
}

function shouldFallback(error) {
  if (localStorage.getItem("scisDisableFunctionFallback") === "true") return false;
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return code.includes("not-found") || code.includes("unimplemented") || code.includes("internal") || message.includes("not found") || message.includes("not deployed");
}

export function listenReflections({ user, canViewAll }, callback) {
  const q = canViewAll
    ? col(COLLECTIONS.activeReflections)
    : query(col(COLLECTIONS.activeReflections), where("teacherEmail", "==", user.email));

  return onSnapshot(q, (snapshot) => {
    const rows = [];
    snapshot.forEach((docSnap) => rows.push({ id: docSnap.id, ...docSnap.data() }));
    callback(sortRecords(rows));
  });
}

export async function submitReflection({ user, type, student, manualStudent, reason, customReason, subject, pointDeduction }) {
  const source = student || {};
  const cleanType = type === "DR" ? "DR" : "AR";
  const studentDisplayName = studentName(source) || manualStudent.studentName || "Unknown student";
  const grade = normalizeGrade(source.grade || manualStudent.grade || "");
  const house = source.house || manualStudent.house || "";
  if (!studentDisplayName || !grade || !house) throw new Error("Choose a student or fill student name, grade, and house.");
  if (!reason) throw new Error("Reason is required.");
  if (!subject) throw new Error("Subject is required.");

  const data = {
    type: cleanType,
    studentId: source.id || null,
    studentName: studentDisplayName,
    grade,
    house,
    reason,
    customReason: reason === "Other - Otro" ? customReason || "" : null,
    subject,
    teacherEmail: user.email,
    timestamp: serverTimestamp(),
    status: "pending",
    pointDeduction: cleanType === "DR" ? 30 : Number(pointDeduction || 3),
    sourceApp: SOURCE_APP,
    schemaVersion: SCHEMA_VERSION
  };

  const created = await addDoc(col(COLLECTIONS.activeReflections), data);
  return created.id;
}

async function approveReflectionClientSide({ record, actorEmail }) {
  const pointsToDeduct = Number(record.type === "DR" ? 30 : (record.pointDeduction || record.pointsDeducted || 3));
  await setDoc(ref(COLLECTIONS.houseTotals, record.house), {
    points: increment(-pointsToDeduct),
    updatedAt: serverTimestamp(),
    updatedBy: normalizeEmail(actorEmail)
  }, { merge: true });
  await updateDoc(ref(COLLECTIONS.activeReflections, record.id), {
    status: "approved",
    approvedAt: serverTimestamp(),
    approvedBy: normalizeEmail(actorEmail),
    pointsDeducted: pointsToDeduct,
    sourceApp: SOURCE_APP,
    schemaVersion: SCHEMA_VERSION
  });
  await writeAuditLog({ action: "approveReflection", actorEmail, targetEmail: record.teacherEmail, details: { reflectionId: record.id, pointsToDeduct } });
  return { ok: true, pointsDeducted: pointsToDeduct, mode: "clientFallback" };
}

export async function approveReflection({ record, actorEmail }) {
  if (shouldUseFunctions()) {
    try {
      const callable = httpsCallable(functions, "approveReflection");
      return (await callable({ reflectionId: record.id })).data;
    } catch (error) {
      if (!shouldFallback(error)) throw error;
      console.warn("Falling back to client-side AR/DR approval for testing.", error);
    }
  }
  return approveReflectionClientSide({ record, actorEmail });
}

async function deleteReflectionClientSide({ record, actorEmail }) {
  await deleteDoc(ref(COLLECTIONS.activeReflections, record.id));
  await writeAuditLog({ action: "deleteReflection", actorEmail, targetEmail: record.teacherEmail, details: { reflectionId: record.id } });
  return { ok: true, mode: "clientFallback" };
}

export async function deleteReflection({ record, actorEmail }) {
  if (shouldUseFunctions()) {
    try {
      const callable = httpsCallable(functions, "deleteReflection");
      return (await callable({ reflectionId: record.id })).data;
    } catch (error) {
      if (!shouldFallback(error)) throw error;
      console.warn("Falling back to client-side AR/DR deletion for testing.", error);
    }
  }
  return deleteReflectionClientSide({ record, actorEmail });
}
