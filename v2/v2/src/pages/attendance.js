import { GRADES } from "../config.js";
import { listenStudents } from "../services/student-service.js";
import { listenAttendance, submitAttendance } from "../services/attendance-service.js";
import { escapeHtml, formatDateTime } from "../utils.js";
import { pageHeader, notice, optionList, setBusy } from "../ui/dom.js";

let unsubs = [];
let students = [];
let logs = [];
let marks = {};
let moods = {};

function stop() {
  unsubs.forEach((fn) => fn && fn());
  unsubs = [];
  marks = {};
  moods = {};
}

function currentClassStudents() {
  const selected = document.getElementById("attendance-class")?.value || "";
  return students.filter((s) => s.grade === selected).sort((a, b) => (a.name || a.displayName || "").localeCompare(b.name || b.displayName || ""));
}

function drawRoster() {
  const target = document.getElementById("attendance-roster");
  if (!target) return;
  const rows = currentClassStudents();
  if (!document.getElementById("attendance-class").value) {
    target.innerHTML = `<p class="muted">Choose a class to load students.</p>`;
    return;
  }
  if (!rows.length) {
    target.innerHTML = `<p class="muted">No students found for this class.</p>`;
    return;
  }
  target.innerHTML = `<div class="record-list">
    ${rows.map((s) => `
      <div class="record-item">
        <div class="record-top">
          <div><div class="record-title">${escapeHtml(s.name || s.displayName || "")}</div><div class="muted small">${escapeHtml(s.grade || "")}</div></div>
          <div class="btn-row">
            ${["P", "L", "A"].map((status) => `<button class="btn small ${marks[s.id] === status ? "gold" : "secondary"}" data-attendance-status="${status}" data-student-id="${escapeHtml(s.id)}">${status}</button>`).join("")}
          </div>
        </div>
        <input data-mood-for="${escapeHtml(s.id)}" placeholder="Mood / note optional" value="${escapeHtml(moods[s.id] || "")}" />
      </div>`).join("")}
  </div>`;

  target.querySelectorAll("[data-attendance-status]").forEach((button) => {
    button.addEventListener("click", () => {
      marks[button.dataset.studentId] = button.dataset.attendanceStatus;
      drawRoster();
    });
  });
  target.querySelectorAll("[data-mood-for]").forEach((input) => {
    input.addEventListener("input", () => { moods[input.dataset.moodFor] = input.value; });
  });
}

function drawLogs() {
  const target = document.getElementById("attendance-logs");
  if (!target) return;
  if (!logs.length) {
    target.innerHTML = `<p class="muted">No attendance logs yet.</p>`;
    return;
  }
  target.innerHTML = `<div class="record-list">
    ${logs.slice(0, 20).map((log) => `
      <div class="record-item">
        <div class="record-top">
          <div><div class="record-title">${escapeHtml(log.class || "Class")}</div><div class="muted small">${escapeHtml(formatDateTime(log.timestamp))} · ${escapeHtml(log.teacherEmail || "")}</div></div>
          <div class="btn-row"><span class="badge success">P ${log.presentCount || 0}</span><span class="badge warn">L ${log.lateCount || 0}</span><span class="badge danger">A ${log.absentCount || 0}</span></div>
        </div>
      </div>`).join("")}
  </div>`;
}

export function renderAttendance(ctx) {
  stop();
  const canSubmit = ctx.can("canSubmitAttendance");
  const canViewAll = ctx.isCoordinator || ctx.isAdmin;

  ctx.setMain(`${pageHeader("Attendance", "Submit attendance using the existing attendance collection.")}
    <div id="attendance-toast"></div>
    ${!canSubmit ? notice("You do not currently have permission to submit attendance.", "warn") : ""}
    <div class="grid cols-2">
      <div class="card">
        <h2>Class roster</h2>
        <div class="btn-row">
          <select id="attendance-class"><option value="">Choose class</option>${optionList(GRADES)}</select>
          <button id="mark-all-present" class="btn secondary">Mark all present</button>
        </div>
        <div id="attendance-roster" class="mt-3">Choose a class.</div>
        <button id="submit-attendance" class="btn gold mt-3" ${canSubmit ? "" : "disabled"}>Submit attendance</button>
      </div>
      <div class="card">
        <h2>Recent logs</h2>
        <div id="attendance-logs">Loading...</div>
      </div>
    </div>`);

  ctx.toast = (message, type = "blue") => {
    const target = document.getElementById("attendance-toast");
    if (target) target.innerHTML = notice(message, type);
    setTimeout(() => { if (target) target.innerHTML = ""; }, 3500);
  };

  document.getElementById("attendance-class").addEventListener("change", () => { marks = {}; moods = {}; drawRoster(); });
  document.getElementById("mark-all-present").addEventListener("click", () => {
    for (const s of currentClassStudents()) marks[s.id] = "P";
    drawRoster();
  });
  document.getElementById("submit-attendance").addEventListener("click", async (event) => {
    const selectedClass = document.getElementById("attendance-class").value;
    const rows = currentClassStudents();
    if (!selectedClass || !rows.length) { ctx.toast("Choose a class with students.", "warn"); return; }
    if (Object.keys(marks).length !== rows.length) { ctx.toast("Mark every student as P, L, or A before submitting.", "warn"); return; }
    const records = rows.map((s) => ({
      studentId: s.id,
      studentName: s.name || s.displayName || "",
      status: marks[s.id],
      mood: moods[s.id] || ""
    }));
    const done = setBusy(event.currentTarget, "Submitting...");
    try {
      await submitAttendance({ user: ctx.user, selectedClass, records });
      ctx.toast("Attendance submitted.", "success");
      marks = {}; moods = {}; document.getElementById("attendance-class").value = ""; drawRoster();
    } catch (error) {
      console.error(error);
      ctx.toast(error.message || "Failed to submit attendance.", "danger");
    } finally {
      done();
    }
  });

  unsubs.push(listenStudents((rows) => { students = rows; drawRoster(); }));
  unsubs.push(listenAttendance({ user: ctx.user, canViewAll }, (rows) => { logs = rows; drawLogs(); }));
  ctx.registerCleanup(stop);
}
