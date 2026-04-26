import {
  addDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "../firebase.js";
import { col, ref, COLLECTIONS } from "../paths.js";
import { SOURCE_APP, SCHEMA_VERSION, GRADES } from "../config.js";
import { normalizeGrade, sortGrades, studentName } from "../utils.js";

function normalizeStudent(docSnap) {
  const data = docSnap.data();
  const name = studentName(data).trim();
  return {
    id: docSnap.id,
    ...data,
    name: data.name || name,
    displayName: data.displayName || name.toUpperCase(),
    grade: normalizeGrade(data.grade),
    house: data.house || ""
  };
}

export function listenStudents(callback) {
  const emitSnapshot = (snapshot) => {
    const rows = [];
    snapshot.forEach((docSnap) => rows.push(normalizeStudent(docSnap)));
    rows.sort((a, b) => studentName(a).localeCompare(studentName(b)));
    callback(rows);
  };

  try {
    const q = query(col(COLLECTIONS.students), orderBy("name"));
    return onSnapshot(q, emitSnapshot, () => onSnapshot(col(COLLECTIONS.students), emitSnapshot));
  } catch {
    return onSnapshot(col(COLLECTIONS.students), emitSnapshot);
  }
}

export function deriveGradeOptions(students = []) {
  const grades = sortGrades(students.map((s) => s.grade));
  return grades.length ? grades : GRADES;
}

export async function saveStudent({ id = null, name, grade, house, actorEmail }) {
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Student name is required.");
  if (!grade) throw new Error("Grade is required.");
  if (!house) throw new Error("House is required.");

  const data = {
    name: cleanName,
    displayName: cleanName.toUpperCase(),
    grade: normalizeGrade(grade),
    house,
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
    sourceApp: SOURCE_APP,
    schemaVersion: SCHEMA_VERSION
  };

  if (id) {
    await setDoc(ref(COLLECTIONS.students, id), data, { merge: true });
    return id;
  }

  const created = await addDoc(col(COLLECTIONS.students), {
    ...data,
    createdAt: serverTimestamp(),
    createdBy: actorEmail
  });
  return created.id;
}

export async function deleteStudent(id) {
  return deleteDoc(ref(COLLECTIONS.students, id));
}

export async function bulkImportStudents({ students, actorEmail }) {
  const ids = [];
  for (const student of students) {
    if (!student.name && !student.displayName) continue;
    if (!student.grade || !student.house) continue;
    ids.push(await saveStudent({
      name: student.name || student.displayName,
      grade: student.grade,
      house: student.house,
      actorEmail
    }));
  }
  return ids;
}
