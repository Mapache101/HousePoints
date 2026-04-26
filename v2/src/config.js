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
  { id: "centaurs", name: "Centaurs", color: "#3b82f6", bg: "blue" },
  { id: "pegasus", name: "Pegasus", color: "#22c55e", bg: "green" },
  { id: "titans", name: "Titans", color: "#eab308", bg: "yellow" },
  { id: "unicorns", name: "Unicorns", color: "#ef4444", bg: "red" }
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
  "Coordination",
  "Spanish / Ms Carola",
  "Spanish / Ms Charito",
  "Science / Mr Tobias",
  "Science / Ms Daniela",
  "Chemistry",
  "Social Studies",
  "History",
  "Physics",
  "Physical Education",
  "Maths / Kingsley",
  "Maths / Silvia",
  "Maths / Guillermo",
  "English / Elvia",
  "English / Sara",
  "English / Letty",
  "ICT",
  "Biology",
  "Art",
  "Music",
  "Global Perspectives / Ms Wei",
  "Global Perspectives / Ms Bell",
  "Business Studies",
  "Homeroom"
];

export const AR_REASONS = [
  "Late to class (unexcused) - Llegar tarde a clases.",
  "Disruptive behaviour - Comportamiento disruptivo.",
  "Constantly interrupting the class - Interrumpir constantemente la clase.",
  "Not following instructions - No seguir instrucciones.",
  "Not wearing proper uniform - No usar el uniforme correctamente.",
  "Not presenting requested materials in class - No presentar materiales solicitados en clase.",
  "Eating in class - Comer en clase.",
  "Public Display of affection(PDA) - Muestras publicas de afecto.",
  "Speaking spanish inside the class and in the hallways - Hablar espanol dentro de la clase y pasillos.",
  "Sleeping in class - Dormir en clase.",
  "Other - Otro"
];

export const GRADES = [
  "1sA", "1sB", "2sA", "2sB", "3sA", "3sB", "4sA", "4sB", "5sA", "5sB",
  "6sA", "6sB", "7sA", "7sB", "8sA", "8sB", "9sA", "9sB", "10sA", "10sB", "11sA", "11sB", "12sA", "12sB"
];

export const MOOD_OPTIONS = [
  { value: "", label: "No mood" },
  { value: "\u{1F600}", label: "Happy" },
  { value: "\u{1F642}", label: "Good" },
  { value: "\u{1F610}", label: "Neutral" },
  { value: "\u{1F641}", label: "Low" },
  { value: "\u{1F62B}", label: "Tired" },
  { value: "\u{1F620}", label: "Frustrated" }
];

export const DEFAULT_SCHEDULE = [
  { day: 1, start: "08:00", end: "09:30", class: "1sA" },
  { day: 1, start: "09:45", end: "11:15", class: "2sB" },
  { day: 2, start: "08:00", end: "09:30", class: "3sA" }
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
