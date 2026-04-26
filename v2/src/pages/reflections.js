import { AR_REASONS, SUBJECTS, GRADES, HOUSES } from "../config.js";
import { listenStudents, deriveGradeOptions } from "../services/student-service.js";
import { listenReflections, submitReflection, approveReflection, deleteReflection } from "../services/reflection-service.js";
import {
  escapeHtml,
  formatDateTime,
  houseById,
  downloadCsv,
  countBy,
  topEntries,
  normalizeGrade,
  studentName,
  timestampMillis
} from "../utils.js";
import { pageHeader, notice, optionList, setBusy } from "../ui/dom.js";

let unsubs = [];
let students = [];
let records = [];
let searchMode = "search";
let selectedStudentId = "";
let activeTab = "submit";
let queueFilters = { status: "all", type: "all", grade: "all", search: "" };
let queueSort = { field: "timestamp", direction: "desc" };

function stop() {
  unsubs.forEach((fn) => fn && fn());
  unsubs = [];
  students = [];
  records = [];
  selectedStudentId = "";
  searchMode = "search";
  activeTab = "submit";
}

function getSelectedStudent() {
  return students.find((s) => s.id === selectedStudentId) || null;
}

function studentLabel(s) {
  return `${studentName(s) || "Unnamed"} - ${s.grade || "No grade"} - ${houseById(s.house).name}`;
}

function drawStudentPicker() {
  const target = document.getElementById("student-picker-area");
  if (!target) return;
  const gradeOptions = deriveGradeOptions(students);
  const selected = getSelectedStudent();
  target.innerHTML = `
    <div class="btn-row mb-0">
      <button type="button" class="btn small ${searchMode === "search" ? "gold" : "secondary"}" data-student-mode="search">Search</button>
      <button type="button" class="btn small ${searchMode === "dropdown" ? "gold" : "secondary"}" data-student-mode="dropdown">Dropdown by grade</button>
      ${selected ? `<span class="badge success">Selected: ${escapeHtml(studentLabel(selected))}</span>` : `<span class="badge warn">No roster student selected</span>`}
    </div>
    ${searchMode === "search" ? `
      <div class="field mt-2"><label>Search student name</label><input id="reflection-student-search" placeholder="Type at least 2 letters" autocomplete="off" /></div>
      <div id="reflection-search-results" class="search-results"></div>
    ` : `
      <div class="form-grid cols-2 mt-2">
        <div class="field"><label>Grade</label><select id="reflection-grade-select"><option value="">Choose grade</option>${optionList(gradeOptions)}</select></div>
        <div class="field"><label>Student</label><select id="reflection-student-select"><option value="">Choose student</option></select></div>
      </div>
    `}
  `;

  target.querySelectorAll("[data-student-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      searchMode = button.dataset.studentMode;
      selectedStudentId = "";
      drawStudentPicker();
      drawPreview();
    });
  });

  const searchInput = document.getElementById("reflection-student-search");
  if (searchInput) {
    searchInput.addEventListener("input", () => drawSearchResults());
    drawSearchResults();
  }

  const gradeSelect = document.getElementById("reflection-grade-select");
  const studentSelect = document.getElementById("reflection-student-select");
  if (gradeSelect && studentSelect) {
    gradeSelect.addEventListener("change", () => drawDropdownStudents());
    studentSelect.addEventListener("change", () => {
      selectedStudentId = studentSelect.value;
      drawStudentPicker();
      drawPreview();
    });
    drawDropdownStudents();
  }
}

function drawSearchResults() {
  const input = document.getElementById("reflection-student-search");
  const target = document.getElementById("reflection-search-results");
  if (!input || !target) return;
  const term = input.value.trim().toLowerCase();
  if (term.length < 2) {
    target.innerHTML = `<p class="muted small">Enter at least 2 characters.</p>`;
    return;
  }
  const rows = students
    .filter((s) => studentLabel(s).toLowerCase().includes(term))
    .slice(0, 12);
  target.innerHTML = rows.length ? `<div class="record-list compact">
    ${rows.map((s) => `<button type="button" class="student-result" data-pick-student="${escapeHtml(s.id)}">
      <strong>${escapeHtml(studentName(s))}</strong><span>${escapeHtml(s.grade || "")} - ${escapeHtml(houseById(s.house).name)}</span>
    </button>`).join("")}
  </div>` : `<p class="muted small">No matching students. Use the manual fields below.</p>`;
  target.querySelectorAll("[data-pick-student]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedStudentId = button.dataset.pickStudent;
      drawStudentPicker();
      drawPreview();
    });
  });
}

