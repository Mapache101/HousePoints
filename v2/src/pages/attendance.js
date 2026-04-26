import { GRADES, MOOD_OPTIONS, DEFAULT_SCHEDULE } from "../config.js";
import { listenStudents, deriveGradeOptions } from "../services/student-service.js";
import { listenAttendance, submitAttendance } from "../services/attendance-service.js";
import {
  escapeHtml,
  formatDateTime,
  normalizeGrade,
  studentName,
  statusLabel,
  nextAttendanceStatus,
  downloadCsv,
  countBy,
  topEntries,
  timestampMillis
} from "../utils.js";
import { pageHeader, notice, optionList, setBusy } from "../ui/dom.js";

let unsubs = [];
let students = [];
let logs = [];
let marks = {};
let moods = {};
let activeTab = "take";
let selectedClass = "";
let historyFilter = { className: "", search: "" };

function stop() {
  unsubs.forEach((fn) => fn && fn());
  unsubs = [];
  marks = {};
  moods = {};
  activeTab = "take";
  selectedClass = "";
}

function detectCurrentClass(grades) {
  const now = new Date();
  const day = now.getDay();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const block = DEFAULT_SCHEDULE.find((item) => item.day === day && time >= item.start && time <= item.end);
  if (block && grades.includes(block.class)) return block.class;
  return "";
}

function currentGrades() {
  return deriveGradeOptions(students).length ? deriveGradeOptions(students) : GRADES;
}

function currentClassStudents() {
  return students
    .filter((s) => normalizeGrade(s.grade) === normalizeGrade(selectedClass))
    .sort((a, b) => studentName(a).localeCompare(studentName(b)));
}

function drawClassPicker() {
  const target = document.getElementById("attendance-class");
  const history = document.getElementById("attendance-history-class");
  const grades = currentGrades();
  if (!selectedClass) selectedClass = detectCurrentClass(grades);
  if (target) {
    target.innerHTML = `<option value="">Choose class</option>${optionList(grades)}`;
    target.value = selectedClass;
  }
  if (history) {
    const current = history.value;
    const classes = [...new Set(logs.map((log) => normalizeGrade(log.class)).filter(Boolean))].sort();
    history.innerHTML = `<option value="">All classes</option>${optionList(classes.length ? classes : grades)}`;
    history.value = current;
  }
}

function markSummary(rows) {
  const total = rows.length;
  const marked = rows.filter((s) => marks[s.id]).length;
  const counts = { P: 0, L: 0, A: 0 };
  Object.values(marks).forEach((status) => { if (counts[status] !== undefined) counts[status] += 1; });
  return { total, marked, missing: Math.max(0, total - marked), counts };
}

function statusClass(status) {
  if (status === "P") return "present";
  if (status === "L") return "late";
  if (status === "A") return "absent";
  return "unmarked";
}

