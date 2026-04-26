import { GRADES } from "../config.js";
import { listenStudents, deriveGradeOptions } from "../services/student-service.js";
import { listenScheduledTests, addScheduledTest, deleteScheduledTest } from "../services/calendar-service.js";
import { escapeHtml, todayInputValue, normalizeGrade, formatDateTime } from "../utils.js";
import { pageHeader, notice, optionList, setBusy } from "../ui/dom.js";

let unsubs = [];
let tests = [];
let students = [];
let currentDate = new Date();
let selectedGrade = "";
let selectedDayView = null;

function stop() {
  unsubs.forEach((fn) => fn && fn());
  unsubs = [];
  selectedDayView = null;
}

function gradeOptions() {
  return deriveGradeOptions(students).length ? deriveGradeOptions(students) : GRADES;
}

function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function testsForDate(date, grade = selectedGrade) {
  return tests
    .filter((t) => t.date === date && (!grade || normalizeGrade(t.class) === normalizeGrade(grade)))
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
}

function canDeleteTest(ctx, test) {
  return ctx.can("canManageCalendar") && (ctx.isAdmin || ctx.isCoordinator || test.teacherEmail === ctx.user.email);
}

function drawClassOptions() {
  const classSelect = document.querySelector("[name='className']");
  const gradeFilter = document.getElementById("calendar-grade-filter");
  const options = gradeOptions();
  if (classSelect) {
    const current = classSelect.value;
    classSelect.innerHTML = `<option value="">Choose class</option>${optionList(options)}`;
    classSelect.value = current || selectedGrade || "";
  }
  if (gradeFilter) {
    const current = selectedGrade;
    gradeFilter.innerHTML = `<option value="">All grades</option>${optionList(options)}`;
    gradeFilter.value = current;
  }
}

function loadClassClass(count) {
  if (!selectedGrade || count === 0) return "";
  if (count === 1) return "load-one";
  if (count === 2) return "load-two";
  return "load-three";
}

function drawOverloadWarning() {
  const target = document.getElementById("calendar-overload-warning");
  const form = document.getElementById("test-form");
  if (!target || !form) return;
  const date = form.date.value;
  const grade = form.className.value;
  const rows = testsForDate(date, grade);
  if (!date || !grade) {
    target.innerHTML = "";
    return;
  }
  target.innerHTML = rows.length >= 3
    ? notice(`${rows.length} tests are already scheduled for ${grade} on this date. This day is overloaded.`, "danger")
    : rows.length === 2
      ? notice(`There are already 2 tests scheduled for ${grade} on this date.`, "warn")
      : rows.length === 1
        ? notice(`There is already 1 test scheduled for ${grade} on this date.`, "blue")
        : notice(`No tests currently scheduled for ${grade} on this date.`, "success");
}

function drawDayModal(ctx) {
  const target = document.getElementById("day-modal-root");
  if (!target) return;
  if (!selectedDayView) {
    target.innerHTML = "";
    return;
  }
  const rows = testsForDate(selectedDayView);
  target.innerHTML = `<div class="modal-backdrop" data-close-day-modal>
    <div class="modal-card" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
      <div class="record-top">
        <div><h2>${escapeHtml(selectedDayView)}</h2><p class="muted">${rows.length} scheduled test${rows.length === 1 ? "" : "s"}${selectedGrade ? ` for ${escapeHtml(selectedGrade)}` : ""}</p></div>
        <button class="btn secondary" data-close-day-modal>Close</button>
      </div>
      <div class="record-list mt-3">
        ${rows.length ? rows.map((test) => `<div class="record-item">
          <div class="record-top">
            <div><div class="record-title">${escapeHtml(test.time || "")} - ${escapeHtml(test.title || "Untitled")}</div><div class="muted small">${escapeHtml(test.class || "")} - ${escapeHtml(test.teacher || test.teacherEmail || "")}</div></div>
            ${canDeleteTest(ctx, test) ? `<button class="btn small danger" data-delete-test="${escapeHtml(test.id)}">Delete</button>` : ""}
          </div>
        </div>`).join("") : `<p class="muted">No tests for this day.</p>`}
      </div>
    </div>
  </div>`;
  target.querySelectorAll("[data-close-day-modal]").forEach((node) => node.addEventListener("click", () => { selectedDayView = null; drawDayModal(ctx); }));
  target.querySelectorAll("[data-delete-test]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("Delete this scheduled test?")) return;
    await deleteScheduledTest(button.dataset.deleteTest);
    ctx.toast("Test deleted.", "success");
  }));
}

