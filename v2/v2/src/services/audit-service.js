import { addDoc, serverTimestamp } from "../firebase.js";
import { col, COLLECTIONS } from "../paths.js";

export async function writeAuditLog({ action, actorEmail, targetEmail = null, before = null, after = null, details = null }) {
  return addDoc(col(COLLECTIONS.auditLogs), {
    action,
    actorEmail: actorEmail || "unknown",
    targetEmail,
    before,
    after,
    details,
    createdAt: serverTimestamp(),
    sourceApp: "unified-v2"
  });
}