function drawRoster() {
  const target = document.getElementById("attendance-roster");
  const summaryTarget = document.getElementById("attendance-summary");
  if (!target) return;
  const rows = currentClassStudents();
  const summary = markSummary(rows);
  if (summaryTarget) {
    summaryTarget.innerHTML = `<div class="btn-row">
      <span class="badge blue">Marked ${summary.marked}/${summary.total}</span>
      <span class="badge ${summary.missing ? "warn" : "success"}">Missing ${summary.missing}</span>
      <span class="badge success">P ${summary.counts.P}</span>
      <span class="badge warn">L ${summary.counts.L}</span>
      <span class="badge danger">A ${summary.counts.A}</span>
    </div>`;
  }
  if (!selectedClass) {
    target.innerHTML = `<p class="muted">Choose a class to load students.</p>`;
    return;
  }
  if (!rows.length) {
    target.innerHTML = `<p class="muted">No students found for this class. Check the Students page roster.</p>`;
    return;
  }
  target.innerHTML = `<div class="attendance-grid">
    ${rows.map((s) => {
      const status = marks[s.id] || "";
      return `<div class="attendance-card ${statusClass(status)}" data-cycle-student="${escapeHtml(s.id)}">
        <div class="record-top">
          <div><div class="record-title">${escapeHtml(studentName(s))}</div><div class="muted small">${escapeHtml(s.grade || "")}</div></div>
          <span class="status-bubble">${escapeHtml(status || "-")}</span>
        </div>
        <div class="btn-row status-buttons">
          ${["P", "L", "A"].map((option) => `<button type="button" class="btn small ${status === option ? "gold" : "secondary"}" data-set-status="${option}" data-student-id="${escapeHtml(s.id)}">${option}</button>`).join("")}
        </div>
        <div class="mood-row">
          ${MOOD_OPTIONS.map((mood) => `<button type="button" class="mood-button ${moods[s.id] === mood.value ? "selected" : ""}" title="${escapeHtml(mood.label)}" data-set-mood="${escapeHtml(mood.value)}" data-student-id="${escapeHtml(s.id)}">${escapeHtml(mood.value || "-")}</button>`).join("")}
        </div>
      </div>`;
    }).join("")}
  </div>`;

  target.querySelectorAll("[data-cycle-student]").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.cycleStudent;
      const next = nextAttendanceStatus(marks[id]);
      if (next) marks[id] = next; else delete marks[id];
      drawRoster();
    });
  });
  target.querySelectorAll("[data-set-status]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      marks[button.dataset.studentId] = button.dataset.setStatus;
      drawRoster();
    });
  });
  target.querySelectorAll("[data-set-mood]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      moods[button.dataset.studentId] = button.dataset.setMood;
      drawRoster();
    });
  });
}

function filteredLogs() {
  const classFilter = historyFilter.className;
  const search = historyFilter.search.toLowerCase();
  let rows = [...logs];
  if (classFilter) rows = rows.filter((log) => normalizeGrade(log.class) === normalizeGrade(classFilter));
  if (search) rows = rows.filter((log) => `${log.class || ""} ${log.teacherEmail || ""} ${(log.records || []).map((r) => r.studentName).join(" ")}`.toLowerCase().includes(search));
  return rows;
}

function dominantMood(log) {
  const counts = countBy((log.records || []).filter((rec) => rec.mood), (rec) => rec.mood);
  return topEntries(counts, 1)[0]?.[0] || "";
}

function drawMoodProfile(rows) {
  const counts = Object.fromEntries(MOOD_OPTIONS.map((m) => [m.value, 0]));
  rows.forEach((log) => (log.records || []).forEach((rec) => {
    if (rec.mood !== undefined && counts[rec.mood] !== undefined) counts[rec.mood] += 1;
  }));
  const max = Math.max(1, ...Object.values(counts));
  return `<div class="card"><h3>Overall mood profile</h3>
    <div class="mood-profile">
      ${MOOD_OPTIONS.filter((m) => m.value).map((mood) => `<div class="mood-stat"><span>${escapeHtml(mood.value)}</span><div class="bar-track vertical"><div class="bar-fill" style="height:${Math.max(8, (counts[mood.value] / max) * 100)}%"></div></div><strong>${counts[mood.value]}</strong></div>`).join("")}
    </div>
  </div>`;
}

function drawAttendanceMatrix(rows) {
  const sessions = rows.slice(0, 10).sort((a, b) => timestampMillis(a.timestamp) - timestampMillis(b.timestamp));
  const studentNames = [...new Set(sessions.flatMap((log) => (log.records || []).map((rec) => rec.studentName).filter(Boolean)))].sort();
  if (!sessions.length || !studentNames.length) return `<p class="muted">No matrix data for this filter.</p>`;
  return `<div class="table-wrap"><table class="matrix-table"><thead><tr><th>Student</th>${sessions.map((log) => `<th>${escapeHtml(formatDateTime(log.timestamp))}<br><span class="muted small">${escapeHtml(log.class || "")}</span></th>`).join("")}</tr></thead><tbody>
    ${studentNames.map((name) => `<tr><td><strong>${escapeHtml(name)}</strong></td>${sessions.map((log) => {
      const rec = (log.records || []).find((item) => item.studentName === name);
      return `<td><span class="badge ${rec?.status === "P" ? "success" : rec?.status === "L" ? "warn" : rec?.status === "A" ? "danger" : "blue"}">${escapeHtml(rec?.status || "-")}</span>${rec?.mood ? `<div>${escapeHtml(rec.mood)}</div>` : ""}</td>`;
    }).join("")}</tr>`).join("")}
  </tbody></table></div>`;
}

