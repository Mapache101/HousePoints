import { auth, onAuthStateChanged } from "./firebase.js";
import { FALLBACK_ADMIN_EMAIL } from "./config.js";
import { hasPermission, hasRole, isFallbackAdmin, escapeHtml } from "./utils.js";
import { signOutCurrentUser } from "./services/auth-service.js";
import { listenCurrentAccess } from "./services/access-service.js";
import { renderPublicDashboard } from "./pages/public-dashboard.js";
import { renderPublicCalendar } from "./pages/public-calendar.js";
import { renderLogin } from "./pages/login.js";
import { renderHome } from "./pages/home.js";
import { renderAccessControl } from "./pages/access-control.js";
import { renderPoints } from "./pages/points.js";
import { renderReflections } from "./pages/reflections.js";
import { renderStudents } from "./pages/students.js";
import { renderAttendance } from "./pages/attendance.js";
import { renderCalendar } from "./pages/calendar.js";
import { renderReports } from "./pages/reports.js";
import { renderAudit } from "./pages/audit.js";
import { pageHeader, notice } from "./ui/dom.js";

const appRoot = document.getElementById("app");

let currentUser = null;
let currentAccess = null;
let authReady = false;
let cleanupCallbacks = [];
let unsubscribeAccess = null;

const routes = {
  "/": { public: true, render: renderPublicDashboard },
  "/login": { public: true, render: renderLogin },
  "/public-calendar": { public: true, render: renderPublicCalendar },
  "/home": { render: renderHome },
  "/points": { permission: "canSubmitPoints", alternate: "canProcessHousePoints", render: renderPoints },
  "/reflections": { permission: "canGiveAR", alternate: "canApproveReflections", render: renderReflections },
  "/attendance": { permission: "canSubmitAttendance", render: renderAttendance },
  "/calendar": { permission: "canManageCalendar", publicForSignedIn: true, render: renderCalendar },
  "/students": { publicForSignedIn: true, render: renderStudents },
  "/reports": { role: "coordinator", render: renderReports },
  "/access": { permission: "canManageRoles", render: renderAccessControl },
  "/audit": { permission: "canManageRoles", render: renderAudit }
};

function pathFromHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function runCleanup() {
  cleanupCallbacks.forEach((fn) => {
    try { fn(); } catch (error) { console.warn("cleanup failed", error); }
  });
  cleanupCallbacks = [];
}

function setMain(html) {
  const main = document.getElementById("main-content");
  if (main) main.innerHTML = html;
}

function toast(message, type = "blue") {
  const existing = document.querySelector("[id$='-toast']");
  if (existing) {
    existing.innerHTML = notice(message, type);
    setTimeout(() => { existing.innerHTML = ""; }, 3500);
    return;
  }
  alert(message);
}

function can(permission) {
  if (isFallbackAdmin(currentUser)) return true;
  return hasPermission(currentAccess, permission);
}

function makeCtx() {
  return {
    user: currentUser,
    access: currentAccess,
    can,
    hasRole: (role) => isFallbackAdmin(currentUser) || hasRole(currentAccess, role),
    get isAdmin() { return isFallbackAdmin(currentUser) || hasRole(currentAccess, "admin"); },
    get isCoordinator() { return isFallbackAdmin(currentUser) || hasRole(currentAccess, "coordinator"); },
    setMain,
    toast,
    registerCleanup: (fn) => cleanupCallbacks.push(fn)
  };
}

function navItems(ctx) {
  const signedIn = Boolean(ctx.user);
  const items = [
    { section: "Public", label: "House Dashboard", hash: "#/", show: true },
    { section: "Public", label: "Public Calendar", hash: "#/public-calendar", show: true },
    { section: "Account", label: "Sign in", hash: "#/login", show: !signedIn },
    { section: "Account", label: "Home", hash: "#/home", show: signedIn },
    { section: "Teacher Tools", label: "House Points", hash: "#/points", show: signedIn && (ctx.can("canSubmitPoints") || ctx.can("canProcessHousePoints")) },
    { section: "Teacher Tools", label: "AR / DR", hash: "#/reflections", show: signedIn && (ctx.can("canGiveAR") || ctx.can("canGiveDR") || ctx.can("canApproveReflections")) },
    { section: "Teacher Tools", label: "Attendance", hash: "#/attendance", show: signedIn && ctx.can("canSubmitAttendance") },
    { section: "Teacher Tools", label: "Test Calendar", hash: "#/calendar", show: signedIn },
    { section: "Data", label: "Students", hash: "#/students", show: signedIn },
    { section: "Coordinator", label: "Reports", hash: "#/reports", show: signedIn && (ctx.isCoordinator || ctx.isAdmin) },
    { section: "Admin", label: "Access Control", hash: "#/access", show: signedIn && ctx.can("canManageRoles") },
    { section: "Admin", label: "Audit Logs", hash: "#/audit", show: signedIn && ctx.can("canManageRoles") }
  ].filter((item) => item.show);
  return items;
}

