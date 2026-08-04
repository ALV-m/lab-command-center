import { Router, type IRouter } from "express";
import { and, eq, like } from "drizzle-orm";
import { db, alertsTable, computersTable, eventsTable, peripheralsTable } from "@workspace/db";
import {
  AgentPeripheralsBody,
  AgentPeripheralsResponse,
  GetPeripheralsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

interface ReportedDevice {
  kind: string;
  name: string;
  instanceId: string;
  present: boolean;
}

const iso = (value: Date | string | null | undefined) =>
  value instanceof Date ? value.toISOString() : value ?? null;

const kindLabel = (kind: string): string =>
  kind === "keyboard" ? "Keyboard" : kind === "mouse" ? "Mouse" : kind === "monitor" ? "Monitor" : "Display";

async function recordDisconnect(
  computerName: string,
  device: ReportedDevice,
  user: string | null,
): Promise<void> {
  const who = user?.trim() ? user.trim() : "unknown";
  await db.insert(eventsTable).values({
    type: "peripheral_disconnect",
    message: `${kindLabel(device.kind)} disconnected on ${computerName}: ${device.name}`,
    actor: who,
    computerName,
  });
  await db.insert(alertsTable).values({
    severity: "warning",
    title: "Peripheral disconnected",
    detail: `${kindLabel(device.kind)} "${device.name}" disconnected on ${computerName}${
      who !== "unknown" ? ` (user: ${who})` : ""
    } [${device.instanceId}]`,
    computerName,
    status: "open",
  });
}

async function recordReconnect(
  computerName: string,
  device: ReportedDevice,
  user: string | null,
): Promise<void> {
  const who = user?.trim() ? user.trim() : "unknown";
  await db.insert(eventsTable).values({
    type: "peripheral_connect",
    message: `${kindLabel(device.kind)} reconnected on ${computerName}: ${device.name}`,
    actor: who,
    computerName,
  });
  await db
    .update(alertsTable)
    .set({ status: "resolved" })
    .where(
      and(
        eq(alertsTable.computerName, computerName),
        eq(alertsTable.title, "Peripheral disconnected"),
        eq(alertsTable.status, "open"),
        like(alertsTable.detail, `%${device.instanceId}%`),
      ),
    );
}

router.post("/agent/peripherals", async (req, res): Promise<void> => {
  const body = AgentPeripheralsBody.safeParse(req.body);
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

  const user = body.data.user?.trim() ? body.data.user.trim() : null;
  const reported = body.data.devices;
  const now = new Date();

  const existing = await db
    .select()
    .from(peripheralsTable)
    .where(eq(peripheralsTable.computerId, computer.id));
  const byInstance = new Map(existing.map((row) => [row.instanceId, row]));

  for (const device of reported) {
    const prev = byInstance.get(device.instanceId);
    if (prev) {
      byInstance.delete(device.instanceId);
      if (prev.present !== device.present) {
        await db
          .update(peripheralsTable)
          .set({ present: device.present, lastChangedAt: now })
          .where(eq(peripheralsTable.id, prev.id));
        if (device.present) {
          await recordReconnect(computer.name, device, user);
        } else {
          await recordDisconnect(computer.name, device, user);
        }
      }
    } else {
      await db.insert(peripheralsTable).values({
        computerId: computer.id,
        computerName: computer.name,
        kind: device.kind,
        name: device.name,
        instanceId: device.instanceId,
        present: device.present,
        lastChangedAt: now,
      });
      if (!device.present) {
        await recordDisconnect(computer.name, device, user);
      }
    }
  }

  for (const prev of byInstance.values()) {
    if (prev.present) {
      const device: ReportedDevice = {
        kind: prev.kind,
        name: prev.name,
        instanceId: prev.instanceId,
        present: false,
      };
      await db
        .update(peripheralsTable)
        .set({ present: false, lastChangedAt: now })
        .where(eq(peripheralsTable.id, prev.id));
      await recordDisconnect(computer.name, device, user);
    }
  }

  res.json(AgentPeripheralsResponse.parse({ ok: true }));
});

router.get("/lab/peripherals", async (req, res): Promise<void> => {
  const computerId = Number(req.query.computerId);
  const rows = await db
    .select()
    .from(peripheralsTable)
    .where(Number.isFinite(computerId) && computerId > 0 ? eq(peripheralsTable.computerId, computerId) : undefined)
    .orderBy(peripheralsTable.computerName, peripheralsTable.kind, peripheralsTable.name);

  res.json(
    GetPeripheralsResponse.parse(
      rows.map((row) => ({
        ...row,
        firstSeenAt: iso(row.firstSeenAt) as string,
        lastChangedAt: iso(row.lastChangedAt) as string,
      })),
    ),
  );
});

export default router;
