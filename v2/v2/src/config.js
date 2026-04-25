export const firebaseConfig = {
  apiKey: "AIzaSyDyFV6WAZhpr4leljJOQozPzEWlNaU-heQ",
  authDomain: "scis-house-points.firebaseapp.com",
  projectId: "scis-house-points",
  storageBucket: "scis-house-points.firebasestorage.app",
  messagingSenderId: "929403398815",
  appId: "1:929403398815:web:c6634925bfac5b665650aa"
};

export const APP_ID = "scis-house-points";
export const SCHOOL_DOMAIN = "scis-bo.com";
export const MICROSOFT_TENANT = "scis-bo.com";
export const FUNCTIONS_REGION = "us-central1";
export const FALLBACK_ADMIN_EMAIL = "dolguin@scis-bo.com";
export const SOURCE_APP = "unified-v2";
export const SCHEMA_VERSION = 2;

export const HOUSES = [
  { id: "centaurs", name: "Centaurs", color: "#3b82f6" },
  { id: "pegasus", name: "Pegasus", color: "#22c55e" },
  { id: "titans", name: "Titans", color: "#eab308" },
  { id: "unicorns", name: "Unicorns", color: "#ef4444" }
];

export const POINTS_BY_RANK = {
  first: 10,
  second: 7,
  third: 4,
  fourth: 3
};

export const RANK_LABELS = [
  ["first", "1st place", 10],
  ["second", "2nd place", 7],
  ["third", "3rd place", 4],
  ["fourth", "4th place", 3]
];

export const SUBJECTS = [
  "Advisory", "Art", "Drama", "English", "Humanities", "Math", "Music",
  "PE", "Science", "Spanish", "Technology", "Other"
];

export const AR_REASONS = [
  "Late to class (unexcused) - Llegar tarde a clases.",
  "Missing homework - Tarea incompleta/no entregada.",
  "Disruptive behavior - Comportamiento disruptivo.",
  "Inappropriate language - Lenguaje inapropiado.",
  "Uniform issue - Problema de uniforme.",
  "Technology misuse - Uso inapropiado de tecnología.",
  "Other - Otro"
];

export const GRADES = [
  "1sA", "1sB", "2sA", "2sB", "3sA", "3sB", "4sA", "4sB", "5sA", "5sB",
  "6sA", "6sB", "7sA", "7sB", "8sA", "8sB", "9sA", "9sB", "10sA", "10sB", "11sA", "11sB", "12sA", "12sB"
];

export const ROLE_KEYS = ["teacher", "coordinator", "admin"];

export const PERMISSIONS = [
  { key: "canSubmitPoints", label: "Submit house points", group: "Teacher tools" },
  { key: "canGiveAR", label: "Give ARs", group: "Teacher tools" },
  { key: "canGiveDR", label: "Give DRs", group: "Teacher tools" },
  { key: "canSubmitAttendance", label: "Submit attendance", group: "Teacher tools" },
  { key: "canManageCalendar", label: "Manage test calendar", group: "Teacher tools" },
  { key: "canApproveReflections", label: "Approve ARs / DRs", group: "Coordinator tools" },
  { key: "canProcessHousePoints", label: "Process house points", group: "Coordinator tools" },
  { key: "canManageStudents", label: "Manage students", group: "Admin tools" },
  { key: "canManageRoles", label: "Manage roles", group: "Admin tools" }
];

export function shouldUseFunctions() {
  return localStorage.getItem("scisUseFunctions") !== "false";
}
