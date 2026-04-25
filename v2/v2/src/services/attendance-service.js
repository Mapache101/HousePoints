import { addDoc, onSnapshot, query, where, serverTimestamp } from "../firebase.js";
import { col, COLLECTIONS } from "../paths.js";
import { SOURCE_APP, SCHEMA_VERSION } from "../config.js";

export function listenAttendance({ user, canViewAll }, callback) {
  const q = canViewAll
    ? col(COLLECTIONS.attendance)
    : query(col(COLLECTIONS.attendance), where("teacherEmail", "==", user.email));

  return onSnapshot(q, (snapshot) => {
    const rows = [];
    snapshot.forEach((docSnap) => rows.push({ id: docSnap.id, ...docSnap.data() }));
    rows.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    callback(rows);
  });
}

export async function submitAttendance({ user, selectedClass, records }) {
  const presentCount = records.filter((r) => r.status === "P").length;
  const lateCount = records.filter((r) => r.status === "L").length;
  const absentCount = records.filter((r) => r.status === "A").length;

  const created = await addDoc(col(COLLECTIONS.attendance), {
    class: selectedClass,
    teacherEmail: user.email,
    timestamp: serverTimestamp(),
    records,
    presentCount,
    lateCount,
    absentCount,
    sourceApp: SOURCE_APP,
    schemaVersion: SCHEMA_VERSION
  });
  return created.id;
}