function drawCalendar(ctx) {
  const target = document.getElementById("calendar-grid");
  const title = document.getElementById("calendar-month-title");
  if (!target || !title) return;
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  title.textContent = currentDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const cells = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<div class="calendar-weekday">${day}</div>`);
  for (let i = 0; i < firstDay; i++) cells.push(`<div class="calendar-day empty"></div>`);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = isoDate(year, month, day);
    const dayTests = testsForDate(date);
    cells.push(`<div class="calendar-day ${loadClassClass(dayTests.length)}" data-calendar-day="${date}">
      <div class="day-number"><span>${day}</span>${dayTests.length ? `<strong>${dayTests.length}</strong>` : ""}</div>
      <div class="calendar-test-list">
        ${dayTests.map((test) => `
          <div class="test-pill" title="${escapeHtml(test.title || "")}">
            <strong>${escapeHtml(test.time || "")}</strong> ${escapeHtml(test.title || "")}
            <span>${escapeHtml(test.teacher || test.teacherEmail || "")}${selectedGrade ? "" : ` - ${escapeHtml(test.class || "")}`}</span>
            ${canDeleteTest(ctx, test) ? `<button class="btn link small" data-delete-test="${escapeHtml(test.id)}">x</button>` : ""}
          </div>`).join("")}
      </div>
      ${dayTests.length ? `<div class="mobile-tap-hint">Tap to view</div>` : ""}
    </div>`);
  }
  target.innerHTML = cells.join("");

  target.querySelectorAll("[data-calendar-day]").forEach((cell) => {
    cell.addEventListener("click", () => {
      selectedDayView = cell.dataset.calendarDay;
      const dateInput = document.querySelector("[name='date']");
      if (dateInput) {
        dateInput.value = selectedDayView;
        drawOverloadWarning();
      }
      drawDayModal(ctx);
    });
  });

  target.querySelectorAll("[data-delete-test]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
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
  drawOverloadWarning();
  drawDayModal(ctx);
}

function drawUpcoming() {
  const target = document.getElementById("upcoming-tests");
  if (!target) return;
  const today = todayInputValue();
  const rows = tests
    .filter((test) => test.date >= today && (!selectedGrade || normalizeGrade(test.class) === normalizeGrade(selectedGrade)))
    .sort((a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`))
    .slice(0, 12);
  target.innerHTML = rows.length ? `<div class="record-list compact">
    ${rows.map((test) => `<div class="record-item"><div class="record-top"><div><strong>${escapeHtml(test.title || "Untitled")}</strong><div class="muted small">${escapeHtml(test.date || "")} ${escapeHtml(test.time || "")} - ${escapeHtml(test.class || "")}</div></div><span class="badge blue">${escapeHtml(test.teacher || test.teacherEmail || "")}</span></div></div>`).join("")}
  </div>` : `<p class="muted">No upcoming tests for this filter.</p>`;
}

export function renderCalendar(ctx) {
  stop();
  const canManage = ctx.can("canManageCalendar");

  ctx.setMain(`${pageHeader("Test Calendar", "Schedule and view tests using the existing scheduled_tests collection.")}
    <div id="calendar-toast"></div>
    <div id="day-modal-root"></div>
    <div class="grid ${canManage ? "cols-3" : ""}">
      <div class="card ${canManage ? "wide-2" : ""}">
        <div class="record-top">
          <h2 id="calendar-month-title">Calendar</h2>
          <div class="btn-row">
            <select id="calendar-grade-filter"><option value="">All grades</option>${optionList(GRADES)}</select>
            <button id="calendar-prev" class="btn small secondary">Prev</button>
            <button id="calendar-today" class="btn small secondary">Today</button>
            <button id="calendar-next" class="btn small secondary">Next</button>
          </div>
        </div>
        <div class="calendar-grid mt-3" id="calendar-grid"></div>
        <div class="calendar-legend mt-3">
          <span><i class="legend-one"></i>1 test</span>
          <span><i class="legend-two"></i>2 tests</span>
          <span><i class="legend-three"></i>3+ tests overloaded</span>
        </div>
      </div>
      <div class="grid">
        ${canManage ? `<div class="card">
          <h2>Add test</h2>
          <form id="test-form" class="form-grid">
            <div class="field"><label>Title</label><input name="title" required /></div>
            <div class="form-grid cols-2">
              <div class="field"><label>Date</label><input name="date" type="date" value="${todayInputValue()}" required /></div>
              <div class="field"><label>Time</label><input name="time" type="time" required /></div>
            </div>
            <div class="field"><label>Class</label><select name="className" required><option value="">Choose class</option>${optionList(GRADES)}</select></div>
            <div id="calendar-overload-warning"></div>
            <div class="field"><label>Teacher display</label><input name="teacher" value="${escapeHtml(ctx.user.email.split("@")[0].toUpperCase())}" /></div>
            <button class="btn gold" type="submit">Schedule test</button>
          </form>
        </div>` : ""}
        <div class="card"><h2>Upcoming</h2><div id="upcoming-tests">Loading...</div></div>
      </div>
    </div>`);

  ctx.toast = (message, type = "blue") => {
    const target = document.getElementById("calendar-toast");
    if (target) target.innerHTML = notice(message, type);
    setTimeout(() => { if (target) target.innerHTML = ""; }, 3500);
  };

  document.getElementById("calendar-prev").addEventListener("click", () => { currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1); drawCalendar(ctx); });
  document.getElementById("calendar-next").addEventListener("click", () => { currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1); drawCalendar(ctx); });
  document.getElementById("calendar-today").addEventListener("click", () => { currentDate = new Date(); drawCalendar(ctx); });
  document.getElementById("calendar-grade-filter").addEventListener("change", (event) => { selectedGrade = event.target.value; drawCalendar(ctx); drawUpcoming(); drawClassOptions(); });

  if (canManage) {
    const form = document.getElementById("test-form");
    form.date.addEventListener("change", drawOverloadWarning);
    form.className.addEventListener("change", drawOverloadWarning);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
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
        drawOverloadWarning();
      } catch (error) {
        console.error(error);
        ctx.toast(error.message || "Could not schedule test.", "danger");
      } finally {
        done();
      }
    });
  }

  unsubs.push(listenStudents((rows) => { students = rows; drawClassOptions(); drawCalendar(ctx); drawUpcoming(); }));
  unsubs.push(listenScheduledTests((rows) => { tests = rows; drawCalendar(ctx); drawUpcoming(); }));
  ctx.registerCleanup(stop);
}