function exportAttendanceRows(rows) {
  downloadCsv("attendance-log.csv", [
    "Session Date", "Class", "Teacher Email", "Student Name", "Status", "Status Label", "Mood", "Present Count", "Late Count", "Absent Count"
  ], rows.flatMap((log) => (log.records || []).map((rec) => [
    formatDateTime(log.timestamp),
    log.class || "",
    log.teacherEmail || "",
    rec.studentName || "",
    rec.status || "",
    statusLabel(rec.status),
    rec.mood || "",
    log.presentCount || 0,
    log.lateCount || 0,
    log.absentCount || 0
  ])));
}

function drawLogs() {
  const target = document.getElementById("attendance-logs");
  if (!target) return;
  drawClassPicker();
  const rows = filteredLogs();
  const totals = rows.reduce((acc, log) => {
    acc.present += Number(log.presentCount || 0);
    acc.late += Number(log.lateCount || 0);
    acc.absent += Number(log.absentCount || 0);
    return acc;
  }, { present: 0, late: 0, absent: 0 });

  target.innerHTML = `
    <div class="btn-row">
      <select id="attendance-history-class"><option value="">All classes</option></select>
      <input id="attendance-history-search" placeholder="Search logs or students" />
      <button id="attendance-export" class="btn secondary">Export CSV</button>
    </div>
    <div class="grid cols-4 mt-3">
      <div class="card subtle"><div class="muted small">Sessions</div><div class="kpi small-kpi">${rows.length}</div></div>
      <div class="card subtle"><div class="muted small">Present</div><div class="kpi small-kpi">${totals.present}</div></div>
      <div class="card subtle"><div class="muted small">Late</div><div class="kpi small-kpi">${totals.late}</div></div>
      <div class="card subtle"><div class="muted small">Absent</div><div class="kpi small-kpi">${totals.absent}</div></div>
    </div>
    <div class="grid cols-2 mt-4">
      ${drawMoodProfile(rows)}
      <div class="card"><h3>Dominant mood timeline</h3>${rows.length ? `<div class="timeline-list">${rows.slice(0, 12).map((log) => `<div class="timeline-row"><span>${escapeHtml(formatDateTime(log.timestamp))}</span><strong>${escapeHtml(dominantMood(log) || "-")}</strong><small>${escapeHtml(log.class || "")}</small></div>`).join("")}</div>` : `<p class="muted">No mood data.</p>`}</div>
    </div>
    <div class="card mt-4"><h3>Student matrix</h3>${drawAttendanceMatrix(rows)}</div>
    <div class="card mt-4"><h3>Recent sessions</h3>
      ${rows.length ? `<div class="record-list">${rows.slice(0, 30).map((log) => `
        <details class="record-item">
          <summary class="record-top">
            <span><strong>${escapeHtml(log.class || "Class")}</strong><span class="muted small"> - ${escapeHtml(formatDateTime(log.timestamp))} - ${escapeHtml(log.teacherEmail || "")}</span></span>
            <span class="btn-row"><span class="badge success">P ${log.presentCount || 0}</span><span class="badge warn">L ${log.lateCount || 0}</span><span class="badge danger">A ${log.absentCount || 0}</span></span>
          </summary>
          <div class="table-wrap mt-2"><table><thead><tr><th>Student</th><th>Status</th><th>Mood</th></tr></thead><tbody>${(log.records || []).map((rec) => `<tr><td>${escapeHtml(rec.studentName || "")}</td><td>${escapeHtml(statusLabel(rec.status))}</td><td>${escapeHtml(rec.mood || "")}</td></tr>`).join("")}</tbody></table></div>
        </details>`).join("")}</div>` : `<p class="muted">No attendance logs yet.</p>`}
    </div>`;

  drawClassPicker();
  document.getElementById("attendance-history-class").value = historyFilter.className;
  document.getElementById("attendance-history-search").value = historyFilter.search;
  document.getElementById("attendance-history-class")?.addEventListener("change", (event) => { historyFilter.className = event.target.value; drawLogs(); });
  document.getElementById("attendance-history-search")?.addEventListener("input", (event) => { historyFilter.search = event.target.value; drawLogs(); });
  document.getElementById("attendance-export")?.addEventListener("click", () => exportAttendanceRows(filteredLogs()));
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll("[data-attendance-tab]").forEach((button) => button.classList.toggle("gold", button.dataset.attendanceTab === tab));
  document.querySelectorAll("[data-attendance-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.attendancePanel !== tab));
  if (tab === "take") { drawClassPicker(); drawRoster(); }
  if (tab === "history") drawLogs();
}

export function renderAttendance(ctx) {
  stop();
  const canSubmit = ctx.can("canSubmitAttendance");
  const canViewAll = ctx.isCoordinator || ctx.isAdmin;

  ctx.setMain(`${pageHeader("Attendance", "Submit attendance and review the existing attendance collection.")}
    <div id="attendance-toast"></div>
    ${!canSubmit ? notice("You do not currently have permission to submit attendance.", "warn") : ""}
    <div class="tabs">
      <button class="btn small gold" data-attendance-tab="take">Take attendance</button>
      <button class="btn small secondary" data-attendance-tab="history">Log and insights</button>
    </div>
    <section data-attendance-panel="take" class="mt-3">
      <div class="card">
        <div class="record-top">
          <div><h2>Class roster</h2><p class="muted small">Click a student card to cycle Present, Late, Absent, and unmarked. Mood buttons are optional.</p></div>
          <div class="btn-row">
            <select id="attendance-class"><option value="">Choose class</option>${optionList(GRADES)}</select>
            <button id="mark-all-present" class="btn secondary">Mark all present</button>
          </div>
        </div>
        <div id="attendance-summary" class="mt-2"></div>
        <div id="attendance-roster" class="mt-3">Choose a class.</div>
        <button id="submit-attendance" class="btn gold mt-3" ${canSubmit ? "" : "disabled"}>Submit attendance</button>
      </div>
    </section>
    <section data-attendance-panel="history" class="mt-3 hidden">
      <div id="attendance-logs">Loading...</div>
    </section>`);

  ctx.toast = (message, type = "blue") => {
    const target = document.getElementById("attendance-toast");
    if (target) target.innerHTML = notice(message, type);
    setTimeout(() => { if (target) target.innerHTML = ""; }, 3500);
  };

  document.querySelectorAll("[data-attendance-tab]").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.attendanceTab)));
  document.getElementById("attendance-class").addEventListener("change", (event) => {
    selectedClass = event.target.value;
    marks = {};
    moods = {};
    drawRoster();
  });
  document.getElementById("mark-all-present").addEventListener("click", () => {
    for (const s of currentClassStudents()) marks[s.id] = "P";
    drawRoster();
  });
  document.getElementById("submit-attendance").addEventListener("click", async (event) => {
    const rows = currentClassStudents();
    if (!selectedClass || !rows.length) { ctx.toast("Choose a class with students.", "warn"); return; }
    if (rows.some((s) => !marks[s.id])) { ctx.toast("Mark every student as P, L, or A before submitting.", "warn"); return; }
    const records = rows.map((s) => ({
      studentId: s.id,
      studentName: studentName(s),
      status: marks[s.id],
      mood: moods[s.id] || ""
    }));
    const done = setBusy(event.currentTarget, "Submitting...");
    try {
      await submitAttendance({ user: ctx.user, selectedClass, records });
      ctx.toast("Attendance submitted.", "success");
      marks = {};
      moods = {};
      selectedClass = "";
      drawClassPicker();
      drawRoster();
    } catch (error) {
      console.error(error);
      ctx.toast(error.message || "Failed to submit attendance.", "danger");
    } finally {
      done();
    }
  });

  unsubs.push(listenStudents((rows) => {
    students = rows;
    drawClassPicker();
    if (activeTab === "take") drawRoster();
  }));
  unsubs.push(listenAttendance({ user: ctx.user, canViewAll }, (rows) => {
    logs = rows;
    if (activeTab === "history") drawLogs();
  }));
  ctx.registerCleanup(stop);
}
