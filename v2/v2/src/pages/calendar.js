import { GRADES } from "../config.js";
import { listenScheduledTests, addScheduledTest, deleteScheduledTest } from "../services/calendar-service.js";
import { escapeHtml, todayInputValue } from "../utils.js";
import { pageHeader, notice, optionList, setBusy } from "../ui/dom.js";

let unsubscribe = null;
let tests = [];
let currentDate = new Date();

function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function drawCalendar(ctx) {
  const target = document.getElementById("calendar-grid");
  const title = document.getElementById("calendar-month-title");
  if (!target || !title) return;
  const selectedGrade = document.getElementById("calendar-grade-filter")?.value || "";
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  title.textContent = currentDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(`<div class="calendar-day empty"></div>`);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = isoDate(year, month, day);
    const dayTests = tests
      .filter((t) => t.date === date && (!selectedGrade || t.class === selectedGrade))
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    cells.push(`<div class="calendar-day">
      <div class="day-number">${day}</div>
      ${dayTests.map((t) => `
        <span class="test-pill" title="${escapeHtml(t.title || "")}">
          ${escapeHtml(t.time || "")} ${escapeHtml(t.class || "")} · ${escapeHtml(t.title || "")}
          ${ctx.can("canManageCalendar") ? `<button class="btn link small" data-delete-test="${escapeHtml(t.id)}">×</button>` : ""}
        </span>`).join("")}
    </div>`);
  }
  target.innerHTML = cells.join("");

  target.querySelectorAll("[data-delete-test]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!confirm("Delete this scheduled test?")) return;
      try {
        await deleteScheduledTest(button.dataset.deleteTest);
        ctx.toast("Test deleted.", "success");
      } catch (error) {
        console.error(error);
        ctx.toast(error.message || "Could not delete test.", "danger");
      }
    });
  });
}

export function renderCalendar(ctx) {
  if (unsubscribe) unsubscribe();
  const canManage = ctx.can("canManageCalendar");

  ctx.setMain(`${pageHeader("Test Calendar", "Schedule and view tests using the existing scheduled_tests collection.")}
    <div id="calendar-toast"></div>
    <div class="grid ${canManage ? "cols-2" : ""}">
      ${canManage ? `<div class="card">
        <h2>Add test</h2>
        <form id="test-form" class="form-grid">
          <div class="field"><label>Title</label><input name="title" required /></div>
          <div class="form-grid cols-3">
            <div class="field"><label>Date</label><input name="date" type="date" value="${todayInputValue()}" required /></div>
            <div class="field"><label>Time</label><input name="time" type="time" required /></div>
            <div class="field"><label>Class</label><select name="className" required>${optionList(GRADES)}</select></div>
          </div>
          <div class="field"><label>Teacher display</label><input name="teacher" value="${escapeHtml(ctx.user.email.split("@")[0].toUpperCase())}" /></div>
          <button class="btn gold" type="submit">Schedule test</button>
        </form>
      </div>` : ""}
      <div class="card">
        <div class="record-top">
          <h2 id="calendar-month-title">Calendar</h2>
          <div class="btn-row">
            <button id="calendar-prev" class="btn small secondary">Prev</button>
            <button id="calendar-next" class="btn small secondary">Next</button>
          </div>
        </div>
        <div class="btn-row mt-2">
          <select id="calendar-grade-filter"><option value="">All grades</option>${optionList(GRADES)}</select>
        </div>
        <div class="calendar-grid mt-3" id="calendar-grid"></div>
      </div>
    </div>`);

  ctx.toast = (message, type = "blue") => {
    const target = document.getElementById("calendar-toast");
    if (target) target.innerHTML = notice(message, type);
    setTimeout(() => { if (target) target.innerHTML = ""; }, 3500);
  };

  document.getElementById("calendar-prev").addEventListener("click", () => { currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1); drawCalendar(ctx); });
  document.getElementById("calendar-next").addEventListener("click", () => { currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1); drawCalendar(ctx); });
  document.getElementById("calendar-grade-filter").addEventListener("change", () => drawCalendar(ctx));

  if (canManage) {
    document.getElementById("test-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const done = setBusy(form.querySelector("button[type='submit']"));
      try {
        await addScheduledTest({
          user: ctx.user,
          title: form.title.value,
          date: form.date.value,
          time: form.time.value,
          className: form.className.value,
          teacher: form.teacher.value
        });
        ctx.toast("Test scheduled.", "success");
        form.title.value = "";
        form.time.value = "";
      } catch (error) {
        console.error(error);
        ctx.toast(error.message || "Could not schedule test.", "danger");
      } finally {
        done();
      }
    });
  }

  unsubscribe = listenScheduledTests((rows) => { tests = rows; drawCalendar(ctx); });
  ctx.registerCleanup(() => unsubscribe && unsubscribe());
}
