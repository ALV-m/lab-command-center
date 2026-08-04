import * as zod from "zod";

export const AttendanceReportItem = zod.object({
  id: zod.number(),
  studentName: zod.string(),
  studentId: zod.string(),
  computerName: zod.string(),
  startedAt: zod.string(),
  endedAt: zod.string().nullish(),
  durationMinutes: zod.number().nullish(),
  status: zod.enum(["active", "ended"]),
});

export const AttendanceReportResponse = zod.array(AttendanceReportItem);

export const ViolationsReportItem = zod.object({
  id: zod.number(),
  type: zod.string(),
  message: zod.string(),
  actor: zod.string(),
  computerName: zod.string().nullish(),
  createdAt: zod.string(),
});

export const ViolationsReportResponse = zod.array(ViolationsReportItem);

export const PeripheralsReportItem = zod.object({
  id: zod.number(),
  type: zod.string(),
  message: zod.string(),
  actor: zod.string(),
  computerName: zod.string().nullish(),
  createdAt: zod.string(),
});

export const PeripheralsReportResponse = zod.array(PeripheralsReportItem);

export const ScanResultItem = zod.object({
  id: zod.number(),
  computerId: zod.number(),
  computerName: zod.string(),
  status: zod.string(),
  detail: zod.string().nullish(),
  finishedAt: zod.string().nullish(),
});

export const ScanRunItem = zod.object({
  id: zod.number(),
  action: zod.string(),
  initiatedBy: zod.string(),
  status: zod.string(),
  requestedAt: zod.string(),
  finishedAt: zod.string().nullish(),
  results: zod.array(ScanResultItem),
});

export const ScanReportResponse = zod.array(ScanRunItem);

export const SecurityBroadcastAction = zod.enum([
  "av_scan",
  "av_update",
  "av_toggle",
  "fw_enable",
  "fw_disable",
]);

export const SecurityBroadcastBody = zod.object({
  action: SecurityBroadcastAction,
  type: zod.enum(["quick", "full"]).optional(),
  enabled: zod.boolean().optional(),
  initiatedBy: zod.string().max(100).optional(),
  computerIds: zod.array(zod.number()).optional(),
});

export const SecurityBroadcastResponse = zod.object({
  runId: zod.number().nullish(),
  queued: zod.number(),
});
