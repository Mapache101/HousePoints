import { listenScheduledTests } from "../services/calendar-service.js";
import { escapeHtml, normalizeGrade, todayInputValue } from "../utils.js";
import { pageHeader, optionList } from "../ui/dom.js";

let unsubscribe = null;
let tests = [];
let currentDate = new Date();
let selectedGrade = "";
let selectedDayView = null;

function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function gradeOptions() {
  return [...new Set(tests.map((t) => normalizeGrade(t.class)).filter(Boolean))].sort();
}

function testsForDate(date, grade = selectedGrade) {
  return tests
    .filter((t) => t.date === date && (!grade || normalizeGrade(t.class) === normalizeGrade(grade)))
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
}

function loadClass(count) {
  if (!selectedGrade || count === 0) return "";
  if (count === 1) return "load-one";
  if (count === 2) return "load-two";
  return "load-three";
}

function drawDayModal() {
  const target = document.getElementById("public-calendar-modal-root");
  if (!target) return;
  if (!selectedDayView) {
    target.innerHTML = "";
    return;
  }
  const rows = testsForDate(selectedDayView);
  target.innerHTML = `<div class="modal-backdrop" data-close-public-calendar-modal>
    <div class="modal-card" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
      <div class="record-top">
        <div><h2>${escapeHtml(selectedDayView)}</h2><p class="muted">${rows.length} scheduled test${rows.length === 1 ? "" : "s"}${selectedGrade ? ` for ${escapeHtml(selectedGrade)}` : ""}</p></div>
        <button class="btn secondary" data-close-public-calendar-modal>Close</button>
      </div>
      <div class="record-list mt-3">
        ${rows.length ? rows.map((test) => `<div class="record-item"><div class="record-title">${escapeHtml(test.time || "")} - ${escapeHtml(test.title || "Untitled")}</div><div class="muted small">${escapeHtml(test.class || "")} - ${escapeHtml(test.teacher || "")}</div></div>`).join("") : `<p class="muted">No tests for this day.</p>`}
      </div>
    </div>
  </div>`;
  target.querySelectorAll("[data-close-public-calendar-modal]").forEach((node) => node.addEventListener("click", () => { selectedDayView = null; drawDayModal(); }));
}

function drawCalendar() {
  const target = document.getElementById("public-calendar-grid");
  const title = document.getElementById("public-calendar-month-title");
  const gradeFilter = document.getElementById("public-calendar-grade-filter");
  if (!target || !title || !gradeFilter) return;

  const currentFilter = selectedGrade;
  gradeFilter.innerHTML = `<option value="">All grades</option>${optionList(gradeOptions())}`;
  gradeFilter.value = currentFilter;

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
    cells.push(`<div class="calendar-day ${loadClass(dayTests.length)}" data-public-calendar-day="${date}">
      <div class="day-number"><span>${day}</span>${dayTests.length ? `<strong>${dayTests.length}</strong>` : ""}</div>
      <div class="calendar-test-list">
        ${dayTests.slice(0, 4).map((test) => `<div class="test-pill"><strong>${escapeHtml(test.time || "")}</strong> ${escapeHtml(test.title || "")}<span>${escapeHtml(test.class || "")} - ${escapeHtml(test.teacher || "")}</span></div>`).join("")}
      </div>
      ${dayTests.length ? `<div class="mobile-tap-hint">Tap to view</div>` : ""}
    </div>`);
  }
  target.innerHTML = cells.join("");
  target.querySelectorAll("[data-public-calendar-day]").forEach((cell) => cell.addEventListener("click", () => {
    selectedDayView = cell.dataset.publicCalendarDay;
    drawDayModal();
  }));
  drawUpcoming();
  drawDayModal();
}

function drawUpcoming() {
  const target = document.getElementById("public-upcoming-tests");
  if (!target) return;
  const today = todayInputValue();
  const rows = tests
    .filter((test) => test.date >= today && (!selectedGrade || normalizeGrade(test.class) === normalizeGrade(selectedGrade)))
    .sort((a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`))
    .slice(0, 12);
  target.innerHTML = rows.length ? `<div class="record-list compact">${rows.map((test) => `<div class="record-item"><strong>${escapeHtml(test.title || "Untitled")}</strong><span class="muted small">${escapeHtml(test.date || "")} ${escapeHtml(test.time || "")} - ${escapeHtml(test.class || "")}</span></div>`).join("")}</div>` : `<p class="muted">No upcoming tests for this filter.</p>`;
}

export function renderPublicCalendar(ctx) {
  if (unsubscribe) unsubscribe();
  ctx.setMain(`${pageHeader("Public Test Calendar", "Read-only testing schedule from the existing scheduled_tests collection.")}
    <div id="public-calendar-modal-root"></div>
    <div class="grid cols-3">
      <div class="card wide-2">
        <div class="record-top">
          <h2 id="public-calendar-month-title">Calendar</h2>
          <div class="btn-row">
            <select id="public-calendar-grade-filter"><option value="">All grades</option></select>
            <button id="public-calendar-prev" class="btn small secondary">Prev</button>
            <button id="public-calendar-today" class="btn small secondary">Today</button>
            <button id="public-calendar-next" class="btn small secondary">Next</button>
          </div>
        </div>
        <div class="calendar-grid mt-3" id="public-calendar-grid"></div>
      </div>
      <div class="card"><h2>Upcoming</h2><div id="public-upcoming-tests">Loading...</div></div>
    </div>`);
  document.getElementById("public-calendar-prev").addEventListener("click", () => { currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1); drawCalendar(); });
  document.getElementById("public-calendar-next").addEventListener("click", () => { currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1); drawCalendar(); });
  document.getElementById("public-calendar-today").addEventListener("click", () => { currentDate = new Date(); drawCalendar(); });
  document.getElementById("public-calendar-grade-filter").addEventListener("change", (event) => { selectedGrade = event.target.value; drawCalendar(); });
  unsubscribe = listenScheduledTests((rows) => { tests = rows; drawCalendar(); });
  ctx.registerCleanup(() => unsubscribe && unsubscribe());
}
