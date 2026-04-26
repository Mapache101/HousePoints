import { onSnapshot, query, orderBy, limit } from "../firebase.js";
import { col, COLLECTIONS } from "../paths.js";
import { pageHeader, notice } from "../ui/dom.js";
import { escapeHtml, formatDateTime } from "../utils.js";

let unsubscribe = null;

export function renderAudit(ctx) {
  if (!ctx.can("canManageRoles")) {
    ctx.setMain(`${pageHeader("Audit Logs", "Review privileged changes.")}${notice("You need admin access to review audit logs.", "danger")}`);
    return;
  }
  if (unsubscribe) unsubscribe();
  ctx.setMain(`${pageHeader("Audit Logs", "Recent privileged actions written by V2 and Cloud Functions.")}
    <div class="card"><div id="audit-list">Loading...</div></div>`);
  const q = query(col(COLLECTIONS.auditLogs), orderBy("createdAt", "desc"), limit(100));
  unsubscribe = onSnapshot(q, (snapshot) => {
    const rows = [];
    snapshot.forEach((doc) => rows.push({ id: doc.id, ...doc.data() }));
    document.getElementById("audit-list").innerHTML = rows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Action</th><th>Actor</th><th>Target</th><th>Details</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${escapeHtml(formatDateTime(r.createdAt))}</td><td>${escapeHtml(r.action || "")}</td><td>${escapeHtml(r.actorEmail || "")}</td><td>${escapeHtml(r.targetEmail || "")}</td><td><code>${escapeHtml(JSON.stringify(r.details || r.after || {}))}</code></td></tr>`).join("")}</tbody>
    </table></div>` : `<p class="muted">No audit logs yet.</p>`;
  }, (error) => {
    document.getElementById("audit-list").innerHTML = notice(error.message || "Could not load audit logs.", "danger");
  });
  ctx.registerCleanup(() => unsubscribe && unsubscribe());
}
