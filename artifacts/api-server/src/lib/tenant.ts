import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import {
  appUsersTable,
  authSessionsTable,
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

// Pool-based tenant lookup. Unlike `resolveTenantBySlug`, this always hits the
// public schema, so it is safe to call while a tenant schema context is active
// (e.g. from the tenant auth router that runs under `tenantContextMiddleware`).
export async function getTenantBySlugPublic(slug: string): Promise<Tenant | null> {
  const result = await pool.query<Tenant>(
    `SELECT id, name, slug, contact_name AS "contactName",
            contact_email AS "contactEmail", status, created_at AS "createdAt"
       FROM tenants WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  return result.rows[0] ?? null;
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

// Returns the tenant's super admin login username (the account their admins
// use to sign in to the lab), or null if none exists yet.
export async function getTenantSuperAdminUsername(tenantId: number): Promise<string | null> {
  try {
    const result = await pool.query(
      `SELECT username FROM "${schemaNameFor(tenantId)}"."app_users" WHERE role = 'super_admin' LIMIT 1`,
    );
    return result.rows[0]?.username ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Password-less login links
// ---------------------------------------------------------------------------
// The platform owner can mint a one-time, short-lived link that signs the
// tenant's super admin in without a password. The token is stored on the
// `tenants` row (public schema); the tenant's `/auth/login-link` route verifies
// it and establishes a normal dashboard session for the super admin.

export const LOGIN_LINK_TTL_MS = 15 * 60 * 1000;

export async function createTenantLoginLink(tenantId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + LOGIN_LINK_TTL_MS);
  await pool.query(
    `UPDATE tenants SET login_token = $1, login_token_expires_at = $2 WHERE id = $3`,
    [token, expiresAt, tenantId],
  );
  return { token, expiresAt };
}

export async function consumeTenantLoginLink(tenantId: number, token: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE tenants
        SET login_token = NULL, login_token_expires_at = NULL
      WHERE id = $1
        AND login_token = $2
        AND login_token_expires_at > now()`,
    [tenantId, token],
  );
  return (result.rowCount ?? 0) > 0;
}

// Creates a dashboard session for the tenant's super admin inside the tenant
// schema, then returns a (userId, sessionToken) pair the caller can use to set
// the session cookie.
export async function createTenantSuperAdminSession(tenantId: number): Promise<
  { userId: number; sessionToken: string } | null
> {
  const sessionToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${schemaNameFor(tenantId)}"`);
    const created = await runInTenant(
      { db: createTenantDb(client), tenantId },
      async () => {
        const [user] = await db
          .select({ id: appUsersTable.id })
          .from(appUsersTable)
          .where(eq(appUsersTable.role, "super_admin"))
          .limit(1);
        if (!user) return null;
        await db.insert(authSessionsTable).values({
          id: sessionToken,
          userId: user.id,
          expiresAt,
        });
        return { userId: user.id };
      },
    );
    return created ? { userId: created.userId, sessionToken } : null;
  } finally {
    await client.query("SET search_path TO public").catch(() => {});
    client.release();
  }
}

export { SLUG_RE, uniqueSlug };
