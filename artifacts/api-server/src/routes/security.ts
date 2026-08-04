import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, actionsTable, computersTable, eventsTable, scanResultsTable, scanRunsTable } from "@workspace/db";
import {
  SecurityBroadcastBody,
  SecurityBroadcastResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const ACTION_LABEL: Record<string, string> = {
  av_scan: "antivirus scan",
  av_update: "antivirus definitions update",
  av_toggle: "antivirus toggle",
  fw_enable: "firewall enable",
  fw_disable: "firewall disable",
};

const csvEscape = (value: string | number | boolean | null | undefined): string => {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
};

router.post("/security/broadcast", async (req, res): Promise<void> => {
  const body = SecurityBroadcastBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const initiatedBy = body.data.initiatedBy?.trim() || "Lab administrator";

  let computers: typeof computersTable.$inferSelect[] = [];
  if (body.data.computerIds && body.data.computerIds.length > 0) {
    for (const id of body.data.computerIds) {
      const [row] = await db
        .select()
        .from(computersTable)
        .where(eq(computersTable.id, id))
        .limit(1);
      if (row) computers.push(row);
    }
  } else {
    computers = await db.select().from(computersTable);
  }

  const scannable = body.data.action === "av_scan" || body.data.action === "av_update";
  const queuedComputers = computers.filter((computer) => Boolean(computer.agentToken));

  if (queuedComputers.length === 0) {
    res.json(SecurityBroadcastResponse.parse({ runId: null, queued: 0 }));
    return;
  }

  let runId: number | null = null;
  if (scannable) {
    const [run] = await db
      .insert(scanRunsTable)
      .values({
        action: body.data.action === "av_scan"
          ? `av_scan:${body.data.type ?? "quick"}`
          : "av_update",
        initiatedBy,
        status: "queued",
      })
      .returning();
    runId = run.id;
  }

  for (const computer of queuedComputers) {
    let resultId: number | null = null;
    if (scannable && runId) {
      const [result] = await db
        .insert(scanResultsTable)
        .values({
          runId,
          computerId: computer.id,
          computerName: computer.name,
          status: "queued",
        })
        .returning();
      resultId = result.id;
    }

    let payload: string | null = null;
    if (body.data.action === "av_scan") {
      const base = { type: body.data.type ?? "quick" } as Record<string, unknown>;
      if (runId && resultId) {
        base.scanRunId = runId;
        base.scanResultId = resultId;
      }
      payload = JSON.stringify(base);
    } else if (body.data.action === "av_update") {
      const base: Record<string, unknown> = {};
      if (runId && resultId) {
        base.scanRunId = runId;
        base.scanResultId = resultId;
      }
      payload = JSON.stringify(base);
    } else if (body.data.action === "av_toggle") {
      payload = JSON.stringify({ enabled: body.data.enabled ?? true });
    }

    await db.insert(actionsTable).values({
      computerId: computer.id,
      action: body.data.action,
      message: `${ACTION_LABEL[body.data.action] ?? body.data.action} requested by ${initiatedBy}`,
      payload,
      status: "queued",
    });
  }

  const scope = body.data.computerIds && body.data.computerIds.length > 0
    ? `${queuedComputers.length} computer(s)`
    : `${queuedComputers.length} computer(s) (all)`;

  await db.insert(eventsTable).values({
    type: "operator_action",
    message: `${ACTION_LABEL[body.data.action] ?? body.data.action} queued for ${scope} by ${initiatedBy}`,
    actor: initiatedBy,
  });

  res.json(SecurityBroadcastResponse.parse({ runId, queued: queuedComputers.length }));
});

router.get("/security/health.csv", async (_req, res): Promise<void> => {
  const computers = await db.select().from(computersTable).orderBy(computersTable.name);

  const rows = computers.map((computer) => [
    computer.name,
    computer.status,
    computer.userName ?? "",
    computer.avEnabled == null ? "" : computer.avEnabled ? "enabled" : "disabled",
    computer.avSignature ?? "",
    computer.avLastScanAt ? computer.avLastScanAt.toISOString() : "",
    computer.avScanState ?? "",
    computer.firewallEnabled == null ? "" : computer.firewallEnabled ? "enabled" : "disabled",
    computer.firewallProfiles ?? "",
    computer.lastSeen.toISOString(),
  ]);

  const csv = [
    ["Computer", "Status", "User", "Antivirus", "Definitions", "Last scan", "Scan state", "Firewall", "Firewall profiles", "Last seen"],
    ...rows,
  ]
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="security-health-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\uFEFF${csv}`);
});

export default router;
