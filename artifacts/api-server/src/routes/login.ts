import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  appUsersTable,
  createTenantDb,
  db,
  platformUsersTable,
  pool,
  runInTenant,
  schemaNameFor,
  tenantsTable,
  type Tenant,
} from "@workspace/db";
import { DiscoverLoginResponse, LoginBody } from "@workspace/api-zod";
import {
  createPlatformSession,
  createSession,
  generateSessionToken,
  PLATFORM_COOKIE,
  platformSessionCookieOptions,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "../lib/auth";
import { verifyPassword } from "../lib/passwords";

const router: IRouter = Router();

const mapAdmin = (row: typeof platformUsersTable.$inferSelect) => ({
  id: row.id,
  username: row.username,
  createdAt: row.createdAt instanceof Date
    ? row.createdAt.toISOString()
    : String(row.createdAt),
});

const mapUser = (row: typeof appUsersTable.$inferSelect) => ({
  id: row.id,
  username: row.username,
  role: row.role,
  submenuAccess: row.submenuAccess,
  createdAt: row.createdAt instanceof Date
    ? row.createdAt.toISOString()
    : String(row.createdAt),
});

interface TenantMatch {
  tenantId: number;
  tenantSlug: string;
  tenantName: string;
  user: ReturnType<typeof mapUser>;
}

async function findTenantUserMatch(
  tenant: Tenant,
  username: string,
  password: string,
): Promise<TenantMatch | null> {
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${schemaNameFor(tenant.id)}"`);
    let match: TenantMatch | null = null;
    await runInTenant({ db: createTenantDb(client), tenantId: tenant.id }, async () => {
      const [row] = await db
        .select()
        .from(appUsersTable)
        .where(sql`lower(${appUsersTable.username}) = ${username.toLowerCase()}`)
        .limit(1);
      if (row && verifyPassword(password, row.passwordHash)) {
        match = {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          user: mapUser(row),
        };
      }
    });
    return match;
  } finally {
    await client.query("SET search_path TO public").catch(() => {});
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Platform-wide sign in: one form for both the platform admin and every lab.
// The platform admin is checked first (their account lives in the public
// schema), then each active tenant's schema is searched for a matching user.
// ---------------------------------------------------------------------------

router.post("/login", async (req, res): Promise<void> => {
  const body = LoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid username or password" });
    return;
  }

  const [admin] = await db
    .select()
    .from(platformUsersTable)
    .where(eq(platformUsersTable.username, body.data.username))
    .limit(1);

  if (admin && verifyPassword(body.data.password, admin.passwordHash)) {
    const token = generateSessionToken();
    await createPlatformSession(admin.id, token);
    res.cookie(PLATFORM_COOKIE, token, platformSessionCookieOptions);
    res.json(
      DiscoverLoginResponse.parse({ type: "platform", user: mapAdmin(admin) }),
    );
    return;
  }

  const tenants = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));

  const matches: TenantMatch[] = [];
  for (const tenant of tenants) {
    const match = await findTenantUserMatch(
      tenant,
      body.data.username,
      body.data.password,
    );
    if (match) {
      matches.push(match);
      if (matches.length > 1) break;
    }
  }

  if (matches.length === 0) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  if (matches.length > 1) {
    res.status(409).json({
      error:
        "This username exists in more than one lab. Sign in from your lab address instead.",
      labs: matches.map((m) => ({ slug: m.tenantSlug, name: m.tenantName })),
    });
    return;
  }

  const match = matches[0];
  const token = generateSessionToken();

  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${schemaNameFor(match.tenantId)}"`);
    await runInTenant(
      { db: createTenantDb(client), tenantId: match.tenantId },
      () => createSession(match.user.id, token),
    );
  } finally {
    await client.query("SET search_path TO public").catch(() => {});
    client.release();
  }

  res.cookie(SESSION_COOKIE, token, sessionCookieOptions);
  res.json(
    DiscoverLoginResponse.parse({
      type: "tenant",
      tenantSlug: match.tenantSlug,
      tenantName: match.tenantName,
      user: match.user,
    }),
  );
});

export default router;
