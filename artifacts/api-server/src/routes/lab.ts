import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  actionsTable,
  alertsTable,
  computersTable,
  eventsTable,
  studentSessionsTable,
  usbPoliciesTable,
} from "@workspace/db";
import {
  CreateComputerActionBody,
  CreateComputerActionParams,
  CreateComputerActionResponse,
  CreateStudentSessionBody,
  CreateStudentSessionResponse,
  GetComputersResponse,
  GetLabAlertsResponse,
  GetLabEventsResponse,
  GetLabSummaryResponse,
  GetStudentSessionsResponse,
  GetUsbPoliciesResponse,
  UpdateLabAlertBody,
  UpdateLabAlertParams,
  UpdateLabAlertResponse,
  UpdateUsbPolicyBody,
  UpdateUsbPolicyResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const iso = (value: Date | string | null | undefined) =>
  value instanceof Date ? value.toISOString() : value ?? null;

const mapComputer = (computer: typeof computersTable.$inferSelect) => ({
  id: computer.id,
  name: computer.name,
  room: computer.room,
  status: computer.status,
  userName: computer.userName,
  lastSeen: iso(computer.lastSeen) as string,
  os: computer.os,
  usbState: computer.usbState,
  peripherals: { keyboard: computer.keyboard, mouse: computer.mouse },
});

const mapAlert = (alert: typeof alertsTable.$inferSelect) => ({
  ...alert,
  createdAt: iso(alert.createdAt) as string,
});

router.get("/lab/summary", async (_req, res): Promise<void> => {
  const [computers, sessions, alerts, events] = await Promise.all([
    db.select().from(computersTable),
    db.select().from(studentSessionsTable),
    db.select().from(alertsTable),
    db.select().from(eventsTable),
  ]);

  res.json(
    GetLabSummaryResponse.parse({
      totalComputers: computers.length,
      onlineComputers: computers.filter((computer) => computer.status === "online").length,
      activeSessions: sessions.filter((session) => session.status === "active").length,
      openAlerts: alerts.filter((alert) => alert.status === "open").length,
      blockedUsbEvents: events.filter((event) => event.type === "usb_blocked").length,
      lastSyncAt: new Date().toISOString(),
    }),
  );
});

router.get("/lab/computers", async (_req, res): Promise<void> => {
  const computers = await db.select().from(computersTable).orderBy(computersTable.name);
  res.json(GetComputersResponse.parse(computers.map(mapComputer)));
});

router.post("/lab/computers/:computerId/actions", async (req, res): Promise<void> => {
  const params = CreateComputerActionParams.safeParse(req.params);
  const body = CreateComputerActionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid computer action" });
    return;
  }

  const [action] = await db
    .insert(actionsTable)
    .values({
      computerId: params.data.computerId,
      action: body.data.action,
      message: body.data.message ?? null,
      status: "queued",
    })
    .returning();

  if (body.data.action === "lock") {
    await db.update(computersTable).set({ status: "locked" }).where(eq(computersTable.id, params.data.computerId));
  } else if (body.data.action === "unlock") {
    await db.update(computersTable).set({ status: "online" }).where(eq(computersTable.id, params.data.computerId));
  } else if (body.data.action === "block_usb") {
    await db.update(computersTable).set({ usbState: "blocked" }).where(eq(computersTable.id, params.data.computerId));
  } else if (body.data.action === "allow_usb") {
    await db.update(computersTable).set({ usbState: "allowed" }).where(eq(computersTable.id, params.data.computerId));
  }

  await db.insert(eventsTable).values({
    type: "operator_action",
    message: `${body.data.action.replaceAll("_", " ")} queued for computer ${params.data.computerId}`,
    actor: "Lab administrator",
  });

  res.status(201).json(
    CreateComputerActionResponse.parse({
      ...action,
      createdAt: iso(action.createdAt),
    }),
  );
});

router.get("/lab/alerts", async (_req, res): Promise<void> => {
  const alerts = await db.select().from(alertsTable).orderBy(desc(alertsTable.createdAt));
  res.json(GetLabAlertsResponse.parse(alerts.map(mapAlert)));
});

