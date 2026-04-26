import { addDoc, deleteDoc, onSnapshot, query, serverTimestamp } from "../firebase.js";
import { col, ref, COLLECTIONS } from "../paths.js";
import { SOURCE_APP, SCHEMA_VERSION } from "../config.js";

export function listenScheduledTests(callback) {
  const q = query(col(COLLECTIONS.scheduledTests));
  return onSnapshot(q, (snapshot) => {
    const rows = [];
    snapshot.forEach((docSnap) => rows.push({ id: docSnap.id, ...docSnap.data() }));
    rows.sort((a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`));
    callback(rows);
  });
}

export async function addScheduledTest({ user, title, date, time, teacher, className }) {
  const created = await addDoc(col(COLLECTIONS.scheduledTests), {
    title: title.trim(),
    date,
    time,
    teacher: teacher || user.email.split("@")[0].toUpperCase(),
    class: className,
    teacherEmail: user.email,
    timestamp: serverTimestamp(),
    sourceApp: SOURCE_APP,
    schemaVersion: SCHEMA_VERSION
  });
  return created.id;
}

export async function deleteScheduledTest(id) {
  return deleteDoc(ref(COLLECTIONS.scheduledTests, id));
}
