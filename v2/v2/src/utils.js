import { FALLBACK_ADMIN_EMAIL, HOUSES, PERMISSIONS } from "./config.js";

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
  return HOUSES.find((h) => h.id === id) || { id, name: id || "Unknown", color: "#64748b" };
}

export function getSafeArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value) return [value];
  return [];
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

export function readForm(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}
