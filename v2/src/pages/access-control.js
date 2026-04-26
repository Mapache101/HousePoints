import { PERMISSIONS } from "../config.js";
import { listenAccessDirectory, saveAccessRecord } from "../services/access-service.js";
import { defaultRoles, defaultPermissions, escapeHtml, normalizeEmail } from "../utils.js";
import { pageHeader, notice, setBusy } from "../ui/dom.js";

let unsub = null;
let state = { users: [], invites: [] };

function permissionControls(prefix, permissions = {}) {
  return `<div class="permission-grid">
    ${PERMISSIONS.map((p) => `
      <label class="permission-chip">
        <input type="checkbox" name="${prefix}:${p.key}" ${permissions[p.key] ? "checked" : ""} />
        <span>${escapeHtml(p.label)}</span>
      </label>
    `).join("")}
  </div>`;
}

function roleControls(prefix, roles = {}) {
  return `
    <div class="btn-row">
      <label class="checkbox-row"><input type="checkbox" name="${prefix}:role:teacher" ${roles.teacher !== false ? "checked" : ""} /> Teacher</label>
      <label class="checkbox-row"><input type="checkbox" name="${prefix}:role:coordinator" ${roles.coordinator ? "checked" : ""} /> Coordinator</label>
      <label class="checkbox-row"><input type="checkbox" name="${prefix}:role:admin" ${roles.admin ? "checked" : ""} /> Admin</label>
      <label class="checkbox-row"><input type="checkbox" name="${prefix}:active" ${roles.active === false ? "" : "checked"} /> Active</label>
    </div>`;
}

function readAccessForm(form, prefix) {
  const roles = {
    teacher: form.querySelector(`[name="${prefix}:role:teacher"]`)?.checked ?? true,
    coordinator: form.querySelector(`[name="${prefix}:role:coordinator"]`)?.checked ?? false,
    admin: form.querySelector(`[name="${prefix}:role:admin"]`)?.checked ?? false
  };
  const permissions = Object.fromEntries(PERMISSIONS.map((p) => [p.key, form.querySelector(`[name="${prefix}:${p.key}"]`)?.checked ?? false]));
  return { roles, permissions, active: form.querySelector(`[name="${prefix}:active"]`)?.checked ?? true };
}

function accessRow(item) {
  const prefix = `item-${item.kind}-${item.id}`;
  const roles = defaultRoles(item.roles || {});
  roles.active = item.active !== false;
  const permissions = defaultPermissions(item.permissions || {});
  return `
    <details class="record-item" data-access-id="${escapeHtml(item.id)}" data-kind="${escapeHtml(item.kind)}">
      <summary class="record-top">
        <span>
          <span class="record-title">${escapeHtml(item.email || "No email")}</span>
          <span class="badge ${item.kind === "invite" ? "warn" : "blue"}">${item.kind === "invite" ? "Invite" : "User"}</span>
          ${item.active === false ? `<span class="badge danger">Disabled</span>` : `<span class="badge success">Active</span>`}
        </span>
        <span class="muted small">${roles.admin ? "Admin" : roles.coordinator ? "Coordinator" : "Teacher"}</span>
      </summary>
      <form class="access-edit-form mt-3" data-prefix="${escapeHtml(prefix)}" data-email="${escapeHtml(item.email || "")}" data-uid="${item.kind === "user" ? escapeHtml(item.id) : ""}">
        <div class="form-grid cols-2">
          <div class="field">
            <label>Display name</label>
            <input name="displayName" value="${escapeHtml(item.displayName || "")}" />
          </div>
          <div class="field">
            <label>Email</label>
            <input name="email" value="${escapeHtml(item.email || "")}" />
          </div>
        </div>
        <div class="mt-3">${roleControls(prefix, roles)}</div>
        <div class="divider"></div>
        ${permissionControls(prefix, permissions)}
        <div class="btn-row mt-3">
          <button class="btn small" type="submit">Save access</button>
        </div>
      </form>
    </details>`;
}

