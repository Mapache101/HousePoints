import { onSnapshot } from "../firebase.js";
import { col, COLLECTIONS } from "../paths.js";
import { listenHouseTotals } from "../services/house-service.js";
import { HOUSES } from "../config.js";
import { pageHeader } from "../ui/dom.js";
import { escapeHtml, formatDateTime, houseById, normalizeGrade, countBy, topEntries, downloadCsv, timestampMillis } from "../utils.js";

let unsubs = [];
let totals = {};
let reflections = [];
let reportFilter = { status: "all", type: "all", grade: "all", search: "" };

function stop() {
  unsubs.forEach((fn) => fn && fn());
  unsubs = [];
}

function filters() {
  return reportFilter;
}

function gradeOptions() {
  return [...new Set(reflections.map((r) => normalizeGrade(r.grade)).filter(Boolean))].sort();
}

function filteredReflections() {
  const filter = filters();
  let rows = [...reflections];
  if (filter.status !== "all") rows = rows.filter((r) => (r.status || "pending") === filter.status);
  if (filter.type !== "all") rows = rows.filter((r) => (r.type || "AR") === filter.type);
  if (filter.grade !== "all") rows = rows.filter((r) => normalizeGrade(r.grade) === normalizeGrade(filter.grade));
  if (filter.search) rows = rows.filter((r) => `${r.studentName || ""} ${r.teacherEmail || ""} ${r.subject || ""} ${r.reason || ""}`.toLowerCase().includes(filter.search));
  return rows;
}

function timeBucket(record) {
  const millis = timestampMillis(record.timestamp);
  if (!millis) return "Unknown";
  const hour = new Date(millis).getHours();
  if (hour < 10) return "Before 10:00";
  if (hour < 12) return "10:00-11:59";
  if (hour < 14) return "12:00-13:59";
  return "14:00+";
}

function barList(title, entries) {
  const max = Math.max(1, ...entries.map(([, value]) => value));
  return `<div class="card"><h3>${escapeHtml(title)}</h3>${entries.length ? entries.map(([label, value]) => `
    <div class="bar-row"><span>${escapeHtml(label || "Unknown")}</span><strong>${value}</strong><div class="bar-track"><div class="bar-fill" style="width:${Math.max(6, (value / max) * 100)}%"></div></div></div>`).join("") : `<p class="muted">No data.</p>`}</div>`;
}

function exportReport(rows) {
  downloadCsv("reflection-report.csv", ["Date", "Student", "Grade", "House", "Type", "Points", "Subject", "Reason", "Teacher", "Status"], rows.map((r) => [
    formatDateTime(r.timestamp), r.studentName || "", r.grade || "", houseById(r.house).name, r.type || "AR", r.type === "DR" ? 30 : (r.pointDeduction || r.pointsDeducted || 3), r.subject || "", r.reason || "", r.teacherEmail || "", r.status || "pending"
  ]));
}

function draw() {
  const target = document.getElementById("reports-content");
  if (!target) return;
  const rows = filteredReflections();
  const pending = rows.filter((r) => (r.status || "pending") === "pending").length;
  const approved = rows.filter((r) => r.status === "approved").length;
  const ars = rows.filter((r) => (r.type || "AR") === "AR").length;
  const drs = rows.filter((r) => (r.type || "AR") === "DR").length;
  const points = rows.reduce((sum, r) => sum + Number(r.type === "DR" ? 30 : (r.pointDeduction || r.pointsDeducted || 3)), 0);
  const grades = gradeOptions();

  target.innerHTML = `<div class="btn-row mb-0">
    <select id="report-status"><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option></select>
    <select id="report-type"><option value="all">All types</option><option value="AR">AR</option><option value="DR">DR</option></select>
    <select id="report-grade"><option value="all">All grades</option>${grades.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("")}</select>
    <input id="report-search" placeholder="Search student, teacher, subject, reason" />
    <button id="report-export" class="btn secondary">Export CSV</button>
  </div>
  <div class="grid cols-4 mt-3">
    <div class="card"><div class="muted small">Visible records</div><div class="kpi">${rows.length}</div></div>
    <div class="card"><div class="muted small">AR / DR</div><div class="kpi">${ars}/${drs}</div></div>
    <div class="card"><div class="muted small">Pending / Approved</div><div class="kpi">${pending}/${approved}</div></div>
    <div class="card"><div class="muted small">Potential deductions</div><div class="kpi">${points}</div></div>
  </div>
  <div class="grid cols-2 mt-4">
    <div class="card"><h2>House totals</h2>${HOUSES.map((h) => `<p><strong style="color:${h.color}">${escapeHtml(h.name)}:</strong> ${Number(totals[h.id] || 0).toLocaleString()} points</p>`).join("")}</div>
    ${barList("AR/DR by house", topEntries(countBy(rows, (r) => houseById(r.house).name), 8))}
    ${barList("Top students", topEntries(countBy(rows, (r) => r.studentName), 10))}
    ${barList("Top reasons", topEntries(countBy(rows, (r) => r.reason), 10))}
    ${barList("Subjects", topEntries(countBy(rows, (r) => r.subject), 10))}
    ${barList("Grades", topEntries(countBy(rows, (r) => normalizeGrade(r.grade)), 12))}
    ${barList("Teachers", topEntries(countBy(rows, (r) => r.teacherEmail), 10))}
    ${barList("Time of day", topEntries(countBy(rows, timeBucket), 8))}
  </div>
  <div class="card mt-4"><h2>Recent records</h2>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Student</th><th>Grade</th><th>Type</th><th>House</th><th>Subject</th><th>Status</th></tr></thead><tbody>
      ${rows.slice(0, 50).map((r) => `<tr><td>${escapeHtml(formatDateTime(r.timestamp))}</td><td>${escapeHtml(r.studentName || "")}</td><td>${escapeHtml(r.grade || "")}</td><td>${escapeHtml(r.type || "AR")}</td><td>${escapeHtml(houseById(r.house).name)}</td><td>${escapeHtml(r.subject || "")}</td><td>${escapeHtml(r.status || "pending")}</td></tr>`).join("")}
    </tbody></table></div>
  </div>`;

  const f = filters();
  document.getElementById("report-status").value = f.status;
  document.getElementById("report-type").value = f.type;
  document.getElementById("report-grade").value = f.grade;
  document.getElementById("report-search").value = f.search;
  ["report-status", "report-type", "report-grade"].forEach((id) => document.getElementById(id)?.addEventListener("change", (event) => {
    if (id === "report-status") reportFilter.status = event.target.value;
    if (id === "report-type") reportFilter.type = event.target.value;
    if (id === "report-grade") reportFilter.grade = event.target.value;
    draw();
  }));
  document.getElementById("report-search")?.addEventListener("input", (event) => { reportFilter.search = event.target.value; draw(); });
  document.getElementById("report-export")?.addEventListener("click", () => exportReport(filteredReflections()));
}

export function renderReports(ctx) {
  stop();
  ctx.setMain(`${pageHeader("Reports", "Reflection, house, subject, grade, reason, and teacher analytics from existing Firestore collections.")}
    <div id="reports-content">Loading...</div>`);
  unsubs.push(listenHouseTotals((t) => { totals = t; draw(); }));
  unsubs.push(onSnapshot(col(COLLECTIONS.activeReflections), (snapshot) => {
    reflections = [];
    snapshot.forEach((doc) => reflections.push({ id: doc.id, ...doc.data() }));
    reflections.sort((a, b) => timestampMillis(b.timestamp) - timestampMillis(a.timestamp));
    draw();
  }));
  ctx.registerCleanup(stop);
}
