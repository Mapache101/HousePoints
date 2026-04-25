import { onSnapshot } from "../firebase.js";
import { col, COLLECTIONS } from "../paths.js";
import { listenHouseTotals } from "../services/house-service.js";
import { HOUSES } from "../config.js";
import { pageHeader } from "../ui/dom.js";
import { escapeHtml, formatDateTime, houseById } from "../utils.js";

let unsubs = [];
let totals = {};
let reflections = [];

function stop() {
  unsubs.forEach((fn) => fn && fn());
  unsubs = [];
}

function draw() {
  const target = document.getElementById("reports-content");
  if (!target) return;
  const pending = reflections.filter((r) => (r.status || "pending") === "pending").length;
  const approved = reflections.filter((r) => r.status === "approved").length;
  const drs = reflections.filter((r) => r.type === "DR").length;
  const byHouse = Object.fromEntries(HOUSES.map((h) => [h.id, 0]));
  reflections.forEach((r) => { if (byHouse[r.house] !== undefined) byHouse[r.house] += 1; });

  target.innerHTML = `<div class="grid cols-4">
    <div class="card"><div class="muted small">Pending AR/DR</div><div class="kpi">${pending}</div></div>
    <div class="card"><div class="muted small">Approved AR/DR</div><div class="kpi">${approved}</div></div>
    <div class="card"><div class="muted small">DR count</div><div class="kpi">${drs}</div></div>
    <div class="card"><div class="muted small">Total records</div><div class="kpi">${reflections.length}</div></div>
  </div>
  <div class="grid cols-2 mt-4">
    <div class="card"><h2>House totals</h2>${HOUSES.map((h) => `<p><strong style="color:${h.color}">${escapeHtml(h.name)}:</strong> ${Number(totals[h.id] || 0).toLocaleString()} points</p>`).join("")}</div>
    <div class="card"><h2>AR/DR by house</h2>${HOUSES.map((h) => `<p><strong>${escapeHtml(h.name)}:</strong> ${byHouse[h.id]}</p>`).join("")}</div>
  </div>
  <div class="card mt-4"><h2>Recent AR/DR records</h2>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Student</th><th>Type</th><th>House</th><th>Status</th></tr></thead><tbody>
      ${reflections.slice(0, 25).map((r) => `<tr><td>${escapeHtml(formatDateTime(r.timestamp))}</td><td>${escapeHtml(r.studentName || "")}</td><td>${escapeHtml(r.type || "AR")}</td><td>${escapeHtml(houseById(r.house).name)}</td><td>${escapeHtml(r.status || "pending")}</td></tr>`).join("")}
    </tbody></table></div>
  </div>`;
}

export function renderReports(ctx) {
  stop();
  ctx.setMain(`${pageHeader("Reports", "Quick analytics from existing Firestore collections.")}
    <div id="reports-content">Loading...</div>`);
  unsubs.push(listenHouseTotals((t) => { totals = t; draw(); }));
  unsubs.push(onSnapshot(col(COLLECTIONS.activeReflections), (snapshot) => {
    reflections = [];
    snapshot.forEach((doc) => reflections.push({ id: doc.id, ...doc.data() }));
    reflections.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    draw();
  }));
  ctx.registerCleanup(stop);
}
