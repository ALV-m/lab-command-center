import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import {
  GetLabSettingsResponse,
  UpdateLabSettingsBody,
  UpdateLabSettingsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const IDLE_KEY = "idle_logout_minutes";
const SIGNIN_KEY = "signin_method";
const SHARED_USER_KEY = "shared_account_user";
const SHARED_PASS_KEY = "shared_account_password";

async function readSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, key))
    .limit(1);
  return row?.value ?? null;
}

async function writeSetting(key: string, value: string | null): Promise<void> {
  if (value == null) {
    await db.delete(settingsTable).where(eq(settingsTable.key, key));
    return;
  }
  await db
    .insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

async function idleLogoutMinutes(): Promise<number | null> {
  const raw = await readSetting(IDLE_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(600, Math.floor(parsed));
}

async function signinMethod(): Promise<"password" | "shared_account" | null> {
  return (await readSetting(SIGNIN_KEY)) as "password" | "shared_account" | null;
}

router.get("/lab/settings", async (_req, res): Promise<void> => {
  res.json(
    GetLabSettingsResponse.parse({
      idleLogoutMinutes: await idleLogoutMinutes(),
      signinMethod: await signinMethod(),
      sharedAccountUser: await readSetting(SHARED_USER_KEY),
      sharedAccountPassword: await readSetting(SHARED_PASS_KEY),
    }),
  );
});

router.patch("/lab/settings", async (req, res): Promise<void> => {
  const body = UpdateLabSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  await writeSetting(IDLE_KEY, body.data.idleLogoutMinutes == null ? null : String(body.data.idleLogoutMinutes));
  await writeSetting(SIGNIN_KEY, body.data.signinMethod ?? null);
  await writeSetting(SHARED_USER_KEY, body.data.sharedAccountUser ?? null);
  await writeSetting(SHARED_PASS_KEY, body.data.sharedAccountPassword ?? null);
  res.json(
    UpdateLabSettingsResponse.parse({
      idleLogoutMinutes: await idleLogoutMinutes(),
      signinMethod: await signinMethod(),
      sharedAccountUser: await readSetting(SHARED_USER_KEY),
      sharedAccountPassword: await readSetting(SHARED_PASS_KEY),
    }),
  );
});

export default router;
