import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "@workspace/db";
import {
  actionsTable,
  alertsTable,
  computersTable,
  eventsTable,
  studentSessionsTable,
  usbDevicesTable,
  usbPoliciesTable,
} from "@workspace/db";
import {
  AgentActionCompleteBody,
  AgentActionCompleteParams,
  AgentActionCompleteResponse,
  AgentEventBody,
  AgentEventResponse,
  AgentHeartbeatBody,
  AgentHeartbeatResponse,
  AgentRegisterBody,
  AgentRegisterResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const DIST_DIR = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(DIST_DIR, "data", "uploads");
const AGENT_SCRIPT_PATH = path.join(DIST_DIR, "lab-agent.ps1");

await mkdir(UPLOADS_DIR, { recursive: true });

const safeUser = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

async function endActiveSessions(computerId: number): Promise<void> {
  await db
    .update(studentSessionsTable)
    .set({ status: "ended", endedAt: new Date() })
    .where(
      and(
        eq(studentSessionsTable.computerId, computerId),
        eq(studentSessionsTable.status, "active"),
      ),
    );
}

async function hasActiveSession(computerId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: studentSessionsTable.id })
    .from(studentSessionsTable)
    .where(
      and(
        eq(studentSessionsTable.computerId, computerId),
        eq(studentSessionsTable.status, "active"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function startSession(
  computerId: number,
  computerName: string,
  userName: string,
): Promise<void> {
  await db.insert(studentSessionsTable).values({
    studentName: userName,
    studentId: `agent:${userName.toLowerCase()}`,
    computerId,
    computerName,
    status: "active",
  });
}

router.post("/agent/register", async (req, res): Promise<void> => {
  const body = AgentRegisterBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const name = body.data.name.trim();
  const [existing] = await db
    .select()
    .from(computersTable)
    .where(sql`lower(${computersTable.name}) = ${name.toLowerCase()}`)
    .limit(1);

  let computer;
  let token = existing?.agentToken ?? null;

  if (existing) {
    if (!token) {
      token = randomBytes(24).toString("hex");
    }
    const [updated] = await db
      .update(computersTable)
      .set({
        agentToken: token,
        agentVersion: body.data.agentVersion ?? existing.agentVersion,
        os: body.data.os ?? existing.os,
      })
      .where(eq(computersTable.id, existing.id))
      .returning();
    computer = updated;
  } else {
    token = randomBytes(24).toString("hex");
    const [inserted] = await db
      .insert(computersTable)
      .values({
        name,
        room: "Unassigned",
        status: "offline",
        os: body.data.os ?? "Windows",
        agentToken: token,
        agentVersion: body.data.agentVersion ?? null,
      })
      .returning();
    computer = inserted;
  }

  res.json(
    AgentRegisterResponse.parse({
      computerId: computer.id,
      token: token!,
      name: computer.name,
      usbState: computer.usbState,
      serverTime: new Date().toISOString(),
    }),
  );
});

router.post("/agent/heartbeat", async (req, res): Promise<void> => {
  const body = AgentHeartbeatBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [computer] = await db
    .select()
    .from(computersTable)
    .where(eq(computersTable.agentToken, body.data.token))
    .limit(1);
  if (!computer) {
    res.status(401).json({ error: "Invalid agent token" });
    return;
  }

  const reportedUser = safeUser(body.data.userName);
  const previousUser = safeUser(computer.userName);
  const sessionEvents: Array<{ type: string; message: string; actor: string }> = [];

  if (reportedUser !== previousUser) {
    if (previousUser) {
      await endActiveSessions(computer.id);
      sessionEvents.push({
        type: "student_logout",
        message: `${previousUser} signed out of ${computer.name}`,
        actor: previousUser,
      });
    }
    if (reportedUser && !(await hasActiveSession(computer.id))) {
      await startSession(computer.id, computer.name, reportedUser);
      sessionEvents.push({
        type: "student_login",
        message: `${reportedUser} signed in on ${computer.name}`,
        actor: reportedUser,
      });
    }
  }

  await db
    .update(computersTable)
    .set({
      status: "online",
      lastSeen: new Date(),
      userName: reportedUser,
      os: body.data.os ? body.data.os : computer.os,
      agentVersion: body.data.agentVersion ? body.data.agentVersion : computer.agentVersion,
      avEnabled: body.data.avEnabled ?? computer.avEnabled,
      avSignature: body.data.avSignature ?? computer.avSignature,
      avLastScanAt: body.data.avLastScanAt
        ? new Date(body.data.avLastScanAt)
        : computer.avLastScanAt,
    })
    .where(eq(computersTable.id, computer.id));

  for (const event of sessionEvents) {
    await db
      .insert(eventsTable)
      .values({ ...event, computerName: computer.name });
  }

  const [policy] = await db
    .select()
    .from(usbPoliciesTable)
    .orderBy(usbPoliciesTable.id)
    .limit(1);
  const policyMode = policy?.mode ?? "approval_required";

  const approvedDevices =
    policyMode === "allowed"
      ? []
      : await db
          .select()
          .from(usbDevicesTable)
          .where(
            and(
              eq(usbDevicesTable.computerId, computer.id),
              eq(usbDevicesTable.status, "approved"),
            ),
          );
  const allowedUsb = approvedDevices
    .map((device) => device.driveLetter)
    .filter((letter): letter is string => Boolean(letter));

  const pending = await db
    .select()
    .from(actionsTable)
    .where(
      and(
        eq(actionsTable.computerId, computer.id),
        eq(actionsTable.status, "queued"),
      ),
    )
    .orderBy(actionsTable.id)
    .limit(20);

  res.json(
    AgentHeartbeatResponse.parse({
      serverTime: new Date().toISOString(),
      computer: {
        id: computer.id,
        name: computer.name,
        status: "online",
        usbState: computer.usbState,
      },
      allowedUsb,
      pendingActions: pending.map((action) => ({
        id: action.id,
        action: action.action as never,
        message: action.message,
        payload: action.payload,
      })),
    }),
  );
});

router.post("/agent/actions/:actionId/complete", async (req, res): Promise<void> => {
  const params = AgentActionCompleteParams.safeParse(req.params);
  const body = AgentActionCompleteBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [computer] = await db
    .select()
    .from(computersTable)
    .where(eq(computersTable.agentToken, body.data.token))
    .limit(1);
  if (!computer) {
    res.status(401).json({ error: "Invalid agent token" });
    return;
  }

  const [action] = await db
    .select()
    .from(actionsTable)
    .where(eq(actionsTable.id, params.data.actionId))
    .limit(1);
  if (!action || action.computerId !== computer.id) {
    res.status(404).json({ error: "Action not found" });
    return;
  }

  await db
    .update(actionsTable)
    .set({ status: body.data.success ? "acknowledged" : "failed" })
    .where(eq(actionsTable.id, action.id));

  const detail = body.data.detail?.trim();
  await db.insert(eventsTable).values({
    type: "operator_action",
    message: `${action.action.replaceAll("_", " ")} ${body.data.success ? "executed" : "failed"} on ${computer.name}${
      detail ? ` — ${detail}` : ""
    }`,
    actor: "Agent",
    computerName: computer.name,
  });

  res.json(AgentActionCompleteResponse.parse({ ok: true }));
});

router.post("/agent/events", async (req, res): Promise<void> => {
  const body = AgentEventBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [computer] = await db
    .select()
    .from(computersTable)
    .where(eq(computersTable.agentToken, body.data.token))
    .limit(1);
  if (!computer) {
    res.status(401).json({ error: "Invalid agent token" });
    return;
  }

  const detail = body.data.detail?.trim();
  const message = body.data.message?.trim();

  switch (body.data.type) {
    case "student_login": {
      const user = safeUser(message ?? detail);
      if (user && !(await hasActiveSession(computer.id))) {
        await startSession(computer.id, computer.name, user);
        await db.insert(eventsTable).values({
          type: "student_login",
          message: `${user} signed in on ${computer.name}`,
          actor: user,
          computerName: computer.name,
        });
      }
      break;
    }
    case "student_logout": {
      const user = safeUser(message ?? detail);
      if (user) {
        await endActiveSessions(computer.id);
        await db.insert(eventsTable).values({
          type: "student_logout",
          message: `${user} signed out of ${computer.name}`,
          actor: user,
          computerName: computer.name,
        });
      }
      break;
    }
    case "usb_connected": {
      const [policy] = await db
        .select()
        .from(usbPoliciesTable)
        .orderBy(usbPoliciesTable.id)
        .limit(1);
      const policyMode = policy?.mode ?? "approval_required";

      const driveMatch = detail?.match(/\b([A-Za-z]):\b/);
      const driveLetter = driveMatch ? driveMatch[1].toUpperCase() : null;
      const serialMatch = detail?.match(/serial=([\w-]+)/i);
      const deviceId = serialMatch ? serialMatch[1].toLowerCase() : null;
      const label = detail ? detail.slice(0, 120) : "Removable device";
      const status = policyMode === "allowed" ? "approved" : "pending";

      const existing = deviceId
        ? await db
            .select()
            .from(usbDevicesTable)
            .where(
              and(
                eq(usbDevicesTable.computerId, computer.id),
                eq(usbDevicesTable.deviceId, deviceId),
              ),
            )
            .limit(1)
        : [];

      if (existing.length === 0) {
        await db.insert(usbDevicesTable).values({
          computerId: computer.id,
          computerName: computer.name,
          deviceId,
          driveLetter,
          label,
          status,
          scanResult: message ?? null,
        });

        if (status === "pending") {
          await db.insert(alertsTable).values({
            severity: "warning",
            title: "USB device awaiting approval",
            detail: `Removable device connected on ${computer.name}${
              driveLetter ? ` (drive ${driveLetter}:)` : ""
            } — review and approve to allow use.`,
            computerName: computer.name,
            status: "open",
          });
        }

        await db.insert(eventsTable).values({
          type: status === "approved" ? "usb_connected" : "usb_blocked",
          message: `Removable device on ${computer.name}${
            driveLetter ? ` (drive ${driveLetter}:)` : ""
          }${status === "pending" ? " awaiting approval" : ""}`,
          actor: "Agent",
          computerName: computer.name,
        });
      }
      break;
    }
    case "login_failure": {
      await db.insert(alertsTable).values({
        severity: "warning",
        title: "Failed login",
        detail: detail ?? message ?? "Failed login attempt",
        computerName: computer.name,
        status: "open",
      });
      await db.insert(eventsTable).values({
        type: "login_failure",
        message: detail ?? message ?? "Failed login attempt",
        actor: "unknown",
        computerName: computer.name,
      });
      break;
    }
    default: {
      await db.insert(eventsTable).values({
        type: body.data.type,
        message: message ?? detail ?? body.data.type,
        actor: "Agent",
        computerName: computer.name,
      });
    }
  }

  res.json(AgentEventResponse.parse({ ok: true }));
});

router.get("/agent/files/download/:fileId", async (req, res): Promise<void> => {
  const fileId = req.params.fileId;
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) {
    res.status(401).json({ error: "Missing agent token" });
    return;
  }

  const [computer] = await db
    .select()
    .from(computersTable)
    .where(eq(computersTable.agentToken, token))
    .limit(1);
  if (!computer) {
    res.status(401).json({ error: "Invalid agent token" });
    return;
  }

  const queued = await db
    .select()
    .from(actionsTable)
    .where(
      and(
        eq(actionsTable.computerId, computer.id),
        eq(actionsTable.status, "queued"),
      ),
    );

  let fileName = "file";
  let matched = false;
  for (const action of queued) {
    try {
      const payload = JSON.parse(action.payload ?? "{}") as Record<string, unknown>;
      if (payload.fileId === fileId) {
        matched = true;
        if (typeof payload.fileName === "string") fileName = payload.fileName;
        break;
      }
    } catch {
      // ignore malformed payloads
    }
  }
  if (!matched) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const filePath = path.join(UPLOADS_DIR, fileId);
  if (!existsSync(filePath)) {
    res.status(404).json({ error: "File no longer available" });
    return;
  }

  res.download(filePath, fileName);
});

router.get("/agent/download", (_req, res): void => {
  if (!existsSync(AGENT_SCRIPT_PATH)) {
    res.status(404).json({ error: "Agent script is not bundled with this build" });
    return;
  }
  res.download(AGENT_SCRIPT_PATH, "lab-agent.ps1");
});

export default router;