router.patch("/lab/alerts/:alertId", async (req, res): Promise<void> => {
  const params = UpdateLabAlertParams.safeParse(req.params);
  const body = UpdateLabAlertBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid alert update" });
    return;
  }

  const [alert] = await db
    .update(alertsTable)
    .set({ status: body.data.status })
    .where(eq(alertsTable.id, params.data.alertId))
    .returning();
  if (!alert) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }
  res.json(UpdateLabAlertResponse.parse(mapAlert(alert)));
});

router.get("/lab/usb-policies", async (_req, res): Promise<void> => {
  const policies = await db.select().from(usbPoliciesTable).orderBy(desc(usbPoliciesTable.updatedAt));
  res.json(
    GetUsbPoliciesResponse.parse(
      policies.map((policy) => ({
        ...policy,
        computerIds: policy.computerIds ?? undefined,
        updatedAt: iso(policy.updatedAt) as string,
      })),
    ),
  );
});

router.patch("/lab/usb-policies", async (req, res): Promise<void> => {
  const body = UpdateUsbPolicyBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid USB policy" });
    return;
  }

  const [current] = await db.select().from(usbPoliciesTable).orderBy(usbPoliciesTable.id).limit(1);
  const [policy] = current
    ? await db
        .update(usbPoliciesTable)
        .set({
          mode: body.data.mode,
          scope: body.data.scope,
          computerIds: body.data.computerIds ?? null,
          updatedAt: new Date(),
        })
        .where(eq(usbPoliciesTable.id, current.id))
        .returning()
    : await db
        .insert(usbPoliciesTable)
        .values({
          name: "Default removable media policy",
          description: "Controls flash drives, phones, and other removable storage in the lab.",
          mode: body.data.mode,
          scope: body.data.scope,
          computerIds: body.data.computerIds ?? null,
        })
        .returning();

  if (body.data.scope === "all") {
    await db.update(computersTable).set({ usbState: body.data.mode === "allowed" ? "allowed" : "blocked" });
  }

  res.json(
    UpdateUsbPolicyResponse.parse({
      ...policy,
      computerIds: policy.computerIds ?? undefined,
      updatedAt: iso(policy.updatedAt),
    }),
  );
});

router.get("/lab/student-sessions", async (_req, res): Promise<void> => {
  const sessions = await db.select().from(studentSessionsTable).orderBy(desc(studentSessionsTable.startedAt));
  res.json(
    GetStudentSessionsResponse.parse(
      sessions.map((session) => ({
        ...session,
        startedAt: iso(session.startedAt),
        endedAt: iso(session.endedAt),
      })),
    ),
  );
});

router.post("/lab/student-sessions", async (req, res): Promise<void> => {
  const body = CreateStudentSessionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [computer] = await db.select().from(computersTable).where(eq(computersTable.id, body.data.computerId));
  if (!computer) {
    res.status(404).json({ error: "Computer not found" });
    return;
  }
  const [session] = await db
    .insert(studentSessionsTable)
    .values({
      studentName: body.data.studentName,
      studentId: body.data.studentId,
      computerId: computer.id,
      computerName: computer.name,
      status: "active",
    })
    .returning();
  await db
    .update(computersTable)
    .set({ userName: body.data.studentName })
    .where(eq(computersTable.id, computer.id));
  await db.insert(eventsTable).values({
    type: "student_login",
    message: `${body.data.studentName} signed in on ${computer.name}`,
    actor: body.data.studentName,
  });
  res.status(201).json(
    CreateStudentSessionResponse.parse({
      ...session,
      startedAt: iso(session.startedAt),
      endedAt: iso(session.endedAt),
    }),
  );
});

router.get("/lab/events", async (_req, res): Promise<void> => {
  const events = await db.select().from(eventsTable).orderBy(desc(eventsTable.createdAt)).limit(50);
  res.json(
    GetLabEventsResponse.parse(
      events.map((event) => ({ ...event, createdAt: iso(event.createdAt) as string })),
    ),
  );
});

export default router;
