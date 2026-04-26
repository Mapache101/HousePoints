import { FALLBACK_ADMIN_EMAIL, HOUSES, PERMISSIONS, GRADES } from "./config.js";

export function normalizeEmail(email = "") {
  return String(email || "").trim().toLowerCase();
}

export function emailKey(email = "") {
  return normalizeEmail(email).replace(/[^a-z0-9_-]/g, "_");
}

export function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatDateTime(value) {
  if (!value) return "";
  let date;
  if (typeof value.toDate === "function") date = value.toDate();
  else if (value.seconds) date = new Date(value.seconds * 1000);
  else date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    + " "
    + date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function formatDateOnly(value) {
  if (!value) return "";
  const date = typeof value.toDate === "function" ? value.toDate() : value.seconds ? new Date(value.seconds * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value.seconds) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function todayInputValue() {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
}

export function defaultRoles(overrides = {}) {
  return { teacher: true, coordinator: false, admin: false, ...overrides };
}

export function defaultPermissions(overrides = {}) {
  const base = Object.fromEntries(PERMISSIONS.map((p) => [p.key, false]));
  return { ...base, ...overrides };
}

export function adminPermissions() {
  return Object.fromEntries(PERMISSIONS.map((p) => [p.key, true]));
}

export function buildAccessDoc({ uid = null, email, displayName = "", roles = {}, permissions = {}, active = true, createdBy = "system" }) {
  const normalized = normalizeEmail(email);
  const mergedRoles = defaultRoles(roles);
  const mergedPermissions = mergedRoles.admin ? adminPermissions() : defaultPermissions(permissions);
  if (mergedRoles.coordinator) {
    mergedPermissions.canApproveReflections = true;
    mergedPermissions.canProcessHousePoints = true;
  }
  return {
    ...(uid ? { uid } : {}),
    email: normalized,
    displayName,
    active,
    roles: mergedRoles,
    permissions: mergedPermissions,
    createdAt: new Date().toISOString(),
    createdBy,
    updatedAt: new Date().toISOString(),
    updatedBy: createdBy
  };
}

export function hasRole(access, role) {
  if (!access || access.active === false) return false;
  return access.roles?.admin === true || access.roles?.[role] === true;
}

export function hasPermission(access, permission) {
  if (!access || access.active === false) return false;
  if (access.roles?.admin === true) return true;
  return access.permissions?.[permission] === true;
}

export function isFallbackAdmin(user) {
  return normalizeEmail(user?.email) === normalizeEmail(FALLBACK_ADMIN_EMAIL);
}

export function houseById(id) {
  return HOUSES.find((h) => h.id === id) || { id, name: id || "Unknown", color: "#64748b", bg: "slate" };
}

export function getSafeArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value) return [value];
  return [];
}

export function normalizeGrade(grade = "") {
  const raw = String(grade || "").trim();
  if (!raw) return "";
  return raw
    .replace(/s1/gi, "sA")
    .replace(/s2/gi, "sB")
    .replace(/\s+/g, "");
}

export function studentName(student = {}) {
  return student.displayName || student.name || student.studentName || "";
}

export function sortGrades(grades = []) {
  const unique = [...new Set(grades.map(normalizeGrade).filter(Boolean))];
  const rank = (g) => {
    const match = String(g).match(/^(\d+)[sS]([A-Za-z])$/);
    if (!match) return [999, g];
    return [Number(match[1]), match[2].toUpperCase()];
  };
  return unique.sort((a, b) => {
    const [na, sa] = rank(a);
    const [nb, sb] = rank(b);
    return na === nb ? String(sa).localeCompare(String(sb)) : na - nb;
  });
}

export function gradesFromStudents(students = [], fallback = GRADES) {
  const derived = sortGrades(students.map((s) => s.grade));
  return derived.length ? derived : fallback;
}

export function statusLabel(status) {
  if (status === "P") return "Present";
  if (status === "L") return "Late";
  if (status === "A") return "Absent";
  return "Unmarked";
}

export function nextAttendanceStatus(current) {
  if (current === "P") return "L";
  if (current === "L") return "A";
  if (current === "A") return "";
  return "P";
}

export function countBy(rows, getKey) {
  const counts = {};
  for (const row of rows) {
    const key = getKey(row) || "Unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export function topEntries(counts, limit = 10) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

export function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function downloadText(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename, headers, rows) {
  const csv = [headers.map(csvCell).join(",")]
    .concat(rows.map((row) => row.map(csvCell).join(",")))
    .join("\n");
  downloadText(filename, csv, "text/csv;charset=utf-8");
}

export function readForm(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}
