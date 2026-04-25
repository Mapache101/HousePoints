import {
  addDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  writeBatch,
  increment,
  httpsCallable
} from "../firebase.js";
import { functions } from "../firebase.js";
import { col, ref, COLLECTIONS } from "../paths.js";
import { HOUSES, POINTS_BY_RANK, SOURCE_APP, SCHEMA_VERSION, shouldUseFunctions } from "../config.js";
import { getSafeArray, normalizeEmail } from "../utils.js";
import { writeAuditLog } from "./audit-service.js";

export function listenHouseTotals(callback) {
  return onSnapshot(col(COLLECTIONS.houseTotals), (snapshot) => {
    const totals = Object.fromEntries(HOUSES.map((h) => [h.id, 0]));
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      totals[docSnap.id] = typeof data.points === "number" ? data.points : (data.score || 0);
    });
    callback(totals);
  });
}

export async function submitRanking({ user, month, ranks, editingId = null }) {
  const data = {
    teacherEmail: user.email,
    month: month.trim(),
    ranks,
    timestamp: serverTimestamp(),
    processed: false,
    sourceApp: SOURCE_APP,
    schemaVersion: SCHEMA_VERSION
  };

  if (editingId) {
    const batch = writeBatch(await import("../firebase.js").then((m) => m.db));
    batch.set(ref(COLLECTIONS.rankings, editingId), data, { merge: true });
    await batch.commit();
    return editingId;
  }

  const created = await addDoc(col(COLLECTIONS.rankings), data);
  return created.id;
}

export function listenMyPendingRankings(user, callback) {
  const q = query(col(COLLECTIONS.rankings), where("teacherEmail", "==", user.email), where("processed", "==", false));
  return onSnapshot(q, (snapshot) => {
    const rows = [];
    snapshot.forEach((docSnap) => rows.push({ id: docSnap.id, ...docSnap.data() }));
    rows.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    callback(rows);
  });
}

export function listenAllRankings(callback) {
  return onSnapshot(col(COLLECTIONS.rankings), (snapshot) => {
    const rows = [];
    snapshot.forEach((docSnap) => rows.push({ id: docSnap.id, ...docSnap.data() }));
    rows.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    callback(rows);
  });
}

export async function deleteRanking(id) {
  await deleteDoc(ref(COLLECTIONS.rankings, id));
}

export async function processPendingRankings({ actorEmail }) {
  if (shouldUseFunctions()) {
    const callable = httpsCallable(functions, "processHousePointSubmissions");
    return (await callable({})).data;
  }

  const snapshot = await getDocs(query(col(COLLECTIONS.rankings), where("processed", "==", false)));
  const pending = [];
  snapshot.forEach((docSnap) => pending.push({ id: docSnap.id, ...docSnap.data() }));

  const tally = Object.fromEntries(HOUSES.map((h) => [h.id, 0]));
  for (const submission of pending) {
    for (const [rank, points] of Object.entries(POINTS_BY_RANK)) {
      for (const houseId of getSafeArray(submission.ranks?.[rank])) {
        if (tally[houseId] !== undefined) tally[houseId] += points;
      }
    }
  }

  const batch = writeBatch(await import("../firebase.js").then((m) => m.db));
  for (const submission of pending) {
    batch.update(ref(COLLECTIONS.rankings, submission.id), {
      processed: true,
      processedAt: serverTimestamp(),
      processedBy: normalizeEmail(actorEmail)
    });
  }
  for (const [houseId, points] of Object.entries(tally)) {
    if (points > 0) batch.set(ref(COLLECTIONS.houseTotals, houseId), { points: increment(points) }, { merge: true });
  }
  await batch.commit();
  await writeAuditLog({ action: "processHousePointSubmissions", actorEmail, details: { count: pending.length, tally } });
  return { ok: true, count: pending.length, tally, mode: "clientFallback" };
}

export async function resetHouseTotals({ actorEmail }) {
  if (shouldUseFunctions()) {
    const callable = httpsCallable(functions, "resetHouseTotals");
    return (await callable({})).data;
  }

  const batch = writeBatch(await import("../firebase.js").then((m) => m.db));
  for (const house of HOUSES) {
    batch.set(ref(COLLECTIONS.houseTotals, house.id), { points: 0 }, { merge: true });
  }
  await batch.commit();
  await writeAuditLog({ action: "resetHouseTotals", actorEmail });
  return { ok: true, mode: "clientFallback" };
}
