import { Router, type IRouter } from "express";
import { desc, gte } from "drizzle-orm";
import { db, eventsTable, studentSessionsTable } from "@workspace/db";
import {
  AttendanceReportResponse,
  PeripheralsReportResponse,
  ViolationsReportResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const VIOLATION_TYPES = new Set([
  "usb_blocked",
  "usb_connected",
  "login_failure",
  "peripheral_disconnect",
]);
const PERIPHERAL_TYPES = new Set(["peripheral_disconnect", "peripheral_connect"]);

function parseDays(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function daysAgo(days: number): Date | null {
  return days > 0 ? new Date(Date.now() - days * 86_400_000) : null;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

router.get("/reports/attendance", async (req, res): Promise<void> => {
  const days = parseDays(req.query.days);
  const cutoff = daysAgo(days);

  const sessions = await db
    .select()
    .from(studentSessionsTable)
    .where(cutoff ? gte(studentSessionsTable.startedAt, cutoff) : undefined)
    .orderBy(desc(studentSessionsTable.startedAt));

  res.json(
    AttendanceReportResponse.parse(
      sessions.map((session) => ({
        id: session.id,
        studentName: session.studentName,
        studentId: session.studentId,
        computerName: session.computerName,
        startedAt: iso(session.startedAt) as string,
        endedAt: iso(session.endedAt),
        durationMinutes:
          session.endedAt && session.startedAt
            ? Math.max(1, Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 60_000))
            : null,
        status: session.status === "active" ? "active" : "ended",
      })),
    ),
  );
});

router.get("/reports/violations", async (req, res): Promise<void> => {
  const days = parseDays(req.query.days);
  const cutoff = daysAgo(days);

  const events = await db
    .select()
    .from(eventsTable)
    .where(cutoff ? gte(eventsTable.createdAt, cutoff) : undefined)
    .orderBy(desc(eventsTable.createdAt));

  res.json(
    ViolationsReportResponse.parse(
      events
        .filter((event) => VIOLATION_TYPES.has(event.type))
        .map((event) => ({
          id: event.id,
          type: event.type,
          message: event.message,
          actor: event.actor,
          computerName: event.computerName,
          createdAt: iso(event.createdAt) as string,
        })),
    ),
  );
});

router.get("/reports/attendance.csv", async (req, res): Promise<void> => {
  const days = parseDays(req.query.days);
  const cutoff = daysAgo(days);

  const sessions = await db
    .select()
    .from(studentSessionsTable)
    .where(cutoff ? gte(studentSessionsTable.startedAt, cutoff) : undefined)
    .orderBy(desc(studentSessionsTable.startedAt));

  const rows = sessions.map((session) => [
    session.studentName,
    session.studentId,
    session.computerName,
    iso(session.startedAt) ?? "",
    iso(session.endedAt) ?? "",
    session.endedAt && session.startedAt
      ? String(Math.max(1, Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 60_000)))
      : "",
    session.status,
  ]);

  const csv = [
    ["Student Name", "Student ID", "Computer", "Sign In", "Sign Out", "Duration (min)", "Status"],
    ...rows,
  ]
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="attendance-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\uFEFF${csv}`);
});

router.get("/reports/violations.csv", async (req, res): Promise<void> => {
  const days = parseDays(req.query.days);
  const cutoff = daysAgo(days);

  const events = await db
    .select()
    .from(eventsTable)
    .where(cutoff ? gte(eventsTable.createdAt, cutoff) : undefined)
    .orderBy(desc(eventsTable.createdAt));

  const rows = events
    .filter((event) => VIOLATION_TYPES.has(event.type))
    .map((event) => [
      iso(event.createdAt) ?? "",
      event.type,
      event.message,
      event.actor,
      event.computerName ?? "",
    ]);

  const csv = [
    ["Time", "Type", "Details", "Actor", "Computer"],
    ...rows,
  ]
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="violations-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\uFEFF${csv}`);
});

router.get("/reports/peripherals", async (req, res): Promise<void> => {
  const days = parseDays(req.query.days);
  const cutoff = daysAgo(days);

  const events = await db
    .select()
    .from(eventsTable)
    .where(cutoff ? gte(eventsTable.createdAt, cutoff) : undefined)
    .orderBy(desc(eventsTable.createdAt));

  res.json(
    PeripheralsReportResponse.parse(
      events
        .filter((event) => PERIPHERAL_TYPES.has(event.type))
        .map((event) => ({
          id: event.id,
          type: event.type,
          message: event.message,
          actor: event.actor,
          computerName: event.computerName,
          createdAt: iso(event.createdAt) as string,
        })),
    ),
  );
});

router.get("/reports/peripherals.csv", async (req, res): Promise<void> => {
  const days = parseDays(req.query.days);
  const cutoff = daysAgo(days);

  const events = await db
    .select()
    .from(eventsTable)
    .where(cutoff ? gte(eventsTable.createdAt, cutoff) : undefined)
    .orderBy(desc(eventsTable.createdAt));

  const rows = events
    .filter((event) => PERIPHERAL_TYPES.has(event.type))
    .map((event) => [
      iso(event.createdAt) ?? "",
      event.type,
      event.message,
      event.actor,
      event.computerName ?? "",
    ]);

  const csv = [
    ["Time", "Type", "Details", "User", "Computer"],
    ...rows,
  ]
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="peripherals-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\uFEFF${csv}`);
});

export default router;
