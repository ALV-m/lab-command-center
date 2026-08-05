import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import express from "express";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "@workspace/db";
import { actionsTable, computersTable, eventsTable } from "@workspace/db";
import {
  BroadcastDeleteFilesBody,
  BroadcastDeleteFilesResponse,
  BroadcastPushFileResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const UPLOADS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "data",
  "uploads",
);

await mkdir(UPLOADS_DIR, { recursive: true });

const parseIdsHeader = (value: unknown): number[] | null => {
  if (typeof value !== "string") return null;
  const ids = value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  return ids.length > 0 ? Array.from(new Set(ids)) : null;
};

const resolveComputers = async (
  ids: number[] | null,
): Promise<typeof computersTable.$inferSelect[]> => {
  if (ids && ids.length > 0) {
    const computers: typeof computersTable.$inferSelect[] = [];
    for (const id of ids) {
      const [row] = await db
        .select()
        .from(computersTable)
        .where(eq(computersTable.id, id))
        .limit(1);
      if (row) computers.push(row);
    }
    return computers;
  }
  return db.select().from(computersTable);
};

router.post(
  "/lab/files/broadcast",
  express.raw({ type: () => true, limit: "64mb" }),
  async (req, res): Promise<void> => {
    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: "Invalid upload" });
      return;
    }

    const rawName = typeof req.headers["x-file-name"] === "string" ? req.headers["x-file-name"] : "";
    let fileName = "file.bin";
    try {
      const decoded = decodeURIComponent(rawName).trim();
      if (decoded) fileName = decoded;
    } catch {
      // fall back to the default name
    }
    const safeName = path.basename(fileName);
    const initiatedBy =
      (typeof req.headers["x-initiated-by"] === "string"
        ? req.headers["x-initiated-by"].trim()
        : "") || "Lab administrator";

    const computers = await resolveComputers(parseIdsHeader(req.headers["x-computer-ids"]));
    const targets = computers.filter((computer) => Boolean(computer.agentToken));
    if (targets.length === 0) {
      res.json(
        BroadcastPushFileResponse.parse({ fileName: safeName, size: req.body.byteLength, queued: 0 }),
      );
      return;
    }

    const fileId = randomUUID();
    await writeFile(path.join(UPLOADS_DIR, fileId), req.body);
    const size = req.body.byteLength;

    for (const computer of targets) {
      await db.insert(actionsTable).values({
        computerId: computer.id,
        action: "push_file",
        message: `Push file "${safeName}" to ${computer.name}`,
        payload: JSON.stringify({ fileId, fileName: safeName, size }),
        status: "queued",
      });
    }

    const scope = parseIdsHeader(req.headers["x-computer-ids"])
      ? `${targets.length} computer(s)`
      : `${targets.length} computer(s) (all)`;

    await db.insert(eventsTable).values({
      type: "operator_action",
      message: `File "${safeName}" (${size} bytes) queued for ${scope} by ${initiatedBy}`,
      actor: initiatedBy,
    });

    res.status(201).json(
      BroadcastPushFileResponse.parse({ fileName: safeName, size, queued: targets.length }),
    );
  },
);

router.post("/lab/files/delete-broadcast", async (req, res): Promise<void> => {
  const body = BroadcastDeleteFilesBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const initiatedBy = body.data.initiatedBy?.trim() || "Lab administrator";
  const computers = await resolveComputers(body.data.computerIds ?? null);
  const targets = computers.filter((computer) => Boolean(computer.agentToken));
  if (targets.length === 0) {
    res.json(BroadcastDeleteFilesResponse.parse({ queued: 0 }));
    return;
  }

  for (const computer of targets) {
    await db.insert(actionsTable).values({
      computerId: computer.id,
      action: "delete_file",
      message: `Delete "${body.data.path}" on ${computer.name}`,
      payload: JSON.stringify({ path: body.data.path }),
      status: "queued",
    });
  }

  const scope = body.data.computerIds && body.data.computerIds.length > 0
    ? `${targets.length} computer(s)`
    : `${targets.length} computer(s) (all)`;

  await db.insert(eventsTable).values({
    type: "operator_action",
    message: `Delete "${body.data.path}" queued for ${scope} by ${initiatedBy}`,
    actor: initiatedBy,
  });

  res.json(BroadcastDeleteFilesResponse.parse({ queued: targets.length }));
});

export default router;
