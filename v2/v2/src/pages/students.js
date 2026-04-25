import { HOUSES, GRADES } from "../config.js";
import { listenStudents, saveStudent, deleteStudent, bulkImportStudents } from "../services/student-service.js";
import { escapeHtml, houseById } from "../utils.js";
import { pageHeader, notice, optionList, setBusy } from "../ui/dom.js";

let unsubscribe = null;
let students = [];
let editingId = null;

function drawStudents(ctx) {
  const target = document.getElementById("student-list");
  if (!target) return;
  const filter = document.getElementById("student-filter")?.value.toLowerCase() || "";
  const grade = document.getElementById("student-grade-filter")?.value || "";
  let rows = students;
  if (filter) rows = rows.filter((s) => `${s.name || s.displayName || ""} ${s.grade || ""} ${s.house || ""}`.toLowerCase().includes(filter));
  if (grade) rows = rows.filter((s) => s.grade === grade);

  target.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Name</th><th>Grade</th><th>House</th><th>Actions</th></tr></thead>
    <tbody>
      ${rows.map((s) => `
        <tr>
          <td>${escapeHtml(s.name || s.displayName || "")}</td>
          <td>${escapeHtml(s.grade || "")}</td>
          <td>${escapeHtml(houseById(s.house).name)}</td>
          <td class="btn-row">
            ${ctx.can("canManageStudents") ? `<button class="btn small secondary" data-edit-student="${escapeHtml(s.id)}">Edit</button><button class="btn small danger" data-delete-student="${escapeHtml(s.id)}">Delete</button>` : ""}
          </td>
        </tr>`).join("")}
    </tbody>
  </table></div>`;

  target.querySelectorAll("[data-edit-student]").forEach((button) => {
    button.addEventListener("click", () => {
      const s = students.find((row) => row.id === button.dataset.editStudent);
      if (!s) return;
      editingId = s.id;
      const form = document.getElementById("student-form");
      form.name.value = s.name || s.displayName || "";
      form.grade.value = s.grade || "";
      form.house.value = s.house || "centaurs";
      document.getElementById("student-save-label").textContent = "Update student";
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  target.querySelectorAll("[data-delete-student]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this student?")) return;
      try {
        await deleteStudent(button.dataset.deleteStudent);
        ctx.toast("Student deleted.", "success");
      } catch (error) {
        console.error(error);
        ctx.toast(error.message || "Could not delete student.", "danger");
      }
    });
  });
}

export function renderStudents(ctx) {
  if (unsubscribe) unsubscribe();
  const canManage = ctx.can("canManageStudents");

  ctx.setMain(`${pageHeader("Students", "Use the existing students collection for AR/DR and attendance.")}
    <div id="student-toast"></div>
    <div class="grid ${canManage ? "cols-2" : ""}">
      ${canManage ? `<div class="card">
        <h2>Add / edit student</h2>
        <form id="student-form" class="form-grid">
          <div class="field"><label>Name</label><input name="name" required /></div>
          <div class="form-grid cols-2">
            <div class="field"><label>Grade</label><select name="grade" required>${optionList(GRADES)}</select></div>
            <div class="field"><label>House</label><select name="house" required>${optionList(HOUSES.map((h) => ({ value: h.id, label: h.name })))}</select></div>
          </div>
          <div class="btn-row">
            <button class="btn gold" id="student-save-label" type="submit">Save student</button>
            <button class="btn secondary" id="student-clear" type="button">Clear</button>
          </div>
        </form>
        <div class="divider"></div>
        <h3>Bulk import JSON</h3>
        <p class="muted small">Paste an array like [{"name":"Jane Doe","grade":"6sA","house":"centaurs"}]</p>
        <textarea id="student-import-json" placeholder='[{"name":"Jane Doe","grade":"6sA","house":"centaurs"}]'></textarea>
        <button id="student-import-button" class="btn secondary mt-2">Import students</button>
      </div>` : ""}
      <div class="card">
        <h2>Roster</h2>
        <div class="btn-row">
          <input id="student-filter" placeholder="Search students" />
          <select id="student-grade-filter"><option value="">All grades</option>${optionList(GRADES)}</select>
        </div>
        <div id="student-list" class="mt-3">Loading...</div>
      </div>
    </div>`);

  ctx.toast = (message, type = "blue") => {
    const target = document.getElementById("student-toast");
    if (target) target.innerHTML = notice(message, type);
    setTimeout(() => { if (target) target.innerHTML = ""; }, 3500);
  };

  if (canManage) {
    const form = document.getElementById("student-form");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const done = setBusy(form.querySelector("button[type='submit']"));
      try {
        await saveStudent({ id: editingId, name: form.name.value, grade: form.grade.value, house: form.house.value, actorEmail: ctx.user.email });
        ctx.toast(editingId ? "Student updated." : "Student added.", "success");
        editingId = null;
        form.reset();
        document.getElementById("student-save-label").textContent = "Save student";
      } catch (error) {
        console.error(error);
        ctx.toast(error.message || "Could not save student.", "danger");
      } finally {
        done();
      }
    });
    document.getElementById("student-clear").addEventListener("click", () => {
      editingId = null;
      form.reset();
      document.getElementById("student-save-label").textContent = "Save student";
    });
    document.getElementById("student-import-button").addEventListener("click", async (event) => {
      const text = document.getElementById("student-import-json").value;
      let rows;
      try { rows = JSON.parse(text); } catch { ctx.toast("Invalid JSON.", "danger"); return; }
      if (!Array.isArray(rows)) { ctx.toast("JSON must be an array.", "danger"); return; }
      if (!confirm(`Import ${rows.length} students?`)) return;
      const done = setBusy(event.currentTarget, "Importing...");
      try {
        await bulkImportStudents({ students: rows, actorEmail: ctx.user.email });
        ctx.toast("Students imported.", "success");
        document.getElementById("student-import-json").value = "";
      } catch (error) {
        console.error(error);
        ctx.toast(error.message || "Import failed.", "danger");
      } finally {
        done();
      }
    });
  }

  ["student-filter", "student-grade-filter"].forEach((id) => document.getElementById(id)?.addEventListener("input", () => drawStudents(ctx)));
  unsubscribe = listenStudents((rows) => { students = rows; drawStudents(ctx); });
  ctx.registerCleanup(() => unsubscribe && unsubscribe());
}
