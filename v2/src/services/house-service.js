import {
  addDoc,
  deleteDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  writeBatch,
  increment,
  httpsCallable
} from "../firebase.js";
import { db, functions } from "../firebase.js";
import { col, ref, COLLECTIONS } from "../paths.js";
import { HOUSES, POINTS_BY_RANK, SOURCE_APP, SCHEMA_VERSION, shouldUseFunctions } from "../config.js";
import { getSafeArray, normalizeEmail, timestampMillis } from "../utils.js";
import { writeAuditLog } from "./audit-service.js";

function sortRankings(rows) {
  rows.sort((a, b) => timestampMillis(b.timestamp) - timestampMillis(a.timestamp));
  return rows;
}

function shouldFallback(error) {
  if (localStorage.getItem("scisDisableFunctionFallback") === "true") return false;
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return code.includes("not-found") || code.includes("unimplemented") || code.includes("internal") || message.includes("not found") || message.includes("not deployed");
}

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
    month: String(month || "").trim(),
    ranks,
    timestamp: serverTimestamp(),
    processed: false,
    sourceApp: SOURCE_APP,
    schemaVersion: SCHEMA_VERSION
  };

  if (!data.month) throw new Error("Month or event label is required.");

  if (editingId) {
    await updateDoc(ref(COLLECTIONS.rankings, editingId), {
      month: data.month,
      ranks: data.ranks,
      timestamp: serverTimestamp(),
      sourceApp: SOURCE_APP,
      schemaVersion: SCHEMA_VERSION
    });
    return editingId;
  }

  const created = await addDoc(col(COLLECTIONS.rankings), data);
  return created.id;
}

export function listenMyPendingRankings(user, callback) {
  const q = query(col(COLLECTIONS.rankings), where("teacherEmail", "==", user.email));
  return onSnapshot(q, (snapshot) => {
    const rows = [];
    snapshot.forEach((docSnap) => {
      const data = { id: docSnap.id, ...docSnap.data() };
      if (!data.processed) rows.push(data);
    });
    callback(sortRankings(rows));
  });
}

export function listenAllRankings(callback) {
  return onSnapshot(col(COLLECTIONS.rankings), (snapshot) => {
    const rows = [];
    snapshot.forEach((docSnap) => rows.push({ id: docSnap.id, ...docSnap.data() }));
    callback(sortRankings(rows));
  });
}

export async function deleteRanking(id) {
  await deleteDoc(ref(COLLECTIONS.rankings, id));
}

function calculateTally(rankings) {
  const tally = Object.fromEntries(HOUSES.map((h) => [h.id, 0]));
  for (const submission of rankings) {
    for (const [rank, points] of Object.entries(POINTS_BY_RANK)) {
      for (const houseId of getSafeArray(submission.ranks?.[rank])) {
        if (tally[houseId] !== undefined) tally[houseId] += points;
      }
    }
  }
  return tally;
}

async function processPendingRankingsClientSide({ actorEmail }) {
  const snapshot = await getDocs(query(col(COLLECTIONS.rankings), where("processed", "==", false)));
  const pending = [];
  snapshot.forEach((docSnap) => pending.push({ id: docSnap.id, ...docSnap.data() }));
  const tally = calculateTally(pending);

  const batch = writeBatch(db);
  for (const submission of pending) {
    batch.update(ref(COLLECTIONS.rankings, submission.id), {
      processed: true,
      processedAt: serverTimestamp(),
      processedBy: normalizeEmail(actorEmail),
      sourceApp: SOURCE_APP,
      schemaVersion: SCHEMA_VERSION
    });
  }
  for (const [houseId, points] of Object.entries(tally)) {
    if (points > 0) {
      batch.set(ref(COLLECTIONS.houseTotals, houseId), {
        points: increment(points),
        updatedAt: serverTimestamp(),
        updatedBy: normalizeEmail(actorEmail)
      }, { merge: true });
    }
  }
  await batch.commit();
  await writeAuditLog({ action: "processHousePointSubmissions", actorEmail, details: { count: pending.length, tally } });
  return { ok: true, count: pending.length, tally, mode: "clientFallback" };
}

export async function processPendingRankings({ actorEmail }) {
  if (shouldUseFunctions()) {
    try {
      const callable = httpsCallable(functions, "processHousePointSubmissions");
      return (await callable({})).data;
    } catch (error) {
      if (!shouldFallback(error)) throw error;
      console.warn("Falling back to client-side point processing for testing.", error);
    }
  }
  return processPendingRankingsClientSide({ actorEmail });
}

async function resetHouseTotalsClientSide({ actorEmail }) {
  const batch = writeBatch(db);
  for (const house of HOUSES) {
    batch.set(ref(COLLECTIONS.houseTotals, house.id), {
      points: 0,
      updatedAt: serverTimestamp(),
      updatedBy: normalizeEmail(actorEmail)
    }, { merge: true });
  }
  await batch.commit();
  await writeAuditLog({ action: "resetHouseTotals", actorEmail });
  return { ok: true, mode: "clientFallback" };
}

export async function resetHouseTotals({ actorEmail }) {
  if (shouldUseFunctions()) {
    try {
      const callable = httpsCallable(functions, "resetHouseTotals");
      return (await callable({})).data;
    } catch (error) {
      if (!shouldFallback(error)) throw error;
      console.warn("Falling back to client-side reset for testing.", error);
    }
  }
  return resetHouseTotalsClientSide({ actorEmail });
}

export async function ensureHouseTotals() {
  await Promise.all(HOUSES.map((house) => setDoc(ref(COLLECTIONS.houseTotals, house.id), { points: 0 }, { merge: true })));
}
