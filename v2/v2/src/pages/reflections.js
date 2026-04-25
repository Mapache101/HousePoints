import { AR_REASONS, SUBJECTS, GRADES, HOUSES } from "../config.js";
import { listenStudents } from "../services/student-service.js";
import { listenReflections, submitReflection, approveReflection, deleteReflection } from "../services/reflection-service.js";
import { escapeHtml, formatDateTime, houseById } from "../utils.js";
import { pageHeader, notice, optionList, setBusy } from "../ui/dom.js";

let unsubs = [];
let students = [];
let records = [];

function stop() {
  unsubs.forEach((fn) => fn && fn());
  unsubs = [];
}

function drawStudentOptions() {
  const target = document.getElementById("reflection-student");
  if (!target) return;
  const current = target.value;
  target.innerHTML = `<option value="">Manual student / not listed</option>` + students.map((s) => {
    const label = `${s.name || s.displayName || "Unnamed"} - ${s.grade || "No grade"} - ${houseById(s.house).name}`;
    return `<option value="${escapeHtml(s.id)}" ${s.id === current ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function drawRecords(ctx) {
  const target = document.getElementById("reflection-records");
  if (!target) return;
  const status = document.getElementById("reflection-status-filter")?.value || "all";
  const type = document.getElementById("reflection-type-filter")?.value || "all";
  let rows = [...records];
  if (status !== "all") rows = rows.filter((r) => (r.status || "pending") === status);
  if (type !== "all") rows = rows.filter((r) => (r.type || "AR") === type);

  if (!rows.length) {
    target.innerHTML = `<p class="muted">No records found.</p>`;
    return;
  }

  target.innerHTML = `<div class="record-list">
    ${rows.map((record) => `
      <div class="record-item">
        <div class="record-top">
          <div>
            <div class="record-title">${escapeHtml(record.studentName || "Unknown student")}</div>
            <div class="muted small">${escapeHtml(record.grade || "")} · ${escapeHtml(houseById(record.house).name)} · ${escapeHtml(formatDateTime(record.timestamp))}</div>
          </div>
          <div class="btn-row">
            <span class="badge ${record.type === "DR" ? "danger" : "blue"}">${escapeHtml(record.type || "AR")}</span>
            <span class="badge ${(record.status || "pending") === "approved" ? "success" : "warn"}">${escapeHtml(record.status || "pending")}</span>
          </div>
        </div>
        <div><strong>Subject:</strong> ${escapeHtml(record.subject || "")}</div>
        <div><strong>Reason:</strong> ${escapeHtml(record.reason || "")}${record.customReason ? ` - ${escapeHtml(record.customReason)}` : ""}</div>
        <div><strong>Teacher:</strong> ${escapeHtml(record.teacherEmail || "")}</div>
        ${ctx.can("canApproveReflections") && (record.status || "pending") === "pending" ? `
          <div class="btn-row">
            <button class="btn small success" data-approve-reflection="${escapeHtml(record.id)}">Approve / deduct points</button>
            <button class="btn small danger" data-delete-reflection="${escapeHtml(record.id)}">Delete</button>
          </div>` : ""}
      </div>`).join("")}
  </div>`;

  target.querySelectorAll("[data-approve-reflection]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const record = records.find((r) => r.id === button.dataset.approveReflection);
      if (!record) return;
      const points = record.type === "DR" ? 30 : (record.pointDeduction || 3);
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

export function renderReflections(ctx) {
  stop();
  const canSubmit = ctx.can("canGiveAR") || ctx.can("canGiveDR");
  const canApprove = ctx.can("canApproveReflections");

  ctx.setMain(`${pageHeader("AR / DR", "Submit Active Reflections and manage the coordinator approval queue.")}
    <div id="reflection-toast"></div>
    ${!canSubmit ? notice("You do not currently have permission to give ARs or DRs.", "warn") : ""}
    <div class="grid ${canApprove ? "cols-2" : ""}">
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
            <div class="field">
              <label>Student</label>
              <select id="reflection-student" name="studentId" ${canSubmit ? "" : "disabled"}></select>
            </div>
          </div>
          <div class="form-grid cols-3">
            <div class="field"><label>Manual student name</label><input name="studentName" placeholder="Only if not in list" ${canSubmit ? "" : "disabled"} /></div>
            <div class="field"><label>Grade</label><select name="grade" ${canSubmit ? "" : "disabled"}><option value="">Choose</option>${optionList(GRADES)}</select></div>
            <div class="field"><label>House</label><select name="house" ${canSubmit ? "" : "disabled"}><option value="">Choose</option>${optionList(HOUSES.map((h) => ({ value: h.id, label: h.name })))}</select></div>
          </div>
          <div class="form-grid cols-2">
            <div class="field"><label>Subject</label><select name="subject" required ${canSubmit ? "" : "disabled"}>${optionList(SUBJECTS)}</select></div>
            <div class="field"><label>AR point deduction</label><input name="pointDeduction" type="number" min="0" value="3" ${canSubmit ? "" : "disabled"} /></div>
          </div>
          <div class="field"><label>Reason</label><select name="reason" required ${canSubmit ? "" : "disabled"}>${optionList(AR_REASONS)}</select></div>
          <div class="field"><label>Other reason details</label><textarea name="customReason" ${canSubmit ? "" : "disabled"}></textarea></div>
          <div class="btn-row"><button class="btn gold" type="submit" ${canSubmit ? "" : "disabled"}>Submit AR / DR</button></div>
        </form>
      </div>
      <div class="card">
        <h2>${canApprove ? "Coordinator queue" : "My records"}</h2>
        <div class="btn-row">
          <select id="reflection-status-filter"><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option></select>
          <select id="reflection-type-filter"><option value="all">All types</option><option value="AR">AR</option><option value="DR">DR</option></select>
        </div>
        <div id="reflection-records" class="mt-3">Loading...</div>
      </div>
    </div>`);

  ctx.toast = (message, type = "blue") => {
    const target = document.getElementById("reflection-toast");
    if (target) target.innerHTML = notice(message, type);
    setTimeout(() => { if (target) target.innerHTML = ""; }, 3500);
  };

  const form = document.getElementById("reflection-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selectedStudent = students.find((s) => s.id === form.studentId.value);
    if (!selectedStudent && (!form.studentName.value || !form.grade.value || !form.house.value)) {
      ctx.toast("Choose a student or fill manual student name, grade, and house.", "warn");
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
      form.reset();
      form.pointDeduction.value = 3;
    } catch (error) {
      console.error(error);
      ctx.toast(error.message || "Failed to submit record.", "danger");
    } finally {
      done();
    }
  });

  ["reflection-status-filter", "reflection-type-filter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => drawRecords(ctx));
  });

  unsubs.push(listenStudents((rows) => { students = rows; drawStudentOptions(); }));
  unsubs.push(listenReflections({ user: ctx.user, canViewAll: canApprove }, (rows) => { records = rows; drawRecords(ctx); }));
  ctx.registerCleanup(stop);
}
