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
import { SOURCE_APP, SCHEMA_VERSION } from "../config.js";

export function listenStudents(callback) {
  const q = query(col(COLLECTIONS.students), orderBy("name"));
  return onSnapshot(q, (snapshot) => {
    const rows = [];
    snapshot.forEach((docSnap) => rows.push({ id: docSnap.id, ...docSnap.data() }));
    rows.sort((a, b) => (a.name || a.displayName || "").localeCompare(b.name || b.displayName || ""));
    callback(rows);
  }, () => {
    return onSnapshot(col(COLLECTIONS.students), (snapshot) => {
      const rows = [];
      snapshot.forEach((docSnap) => rows.push({ id: docSnap.id, ...docSnap.data() }));
      rows.sort((a, b) => (a.name || a.displayName || "").localeCompare(b.name || b.displayName || ""));
      callback(rows);
    });
  });
}

export async function saveStudent({ id = null, name, grade, house, actorEmail }) {
  const data = {
    name: name.trim(),
    displayName: name.trim(),
    grade,
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
    if (!student.name || !student.grade || !student.house) continue;
    ids.push(await saveStudent({
      name: student.name,
      grade: student.grade,
      house: student.house,
      actorEmail
    }));
  }
  return ids;
}
