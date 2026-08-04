import { count } from "drizzle-orm";
import {
  alertsTable,
  computersTable,
  db,
  eventsTable,
  studentSessionsTable,
  usbPoliciesTable,
} from "@workspace/db";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

const [existing] = await db.select({ value: count() }).from(computersTable);
if (Number(existing.value) > 0) {
  console.log("[seed] Database already seeded — skipping.");
  process.exit(0);
}

const inserted = await db
  .insert(computersTable)
  .values([
    { name: "PC-01", room: "Room 101", status: "online", userName: "Priya Sharma", os: "Windows 11 Pro", usbState: "allowed", keyboard: true, mouse: true },
    { name: "PC-02", room: "Room 101", status: "online", userName: "Marcus Chen", os: "Windows 11 Pro", usbState: "allowed", keyboard: true, mouse: true },
    { name: "PC-03", room: "Room 102", status: "online", userName: null, os: "Ubuntu 24.04", usbState: "blocked", keyboard: true, mouse: true },
    { name: "PC-04", room: "Room 102", status: "warning", userName: "Lena Ortiz", os: "Windows 11 Pro", usbState: "review", keyboard: true, mouse: false },
    { name: "PC-05", room: "Room 103", status: "offline", userName: null, os: "Windows 11 Pro", usbState: "blocked", keyboard: true, mouse: true },
    { name: "PC-06", room: "Room 103", status: "locked", userName: "Noah Patel", os: "Windows 11 Pro", usbState: "blocked", keyboard: true, mouse: true },
  ])
  .returning({ id: computersTable.id, name: computersTable.name });

const byName = new Map(inserted.map((computer) => [computer.name, computer.id]));

const pc01 = byName.get("PC-01")!;
const pc02 = byName.get("PC-02")!;
const pc04 = byName.get("PC-04")!;

await db.insert(studentSessionsTable).values([
  {
    studentName: "Priya Sharma",
    studentId: "20260012",
    computerId: pc01,
    computerName: "PC-01",
    status: "active",
    startedAt: minutesAgo(42),
  },
  {
    studentName: "Marcus Chen",
    studentId: "20260077",
    computerId: pc02,
    computerName: "PC-02",
    status: "active",
    startedAt: minutesAgo(28),
  },
]);

await db.insert(alertsTable).values([
  {
    severity: "critical",
    title: "USB policy violation",
    detail: "Unapproved removable device connected on PC-06 before the block took effect.",
    computerName: "PC-06",
    status: "open",
    createdAt: minutesAgo(15),
  },
  {
    severity: "warning",
    title: "Mouse not responding",
    detail: "PC-04 reported a missing mouse peripheral on its last heartbeat.",
    computerName: "PC-04",
    status: "open",
    createdAt: minutesAgo(34),
  },
  {
    severity: "info",
    title: "Session ended",
    detail: "Student session on PC-05 ended normally at the end of class.",
    computerName: "PC-05",
    status: "acknowledged",
    createdAt: minutesAgo(120),
  },
]);

await db.insert(usbPoliciesTable).values([
  {
    name: "Default removable media policy",
    description: "Controls flash drives, phones, and other removable storage in the lab.",
    mode: "allowed",
    scope: "all",
    updatedAt: minutesAgo(60),
  },
]);

await db.insert(eventsTable).values([
  { type: "student_login", message: "Priya Sharma signed in on PC-01", actor: "Priya Sharma", createdAt: minutesAgo(42) },
  { type: "student_login", message: "Marcus Chen signed in on PC-02", actor: "Marcus Chen", createdAt: minutesAgo(28) },
  { type: "usb_blocked", message: "Removable device blocked on PC-06", actor: "Automation", createdAt: minutesAgo(15) },
  { type: "operator_action", message: "lock queued for computer PC-06", actor: "Lab administrator", createdAt: minutesAgo(10) },
  { type: "usb_policy_change", message: "USB policy set to allowed for all computers", actor: "Lab administrator", createdAt: minutesAgo(60) },
  { type: "login_failure", message: "Failed login attempt on PC-05", actor: "unknown", createdAt: minutesAgo(90) },
]);

console.log("[seed] Seeded 6 computers, 2 sessions, 3 alerts, 1 policy, and 6 events.");
process.exit(0);
