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
