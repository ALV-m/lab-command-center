import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import {
  appUsersTable,
  createTenantDb,
  db,
  dropTenantSchema,
  ensureTenantSchema,
  pool,
  runInTenant,
  schemaNameFor,
  tenantsTable,
  type Tenant,
} from "@workspace/db";
import { SUBMENUS } from "@workspace/api-zod";
import { hashPassword } from "./passwords";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?$/;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function uniqueSlug(base: string): Promise<string> {
  const clean = slugify(base) || "lab";
  let slug = clean;
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [existing] = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.slug, slug))
      .limit(1);
    if (!existing) return slug;
    suffix += 1;
    slug = `${clean}-${suffix}`;
  }
}

export async function resolveTenantBySlug(slug: string): Promise<Tenant | null> {
  const [row] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function resolveTenantById(id: number): Promise<Tenant | null> {
  const [row] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, id))
    .limit(1);
  return row ?? null;
}

// Runs the rest of the request inside the tenant's Postgres schema. The
// exported `db` from @workspace/db transparently routes to the tenant schema
// while this context is active, so existing route handlers work unchanged.
//
// Express 5 does not propagate mount-path parameters (e.g. `:slug` from
// `/t/:slug/api`) into a sub-router's `req.params`, so the slug is read from
// the URL instead.
export function tenantSlugFromRequest(req: Request): string {
  const match = (req.originalUrl ?? req.url).match(/^\/t\/([^/]+)\/api/);
  return match?.[1] ?? "";
}

export async function tenantContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const tenant = await resolveTenantBySlug(tenantSlugFromRequest(req));
  if (!tenant) {
    res.status(404).json({ error: "Lab not found" });
    return;
  }
  if (tenant.status !== "active") {
    res.status(403).json({ error: "This lab account is suspended" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${schemaNameFor(tenant.id)}"`);
    const ctx = { db: createTenantDb(client), tenantId: tenant.id };
    await runInTenant(ctx, () =>
      new Promise<void>((resolve) => {
        let settled = false;
        const settle = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        res.on("finish", settle);
        res.on("close", settle);
        try {
          next();
        } catch (err) {
          settle();
        }
      }),
    );
  } finally {
    // Never hand a connection back to the pool with a tenant search_path, or
    // the next platform-level query could accidentally hit a tenant schema.
    await client.query("SET search_path TO public").catch(() => {});
    client.release();
  }
}

// Creates a new tenant: its Postgres schema with all lab tables plus the
// tenant's initial super admin account.
export async function provisionTenant(
  tenantId: number,
  adminUsername: string,
  adminPassword: string,
): Promise<void> {
  await ensureTenantSchema(tenantId);
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${schemaNameFor(tenantId)}"`);
    await runInTenant({ db: createTenantDb(client), tenantId }, async () => {
      await db.insert(appUsersTable).values({
        username: adminUsername,
        passwordHash: hashPassword(adminPassword),
        role: "super_admin",
        submenuAccess: [...SUBMENUS],
      });
    });
  } finally {
    await client.query("SET search_path TO public").catch(() => {});
    client.release();
  }
}

export async function resetTenantSuperAdmin(
  tenantId: number,
  newPassword: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${schemaNameFor(tenantId)}"`);
    await runInTenant({ db: createTenantDb(client), tenantId }, async () => {
      await db
        .update(appUsersTable)
        .set({ passwordHash: hashPassword(newPassword) })
        .where(eq(appUsersTable.role, "super_admin"));
    });
  } finally {
    await client.query("SET search_path TO public").catch(() => {});
    client.release();
  }
}

export async function deleteTenant(tenantId: number): Promise<void> {
  await dropTenantSchema(tenantId);
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
}

export async function countTenantComputers(tenantId: number): Promise<number> {
  try {
    const result = await pool.query(
      `SELECT count(*)::int AS count FROM "${schemaNameFor(tenantId)}"."lab_computers"`,
    );
    return Number(result.rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

export async function countTenantAdmins(tenantId: number): Promise<number> {
  try {
    const result = await pool.query(
      `SELECT count(*)::int AS count FROM "${schemaNameFor(tenantId)}"."app_users"`,
    );
    return Number(result.rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

export { SLUG_RE, uniqueSlug };
