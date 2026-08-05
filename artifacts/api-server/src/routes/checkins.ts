import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, checkinsTable, computersTable, screenshotsTable } from "@workspace/db";
import {
  GetCheckinsResponse,
  GetLatestScreenshotParams,
  GetLatestScreenshotResponse,
  ScreenshotInfo,
} from "@workspace/api-zod";

const router: IRouter = Router();

const UPLOADS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "data",
  "uploads",
);

await mkdir(UPLOADS_DIR, { recursive: true });

const iso = (value: Date | string | null | undefined) =>
  value instanceof Date ? value.toISOString() : value ?? null;

router.get("/lab/checkins", async (_req, res): Promise<void> => {
  const rows = await db.select().from(checkinsTable).orderBy(desc(checkinsTable.submittedAt)).limit(200);
  res.json(
    GetCheckinsResponse.parse({
      checkins: rows.map((row) => ({
        ...row,
        email: row.email ?? undefined,
        photoFileId: row.photoFileId ?? undefined,
        userName: row.userName ?? undefined,
        submittedAt: iso(row.submittedAt) as string,
      })),
    }),
  );
});

router.get("/lab/computers/:computerId/screenshots/latest", async (req, res): Promise<void> => {
  const params = GetLatestScreenshotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid computer id" });
    return;
  }
  const [computer] = await db
    .select()
    .from(computersTable)
    .where(eq(computersTable.id, params.data.computerId))
    .limit(1);
  if (!computer) {
    res.status(404).json({ error: "Computer not found" });
    return;
  }
  const [shot] = await db
    .select()
    .from(screenshotsTable)
    .where(eq(screenshotsTable.computerId, computer.id))
    .orderBy(desc(screenshotsTable.takenAt))
    .limit(1);
  res.json(
    GetLatestScreenshotResponse.parse({
      screenshot: shot
        ? ScreenshotInfo.parse({ fileId: shot.fileId, takenAt: iso(shot.takenAt) as string })
        : null,
    }),
  );
});

router.get("/lab/files/screenshots/:fileId", (req, res): void => {
  const fileId = req.params.fileId ?? "";
  if (!/^[a-f0-9]{32}$/.test(fileId)) {
    res.status(400).json({ error: "Invalid file id" });
    return;
  }
  const filePath = path.join(UPLOADS_DIR, fileId);
  if (!existsSync(filePath)) {
    res.status(404).json({ error: "Screenshot not found" });
    return;
  }
  res.sendFile(filePath);
});

export default router;
