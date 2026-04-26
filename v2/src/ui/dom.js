import { escapeHtml } from "../utils.js";

export function pageHeader(title, subtitle = "", actions = "") {
  return `
    <div class="page-header">
      <div>
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
      </div>
      ${actions ? `<div class="btn-row">${actions}</div>` : ""}
    </div>
  `;
}

export function notice(message, type = "blue") {
  return `<div class="notice ${type}">${escapeHtml(message)}</div>`;
}

export function requirePermission(ctx, permission, message = "You do not have permission to view this page.") {
  if (ctx.can(permission)) return "";
  return `${pageHeader("Permission required", message)}${notice("Ask an admin to update your access in Admin > Access Control.", "warn")}`;
}

export function optionList(items, selected = "") {
  return items.map((item) => {
    const value = typeof item === "string" ? item : item.value;
    const label = typeof item === "string" ? item : item.label;
    return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

export function emptyState(title, message) {
  return `<div class="card center"><h3>${escapeHtml(title)}</h3><p class="muted">${escapeHtml(message)}</p></div>`;
}

export function bind(root, selector, event, handler) {
  root.querySelectorAll(selector).forEach((node) => node.addEventListener(event, handler));
}

export function formValue(root, name) {
  return root.querySelector(`[name="${CSS.escape(name)}"]`)?.value || "";
}

export function setBusy(button, busyText = "Saving...") {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = busyText;
  return () => {
    button.disabled = false;
    button.textContent = original;
  };
}