function renderDirectory() {
  const target = document.getElementById("access-directory");
  if (!target) return;
  const all = [...state.users, ...state.invites];
  if (!all.length) {
    target.innerHTML = `<div class="card center"><h3>No access records yet</h3><p class="muted">Add the first teacher or admin below.</p></div>`;
    return;
  }
  target.innerHTML = `<div class="record-list">${all.map(accessRow).join("")}</div>`;
  bindSaveForms();
}

function bindSaveForms() {
  document.querySelectorAll(".access-edit-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type='submit']");
      const done = setBusy(button);
      const prefix = form.dataset.prefix;
      const values = readAccessForm(form, prefix);
      try {
        await saveAccessRecord({
          actor: window.__SCIS_CTX__.user,
          uid: form.dataset.uid || null,
          targetEmail: form.querySelector("[name='email']").value,
          displayName: form.querySelector("[name='displayName']").value,
          roles: values.roles,
          permissions: values.permissions,
          active: values.active
        });
        window.__SCIS_CTX__.toast("Access updated.", "success");
      } catch (error) {
        console.error(error);
        window.__SCIS_CTX__.toast(error.message || "Failed to save access.", "danger");
      } finally {
        done();
      }
    });
  });
}

export function renderAccessControl(ctx) {
  if (!ctx.can("canManageRoles")) {
    ctx.setMain(`${pageHeader("Access Control", "Manage who can use each part of the portal.")}${notice("You need the canManageRoles permission to use this dashboard.", "danger")}`);
    return;
  }

  if (unsub) unsub();
  ctx.setMain(`${pageHeader("Access Control", "Assign admins, coordinators, AR access, house point access, attendance, calendar, and student management.")}
    <div id="access-toast"></div>
    <div class="grid cols-2">
      <div class="card">
        <h2>Add user or invite</h2>
        <form id="add-access-form" class="form-grid">
          <div class="form-grid cols-2">
            <div class="field">
              <label>Email</label>
              <input name="email" type="email" placeholder="teacher@scis-bo.com" required />
            </div>
            <div class="field">
              <label>Display name</label>
              <input name="displayName" placeholder="Optional" />
            </div>
          </div>
          ${roleControls("new", { teacher: true, active: true })}
          <div class="divider"></div>
          ${permissionControls("new", defaultPermissions())}
          <div class="btn-row">
            <button class="btn gold" type="submit">Add / update access</button>
          </div>
        </form>
      </div>
      <div class="card">
        <h2>How this works</h2>
        <p class="muted">If the teacher has never signed in, the record is saved as an invite by email. When they sign in with Microsoft, V2 converts it into a UID-based access record.</p>
        <p class="muted">Admin automatically includes all permissions. Coordinator automatically includes approval and point processing permissions.</p>
      </div>
    </div>
    <div class="card mt-4">
      <h2>Current access</h2>
      <div id="access-directory">Loading...</div>
    </div>`);

  window.__SCIS_CTX__ = ctx;

  ctx.toast = (message, type = "blue") => {
    const target = document.getElementById("access-toast");
    if (target) target.innerHTML = notice(message, type);
    setTimeout(() => { if (target) target.innerHTML = ""; }, 3500);
  };

  document.getElementById("add-access-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = normalizeEmail(form.email.value);
    if (!email) return;
    const button = form.querySelector("button[type='submit']");
    const done = setBusy(button, "Saving...");
    const values = readAccessForm(form, "new");
    try {
      await saveAccessRecord({
        actor: ctx.user,
        targetEmail: email,
        displayName: form.displayName.value,
        roles: values.roles,
        permissions: values.permissions,
        active: values.active
      });
      ctx.toast("Access saved. The user can now sign in with Microsoft.", "success");
      form.reset();
    } catch (error) {
      console.error(error);
      ctx.toast(error.message || "Failed to save access.", "danger");
    } finally {
      done();
    }
  });

  unsub = listenAccessDirectory((directory) => {
    state = directory;
    renderDirectory();
  });
  ctx.registerCleanup(() => unsub && unsub());
}