function renderSidebar(ctx, mobile = false) {
  const active = location.hash || "#/";
  const grouped = new Map();
  for (const item of navItems(ctx)) {
    if (!grouped.has(item.section)) grouped.set(item.section, []);
    grouped.get(item.section).push(item);
  }

  return `<aside class="sidebar ${mobile ? "mobile-menu" : ""}" id="${mobile ? "mobile-menu" : "sidebar"}">
    <div class="logo-row">
      <img src="../GriffinSM.png" alt="SCIS" />
      <div><strong>SCIS Unified Portal</strong><span>HOUSEPOINTS V2</span></div>
    </div>
    <nav>
      ${[...grouped.entries()].map(([section, items]) => `
        <div class="nav-section-title">${escapeHtml(section)}</div>
        ${items.map((item) => `<a class="nav-link ${active === item.hash ? "active" : ""}" href="${item.hash}">${escapeHtml(item.label)}</a>`).join("")}
      `).join("")}
    </nav>
    <div class="nav-bottom">
      ${ctx.user ? `<div class="user-pill"><strong>${escapeHtml(ctx.user.displayName || ctx.user.email || "Signed in")}</strong><span>${escapeHtml(ctx.user.email || "")}</span></div><button class="btn gold" data-sign-out>Sign out</button>` : `<a class="btn gold center" href="#/login">Sign in</a>`}
      <a class="btn secondary center" href="../index.html">Legacy app</a>
    </div>
  </aside>`;
}

function renderShell() {
  const ctx = makeCtx();
  appRoot.className = "";
  appRoot.innerHTML = `
    <div class="topbar">
      <strong>SCIS Unified Portal</strong>
      <button id="mobile-menu-button">Menu</button>
    </div>
    <div class="layout">
      ${renderSidebar(ctx)}
      <div>
        ${renderSidebar(ctx, true)}
        <main class="main" id="main-content"></main>
      </div>
    </div>`;

  document.querySelectorAll("[data-sign-out]").forEach((button) => {
    button.addEventListener("click", async () => {
      await signOutCurrentUser();
      location.hash = "#/";
    });
  });
  document.getElementById("mobile-menu-button")?.addEventListener("click", () => {
    document.getElementById("mobile-menu")?.classList.toggle("open");
  });
}

function renderRoute() {
  if (!authReady) return;
  runCleanup();
  renderShell();

  const path = pathFromHash();
  const route = routes[path] || routes["/"];
  const ctx = makeCtx();

  if (!route.public && !currentUser) {
    location.hash = "#/login";
    return;
  }

  if (currentUser && !currentAccess) {
    setMain(`${pageHeader("Loading access", "Checking your role and permissions.")}${notice("If this stays for more than a few seconds, ask an admin to add your email in Access Control.", "blue")}`);
    return;
  }

  const allowed = route.public
    || route.publicForSignedIn
    || !route.permission
    || can(route.permission)
    || (route.alternate && can(route.alternate))
    || (route.role && (ctx.hasRole(route.role) || ctx.isAdmin));

  if (!allowed) {
    setMain(`${pageHeader("Permission required", "Your account does not currently have access to this area.")}${notice("Ask an admin to update your access in Admin > Access Control.", "warn")}`);
    return;
  }

  route.render(ctx);
}

window.addEventListener("hashchange", renderRoute);

authReady = false;
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  currentAccess = null;
  authReady = true;

  if (unsubscribeAccess) {
    unsubscribeAccess();
    unsubscribeAccess = null;
  }

  if (user) {
    unsubscribeAccess = listenCurrentAccess(user, (access) => {
      currentAccess = access;
      renderRoute();
    });
  } else {
    currentAccess = null;
    renderRoute();
  }
});

if (!location.hash) location.hash = "#/";

window.__SCIS_DEBUG__ = {
  get user() { return currentUser; },
  get access() { return currentAccess; },
  fallbackAdmin: FALLBACK_ADMIN_EMAIL
};
