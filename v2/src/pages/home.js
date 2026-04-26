import { pageHeader, notice } from "../ui/dom.js";

export function renderHome(ctx) {
  const access = ctx.access || {};
  const permissions = access.permissions || {};
  const allowed = Object.entries(permissions).filter(([, v]) => v).map(([k]) => k);

  ctx.setMain(`${pageHeader("Unified Portal", "One place for House Cup, AR/DR, attendance, calendar, students, and access control.")}
    ${access.legacyOnly ? notice("You are signed in, but no V2 access record exists yet. Ask an admin to add permissions for your email.", "warn") : ""}
    <div class="grid cols-3">
      <a class="card" href="#/points"><h3>House Points</h3><p class="muted">Submit, review, and process house rankings.</p></a>
      <a class="card" href="#/reflections"><h3>AR / DR</h3><p class="muted">Submit records and manage the coordinator queue.</p></a>
      <a class="card" href="#/attendance"><h3>Attendance</h3><p class="muted">Submit class attendance to the existing attendance collection.</p></a>
      <a class="card" href="#/calendar"><h3>Test Calendar</h3><p class="muted">Schedule shared tests by grade and date.</p></a>
      <a class="card" href="#/students"><h3>Students</h3><p class="muted">Maintain the existing student roster.</p></a>
      <a class="card" href="#/access"><h3>Access Control</h3><p class="muted">Assign admins, coordinators, AR access, and points access.</p></a>
    </div>
    <div class="card mt-4">
      <h3>Your access</h3>
      <p><strong>Email:</strong> ${ctx.user?.email || ""}</p>
      <p><strong>Roles:</strong> ${Object.entries(access.roles || {}).filter(([, v]) => v).map(([k]) => `<span class="badge blue">${k}</span>`).join(" ") || "None"}</p>
      <p><strong>Permissions:</strong> ${allowed.map((k) => `<span class="badge success">${k}</span>`).join(" ") || "No feature permissions yet"}</p>
    </div>`);
}
