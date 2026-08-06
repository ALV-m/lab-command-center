import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  tenantsTable,
} from "@workspace/db";
import {
  RegisterTenantBody,
  RegisterTenantResponse,
  type TenantAccount,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { provisionTenant, uniqueSlug } from "../lib/tenant";

const router: IRouter = Router();

const mapTenant = (row: typeof tenantsTable.$inferSelect): TenantAccount => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  contactName: row.contactName,
  contactEmail: row.contactEmail,
  status: row.status as TenantAccount["status"],
  createdAt: row.createdAt instanceof Date
    ? row.createdAt.toISOString()
    : String(row.createdAt),
});

router.post("/tenant/register", async (req, res): Promise<void> => {
  const body = RegisterTenantBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { orgName, contactName, contactEmail, username, password } = body.data;
  const slug = await uniqueSlug(orgName);

  const [tenant] = await db
    .insert(tenantsTable)
    .values({
      name: orgName,
      slug,
      contactName,
      contactEmail: contactEmail || null,
      status: "active",
    })
    .returning();

  try {
    await provisionTenant(tenant.id, username, password);
  } catch (err) {
    logger.error({ err, tenantId: tenant.id }, "Failed to provision tenant");
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenant.id)).catch(() => {});
    res.status(500).json({ error: "Could not create the lab account. Please try again." });
    return;
  }

  logger.info({ tenantId: tenant.id, slug }, "New tenant registered");
  res.status(201).json(RegisterTenantResponse.parse({ tenant: mapTenant(tenant) }));
});

export default router;
