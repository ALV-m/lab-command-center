import { createInsertSchema } from "drizzle-zod";
import {
  bigint,
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const computersTable = pgTable("lab_computers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  room: text("room").notNull(),
  status: text("status").notNull().default("offline"),
  userName: text("user_name"),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  os: text("os").notNull().default("Windows 11 Pro"),
  usbState: text("usb_state").notNull().default("blocked"),
  keyboard: boolean("keyboard").notNull().default(true),
  mouse: boolean("mouse").notNull().default(true),
  agentToken: text("agent_token"),
  agentVersion: text("agent_version"),
  avEnabled: boolean("av_enabled"),
  avSignature: text("av_signature"),
  avLastScanAt: timestamp("av_last_scan_at", { withTimezone: true }),
  avScanState: text("av_scan_state"),
  firewallEnabled: boolean("firewall_enabled"),
  firewallProfiles: text("firewall_profiles"),
  macAddress: text("mac_address"),
  ipAddress: text("ip_address"),
  checkinRequired: boolean("checkin_required").notNull().default(false),
});

export const actionsTable = pgTable("lab_actions", {
  id: serial("id").primaryKey(),
  computerId: integer("computer_id").notNull(),
  action: text("action").notNull(),
  status: text("status").notNull().default("queued"),
  message: text("message"),
  payload: text("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alertsTable = pgTable("lab_alerts", {
  id: serial("id").primaryKey(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  computerName: text("computer_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("open"),
});

export const usbPoliciesTable = pgTable("lab_usb_policies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  mode: text("mode").notNull().default("approval_required"),
  scope: text("scope").notNull().default("all"),
  computerIds: integer("computer_ids").array(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const studentSessionsTable = pgTable("lab_student_sessions", {
  id: serial("id").primaryKey(),
  studentName: text("student_name").notNull(),
  studentId: text("student_id").notNull(),
  computerId: integer("computer_id").notNull(),
  computerName: text("computer_name").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  status: text("status").notNull().default("active"),
});

export const eventsTable = pgTable("lab_events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  actor: text("actor").notNull(),
  computerName: text("computer_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usbDevicesTable = pgTable("lab_usb_devices", {
  id: serial("id").primaryKey(),
  computerId: integer("computer_id").notNull(),
  computerName: text("computer_name").notNull(),
  deviceId: text("device_id"),
  instanceId: text("instance_id"),
  driveLetter: text("drive_letter"),
  label: text("label"),
  status: text("status").notNull().default("pending"),
  scanResult: text("scan_result"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const peripheralsTable = pgTable("lab_peripherals", {
  id: serial("id").primaryKey(),
  computerId: integer("computer_id").notNull(),
  computerName: text("computer_name").notNull(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  instanceId: text("instance_id").notNull(),
  present: boolean("present").notNull().default(true),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastChangedAt: timestamp("last_changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settingsTable = pgTable("lab_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scanRunsTable = pgTable("lab_scan_runs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  initiatedBy: text("initiated_by").notNull(),
  status: text("status").notNull().default("queued"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const scanResultsTable = pgTable("lab_scan_results", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  computerId: integer("computer_id").notNull(),
  computerName: text("computer_name").notNull(),
  status: text("status").notNull().default("queued"),
  detail: text("detail"),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const fileEntriesTable = pgTable("lab_file_entries", {
  id: serial("id").primaryKey(),
  computerId: integer("computer_id").notNull(),
  path: text("path").notNull(),
  name: text("name").notNull(),
  isDir: boolean("is_dir").notNull().default(false),
  size: bigint("size", { mode: "number" }).notNull().default(0),
  modifiedAt: text("modified_at"),
  listedAt: timestamp("listed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const checkinsTable = pgTable("lab_checkins", {
  id: serial("id").primaryKey(),
  computerId: integer("computer_id").notNull(),
  computerName: text("computer_name").notNull(),
  userName: text("user_name"),
  role: text("role").notNull().default("student"),
  studentName: text("student_name").notNull(),
  phone: text("phone"),
  admissionNo: text("admission_no"),
  course: text("course"),
  className: text("class"),
  reason: text("reason"),
  email: text("email"),
  photoFileId: text("photo_file_id"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const screenshotsTable = pgTable("lab_screenshots", {
  id: serial("id").primaryKey(),
  computerId: integer("computer_id").notNull(),
  fileId: text("file_id").notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertComputerSchema = createInsertSchema(computersTable).omit({ id: true });
export const insertActionSchema = createInsertSchema(actionsTable).omit({ id: true, createdAt: true });
export const insertAlertSchema = createInsertSchema(alertsTable).omit({ id: true, createdAt: true });
export const insertUsbPolicySchema = createInsertSchema(usbPoliciesTable).omit({ id: true, updatedAt: true });
export const insertStudentSessionSchema = createInsertSchema(studentSessionsTable).omit({ id: true, startedAt: true });
export const insertEventSchema = createInsertSchema(eventsTable).omit({ id: true, createdAt: true });

export type Computer = typeof computersTable.$inferSelect;
export type Action = typeof actionsTable.$inferSelect;
export type Alert = typeof alertsTable.$inferSelect;
export type UsbPolicy = typeof usbPoliciesTable.$inferSelect;
export type StudentSession = typeof studentSessionsTable.$inferSelect;
export type LabEvent = typeof eventsTable.$inferSelect;
export type Peripheral = typeof peripheralsTable.$inferSelect;
export type ScanRun = typeof scanRunsTable.$inferSelect;
export type ScanResult = typeof scanResultsTable.$inferSelect;
export type InsertComputer = z.infer<typeof insertComputerSchema>;