function drawDropdownStudents() {
  const grade = document.getElementById("reflection-grade-select")?.value || "";
  const target = document.getElementById("reflection-student-select");
  if (!target) return;
  const rows = students.filter((s) => !grade || normalizeGrade(s.grade) === normalizeGrade(grade));
  target.innerHTML = `<option value="">Choose student</option>` + rows.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(studentLabel(s))}</option>`).join("");
  target.value = selectedStudentId;
}

function drawPreview() {
  const target = document.getElementById("reflection-preview");
  const form = document.getElementById("reflection-form");
  if (!target || !form) return;
  const selected = getSelectedStudent();
  const manualName = form.studentName?.value || "";
  const manualGrade = form.grade?.value || "";
  const manualHouse = form.house?.value || "";
  const recordType = form.type?.value || "AR";
  const points = recordType === "DR" ? 30 : Number(form.pointDeduction?.value || 3);
  const name = studentName(selected) || manualName || "No student selected";
  const grade = selected?.grade || manualGrade || "No grade";
  const house = selected?.house || manualHouse || "";
  target.innerHTML = `<div class="preview-card">
    <div class="record-top">
      <div><strong>${escapeHtml(name)}</strong><div class="muted small">${escapeHtml(grade)} - ${escapeHtml(houseById(house).name)}</div></div>
      <span class="badge ${recordType === "DR" ? "danger" : "blue"}">${escapeHtml(recordType)} - ${points} pts</span>
    </div>
    <div class="small"><strong>Subject:</strong> ${escapeHtml(form.subject?.value || "Choose subject")}</div>
    <div class="small"><strong>Reason:</strong> ${escapeHtml(form.reason?.value || "Choose reason")}${form.customReason?.value ? ` - ${escapeHtml(form.customReason.value)}` : ""}</div>
  </div>`;
}

function currentQueueRows() {
  const status = queueFilters.status;
  const type = queueFilters.type;
  const grade = queueFilters.grade;
  const search = queueFilters.search.toLowerCase();
  let rows = [...records];
  if (status !== "all") rows = rows.filter((r) => (r.status || "pending") === status);
  if (type !== "all") rows = rows.filter((r) => (r.type || "AR") === type);
  if (grade !== "all") rows = rows.filter((r) => normalizeGrade(r.grade) === normalizeGrade(grade));
  if (search) rows = rows.filter((r) => `${r.studentName || ""} ${r.teacherEmail || ""} ${r.subject || ""} ${r.reason || ""}`.toLowerCase().includes(search));

  rows.sort((a, b) => {
    const field = queueSort.field;
    let av;
    let bv;
    if (field === "timestamp") {
      av = timestampMillis(a.timestamp);
      bv = timestampMillis(b.timestamp);
    } else {
      av = String(a[field] || "").toLowerCase();
      bv = String(b[field] || "").toLowerCase();
    }
    const result = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return queueSort.direction === "asc" ? result : -result;
  });
  return rows;
}

function exportReflections(rows = currentQueueRows()) {
  downloadCsv("ar-dr-records.csv", [
    "Date", "Student Name", "Grade", "House", "Type", "Points", "Subject", "Reason", "Other Reason", "Teacher Email", "Status", "Approved By", "Approved At", "Source"
  ], rows.map((record) => [
    formatDateTime(record.timestamp),
    record.studentName || "",
    record.grade || "",
    houseById(record.house).name,
    record.type || "AR",
    record.type === "DR" ? 30 : (record.pointDeduction || record.pointsDeducted || 3),
    record.subject || "",
    record.reason || "",
    record.customReason || "",
    record.teacherEmail || "",
    record.status || "pending",
    record.approvedBy || "",
    formatDateTime(record.approvedAt),
    record.sourceApp || "legacy"
  ]));
}

function drawRecords(ctx) {
  const target = document.getElementById("reflection-records");
  if (!target) return;
  const rows = currentQueueRows();
  const pending = records.filter((r) => (r.status || "pending") === "pending").length;
  const approved = records.filter((r) => r.status === "approved").length;
  const drs = records.filter((r) => (r.type || "AR") === "DR").length;

  target.innerHTML = `
    <div class="grid cols-4 mb-0">
      <div class="card subtle"><div class="muted small">Visible records</div><div class="kpi small-kpi">${rows.length}</div></div>
      <div class="card subtle"><div class="muted small">Pending</div><div class="kpi small-kpi">${pending}</div></div>
      <div class="card subtle"><div class="muted small">Approved</div><div class="kpi small-kpi">${approved}</div></div>
      <div class="card subtle"><div class="muted small">DRs</div><div class="kpi small-kpi">${drs}</div></div>
    </div>
    <div class="btn-row mt-3">
      <select id="reflection-status-filter"><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option></select>
      <select id="reflection-type-filter"><option value="all">All types</option><option value="AR">AR</option><option value="DR">DR</option></select>
      <select id="reflection-grade-filter"><option value="all">All grades</option>${optionList(deriveGradeOptions(students))}</select>
      <select id="reflection-sort-field"><option value="timestamp">Sort by date</option><option value="studentName">Sort by student</option><option value="grade">Sort by grade</option><option value="subject">Sort by subject</option><option value="teacherEmail">Sort by teacher</option></select>
      <select id="reflection-sort-direction"><option value="desc">Descending</option><option value="asc">Ascending</option></select>
      <input id="reflection-search-filter" placeholder="Search student, teacher, subject, reason" />
      <button id="reflection-export" class="btn secondary">Export CSV</button>
    </div>
    <div class="record-list mt-3">
      ${rows.length ? rows.map((record) => `
        <div class="record-item">
          <div class="record-top">
            <div>
              <div class="record-title">${escapeHtml(record.studentName || "Unknown student")}</div>
              <div class="muted small">${escapeHtml(record.grade || "")} - ${escapeHtml(houseById(record.house).name)} - ${escapeHtml(formatDateTime(record.timestamp))}</div>
            </div>
            <div class="btn-row">
              <span class="badge ${record.type === "DR" ? "danger" : "blue"}">${escapeHtml(record.type || "AR")}</span>
              <span class="badge ${(record.status || "pending") === "approved" ? "success" : "warn"}">${escapeHtml(record.status || "pending")}</span>
            </div>
          </div>
          <div><strong>Subject:</strong> ${escapeHtml(record.subject || "")}</div>
          <div><strong>Reason:</strong> ${escapeHtml(record.reason || "")}${record.customReason ? ` - ${escapeHtml(record.customReason)}` : ""}</div>
          <div><strong>Teacher:</strong> ${escapeHtml(record.teacherEmail || "")}</div>
          <div><strong>Points:</strong> ${escapeHtml(record.type === "DR" ? 30 : (record.pointDeduction || record.pointsDeducted || 3))}</div>
          ${ctx.can("canApproveReflections") && (record.status || "pending") === "pending" ? `
            <div class="btn-row">
              <button class="btn small success" data-approve-reflection="${escapeHtml(record.id)}">Approve / deduct points</button>
              <button class="btn small danger" data-delete-reflection="${escapeHtml(record.id)}">Delete</button>
            </div>` : ""}
        </div>`).join("") : `<div class="card center"><h3>No records found</h3><p class="muted">Change filters or submit a new AR/DR.</p></div>`}
    </div>`;

  document.getElementById("reflection-status-filter").value = queueFilters.status;
  document.getElementById("reflection-type-filter").value = queueFilters.type;
  document.getElementById("reflection-grade-filter").value = queueFilters.grade;
  document.getElementById("reflection-search-filter").value = queueFilters.search;
  document.getElementById("reflection-sort-field").value = queueSort.field;
  document.getElementById("reflection-sort-direction").value = queueSort.direction;
  ["reflection-status-filter", "reflection-type-filter", "reflection-grade-filter"].forEach((id) => document.getElementById(id)?.addEventListener("change", (event) => {
    const key = id.replace("reflection-", "").replace("-filter", "");
    if (key === "status") queueFilters.status = event.target.value;
    if (key === "type") queueFilters.type = event.target.value;
    if (key === "grade") queueFilters.grade = event.target.value;
    drawRecords(ctx);
  }));
  document.getElementById("reflection-search-filter")?.addEventListener("input", (event) => { queueFilters.search = event.target.value; drawRecords(ctx); });
  document.getElementById("reflection-sort-field")?.addEventListener("change", (event) => { queueSort.field = event.target.value; drawRecords(ctx); });
  document.getElementById("reflection-sort-direction")?.addEventListener("change", (event) => { queueSort.direction = event.target.value; drawRecords(ctx); });
  document.getElementById("reflection-export")?.addEventListener("click", () => exportReflections(currentQueueRows()));

  target.querySelectorAll("[data-approve-reflection]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const record = records.find((r) => r.id === button.dataset.approveReflection);
      if (!record) return;
      const points = record.type === "DR" ? 30 : (record.pointDeduction || record.pointsDeducted || 3);
      if (!confirm(`Approve this ${record.type || "AR"} and deduct ${points} points from ${houseById(record.house).name}?`)) return;
      const done = setBusy(event.currentTarget, "Approving...");
      try {
        await approveReflection({ record, actorEmail: ctx.user.email });
        ctx.toast("Record approved.", "success");
      } catch (error) {
        console.error(error);
        ctx.toast(error.message || "Failed to approve record.", "danger");
      } finally {
        done();
      }
    });
  });

  target.querySelectorAll("[data-delete-reflection]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const record = records.find((r) => r.id === button.dataset.deleteReflection);
      if (!record || !confirm("Delete this AR/DR record?")) return;
      const done = setBusy(event.currentTarget, "Deleting...");
      try {
        await deleteReflection({ record, actorEmail: ctx.user.email });
        ctx.toast("Record deleted.", "success");
      } catch (error) {
        console.error(error);
        ctx.toast(error.message || "Failed to delete record.", "danger");
      } finally {
        done();
      }
    });
  });
}

function barList(title, entries) {
  const max = Math.max(1, ...entries.map(([, value]) => value));
  return `<div class="card"><h3>${escapeHtml(title)}</h3>${entries.length ? entries.map(([label, value]) => `
    <div class="bar-row"><span>${escapeHtml(label)}</span><strong>${value}</strong><div class="bar-track"><div class="bar-fill" style="width:${Math.max(6, (value / max) * 100)}%"></div></div></div>`).join("") : `<p class="muted">No data.</p>`}</div>`;
}

function drawAnalysis() {
  const target = document.getElementById("reflection-analysis");
  if (!target) return;
  const topStudents = topEntries(countBy(records, (r) => r.studentName), 10);
  const topReasons = topEntries(countBy(records, (r) => r.reason), 10);
  const topSubjects = topEntries(countBy(records, (r) => r.subject), 10);
  const byGrade = topEntries(countBy(records, (r) => normalizeGrade(r.grade)), 12);
  const byHouse = topEntries(countBy(records, (r) => houseById(r.house).name), 8);
  target.innerHTML = `<div class="grid cols-2">
    ${barList("Top students", topStudents)}
    ${barList("Top reasons", topReasons)}
    ${barList("Subjects", topSubjects)}
    ${barList("Grades", byGrade)}
    ${barList("Houses", byHouse)}
  </div>`;
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll("[data-reflection-tab]").forEach((button) => button.classList.toggle("gold", button.dataset.reflectionTab === tab));
  document.querySelectorAll("[data-reflection-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.reflectionPanel !== tab));
  if (tab === "queue") drawRecords(window.__SCIS_CTX__);
  if (tab === "analysis") drawAnalysis();
}

export function renderReflections(ctx) {
  stop();
  window.__SCIS_CTX__ = ctx;
  const canSubmit = ctx.can("canGiveAR") || ctx.can("canGiveDR");
  const canApprove = ctx.can("canApproveReflections");

  ctx.setMain(`${pageHeader("AR / DR", "Submit Active Reflections and manage the coordinator approval queue.")}
    <div id="reflection-toast"></div>
    ${!canSubmit ? notice("You do not currently have permission to give ARs or DRs.", "warn") : ""}
    <div class="tabs">
      <button class="btn small gold" data-reflection-tab="submit">Submit</button>
      <button class="btn small secondary" data-reflection-tab="queue">${canApprove ? "Coordinator queue" : "My records"}</button>
      <button class="btn small secondary" data-reflection-tab="analysis">Analysis</button>
    </div>
    <section data-reflection-panel="submit" class="mt-3">
      <div class="grid cols-2">
        <div class="card">
          <h2>Submit record</h2>
          <form id="reflection-form" class="form-grid">
            <div class="form-grid cols-2">
              <div class="field">
                <label>Type</label>
                <select name="type" ${canSubmit ? "" : "disabled"}>
                  ${ctx.can("canGiveAR") ? `<option value="AR">Active Reflection</option>` : ""}
                  ${ctx.can("canGiveDR") ? `<option value="DR">Disciplinary Referral</option>` : ""}
                </select>
              </div>
              <div class="field"><label>AR point deduction</label><input name="pointDeduction" type="number" min="0" value="3" ${canSubmit ? "" : "disabled"} /></div>
            </div>
            <div id="student-picker-area"></div>
            <details class="manual-student-box">
              <summary>Manual student / not in roster</summary>
              <div class="form-grid cols-3 mt-2">
                <div class="field"><label>Student name</label><input name="studentName" placeholder="Only if not in list" ${canSubmit ? "" : "disabled"} /></div>
                <div class="field"><label>Grade</label><select name="grade" ${canSubmit ? "" : "disabled"}><option value="">Choose</option>${optionList(GRADES)}</select></div>
                <div class="field"><label>House</label><select name="house" ${canSubmit ? "" : "disabled"}><option value="">Choose</option>${optionList(HOUSES.map((h) => ({ value: h.id, label: h.name })))}</select></div>
              </div>
            </details>
            <div class="form-grid cols-2">
              <div class="field"><label>Subject</label><select name="subject" required ${canSubmit ? "" : "disabled"}><option value="">Choose subject</option>${optionList(SUBJECTS)}</select></div>
              <div class="field"><label>Reason</label><select name="reason" required ${canSubmit ? "" : "disabled"}><option value="">Choose reason</option>${optionList(AR_REASONS)}</select></div>
            </div>
            <div class="field"><label>Other reason details</label><textarea name="customReason" ${canSubmit ? "" : "disabled"}></textarea></div>
            <div class="btn-row"><button class="btn gold" type="submit" ${canSubmit ? "" : "disabled"}>Submit AR / DR</button></div>
          </form>
        </div>
        <div class="card">
          <h2>Preview</h2>
          <div id="reflection-preview"></div>
          <div class="divider"></div>
          <p class="muted small">DR records deduct 30 points after coordinator approval. AR records use the AR deduction value, defaulting to 3 points.</p>
        </div>
      </div>
    </section>
    <section data-reflection-panel="queue" class="mt-3 hidden"><div class="card"><h2>${canApprove ? "Coordinator queue" : "My records"}</h2><div id="reflection-records">Loading...</div></div></section>
    <section data-reflection-panel="analysis" class="mt-3 hidden"><div id="reflection-analysis">Loading...</div></section>`);

  ctx.toast = (message, type = "blue") => {
    const target = document.getElementById("reflection-toast");
    if (target) target.innerHTML = notice(message, type);
    setTimeout(() => { if (target) target.innerHTML = ""; }, 3500);
  };

  document.querySelectorAll("[data-reflection-tab]").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.reflectionTab)));

  const form = document.getElementById("reflection-form");
  form.addEventListener("input", drawPreview);
  form.addEventListener("change", drawPreview);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selectedStudent = getSelectedStudent();
    if (!selectedStudent && (!form.studentName.value || !form.grade.value || !form.house.value)) {
      ctx.toast("Choose a roster student or fill manual student name, grade, and house.", "warn");
      return;
    }
    const done = setBusy(form.querySelector("button[type='submit']"), "Submitting...");
    try {
      await submitReflection({
        user: ctx.user,
        type: form.type.value,
        student: selectedStudent,
        manualStudent: { studentName: form.studentName.value, grade: form.grade.value, house: form.house.value },
        reason: form.reason.value,
        customReason: form.customReason.value,
        subject: form.subject.value,
        pointDeduction: form.pointDeduction.value
      });
      ctx.toast("Record submitted for coordinator review.", "success");
      selectedStudentId = "";
      form.reset();
      form.pointDeduction.value = 3;
      drawStudentPicker();
      drawPreview();
    } catch (error) {
      console.error(error);
      ctx.toast(error.message || "Failed to submit record.", "danger");
    } finally {
      done();
    }
  });

  unsubs.push(listenStudents((rows) => {
    students = rows;
    drawStudentPicker();
    drawPreview();
    if (activeTab === "queue") drawRecords(ctx);
  }));
  unsubs.push(listenReflections({ user: ctx.user, canViewAll: canApprove }, (rows) => {
    records = rows;
    if (activeTab === "queue") drawRecords(ctx);
    if (activeTab === "analysis") drawAnalysis();
  }));
  drawStudentPicker();
  drawPreview();
  ctx.registerCleanup(stop);
}
