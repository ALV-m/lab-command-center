import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  platformUsersTable,
  tenantsTable,
} from "@workspace/db";
import {
  AdminAccount,
  AdminLoginBody,
  AdminLoginResponse,
  AdminMeResponse,
  AdminLogoutResponse,
  PlatformStatsResponse,
  TenantAdminPasswordBody,
  TenantIdParams,
  TenantsListResponse,
  TenantStatusUpdateBody,
  type TenantListItem,
} from "@workspace/api-zod";
import {
  createPlatformSession,
  deletePlatformSession,
  generateSessionToken,
  PLATFORM_COOKIE,
  platformSessionCookieOptions,
  requirePlatformAuth,
} from "../lib/auth";
import { hashPassword, verifyPassword } from "../lib/passwords";
import {
  countTenantAdmins,
  countTenantComputers,
  deleteTenant,
  resetTenantSuperAdmin,
} from "../lib/tenant";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const mapAdmin = (row: typeof platformUsersTable.$inferSelect): AdminAccount => ({
  id: row.id,
  username: row.username,
  createdAt: row.createdAt instanceof Date
    ? row.createdAt.toISOString()
    : String(row.createdAt),
});

async function findPlatformUser(username: string) {
  const [row] = await db
    .select()
    .from(platformUsersTable)
    .where(eq(platformUsersTable.username, username))
    .limit(1);
  return row ?? null;
}

router.post("/admin/login", async (req, res): Promise<void> => {
  const body = AdminLoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid username or password" });
    return;
  }

  const user = await findPlatformUser(body.data.username);
  if (!user || !verifyPassword(body.data.password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const token = generateSessionToken();
  await createPlatformSession(user.id, token);
  res.cookie(PLATFORM_COOKIE, token, platformSessionCookieOptions);

  res.json(AdminLoginResponse.parse({ user: mapAdmin(user) }));
});

router.post("/admin/logout", async (req, res): Promise<void> => {
  const token = typeof req.cookies?.[PLATFORM_COOKIE] === "string"
    ? req.cookies[PLATFORM_COOKIE]
    : "";
  if (token) {
    await deletePlatformSession(token);
  }
  res.clearCookie(PLATFORM_COOKIE, { path: "/" });
  res.json(AdminLogoutResponse.parse({ ok: true }));
});

router.use("/admin", requirePlatformAuth);

router.get("/admin/me", async (req, res): Promise<void> => {
  const admin = req.platformAdmin!;
  const [row] = await db
    .select()
    .from(platformUsersTable)
    .where(eq(platformUsersTable.id, admin.id))
    .limit(1);
  if (!row) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(AdminMeResponse.parse({ user: mapAdmin(row) }));
});

router.get("/admin/tenants", async (_req, res): Promise<void> => {
  const rows = await db.select().from(tenantsTable).orderBy(tenantsTable.id);

  const items: TenantListItem[] = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      contactName: row.contactName,
      contactEmail: row.contactEmail,
      status: row.status as TenantListItem["status"],
      createdAt: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      computers: await countTenantComputers(row.id),
      admins: await countTenantAdmins(row.id),
    })),
  );

  res.json(TenantsListResponse.parse({ tenants: items }));
});

router.get("/admin/stats", async (_req, res): Promise<void> => {
  const rows = await db.select().from(tenantsTable);
  const active = rows.filter((row) => row.status === "active").length;
  const suspended = rows.length - active;

  let totalComputers = 0;
  let totalAdmins = 0;
  for (const row of rows) {
    totalComputers += await countTenantComputers(row.id);
    totalAdmins += await countTenantAdmins(row.id);
  }

  res.json(
    PlatformStatsResponse.parse({
      totalTenants: rows.length,
      activeTenants: active,
      suspendedTenants: suspended,
      totalComputers,
      totalAdmins,
    }),
  );
});

router.patch("/admin/tenants/:tenantId", async (req, res): Promise<void> => {
  const params = TenantIdParams.safeParse(req.params);
  const body = TenantStatusUpdateBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid tenant update" });
    return;
  }

  const [existing] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, params.data.tenantId))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const [updated] = await db
    .update(tenantsTable)
    .set({ status: body.data.status })
    .where(eq(tenantsTable.id, existing.id))
    .returning();

  logger.info(
    { tenantId: existing.id, status: body.data.status },
    "Tenant status updated",
  );
  res.json({
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    contactName: updated.contactName,
    contactEmail: updated.contactEmail,
    status: updated.status,
    createdAt: updated.createdAt instanceof Date
      ? updated.createdAt.toISOString()
      : String(updated.createdAt),
  });
});

router.post("/admin/tenants/:tenantId/reset-password", async (req, res): Promise<void> => {
  const params = TenantIdParams.safeParse(req.params);
  const body = TenantAdminPasswordBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid password" });
    return;
  }

  const tenant = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, params.data.tenantId))
    .limit(1);
  if (tenant.length === 0) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  await resetTenantSuperAdmin(params.data.tenantId, body.data.password);
  res.json({ ok: true });
});

router.delete("/admin/tenants/:tenantId", async (req, res): Promise<void> => {
  const params = TenantIdParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid tenant id" });
    return;
  }

  const [existing] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, params.data.tenantId))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  await deleteTenant(existing.id);
  logger.info({ tenantId: existing.id }, "Tenant deleted");
  res.json({ ok: true });
});

export default router;
