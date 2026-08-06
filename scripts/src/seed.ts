import { eq } from "drizzle-orm";
import {
  appUsersTable,
  computersTable,
  createTenantDb,
  db,
  ensureTenantSchema,
  eventsTable,
  pool,
  runInTenant,
  schemaNameFor,
  studentSessionsTable,
  tenantsTable,
  usbPoliciesTable,
} from "@workspace/db";
import { SUBMENUS } from "@workspace/api-zod";
import { randomBytes, scryptSync } from "node:crypto";

const DEMO_SLUG = "demo-lab";
const DEMO_ADMIN_USERNAME = "admin";
const DEMO_ADMIN_PASSWORD = "admin123";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

const [existingTenant] = await db
  .select({ id: tenantsTable.id })
  .from(tenantsTable)
  .where(eq(tenantsTable.slug, DEMO_SLUG))
  .limit(1);

if (existingTenant) {
  console.log("[seed] Demo tenant already exists — skipping.");
  process.exit(0);
}

const [tenant] = await db
  .insert(tenantsTable)
  .values({
    name: "Demo Lab",
    slug: DEMO_SLUG,
    contactName: "Demo Owner",
    contactEmail: "demo@example.com",
    status: "active",
  })
  .returning();

await ensureTenantSchema(tenant.id);

const client = await pool.connect();
try {
  await client.query(`SET search_path TO "${schemaNameFor(tenant.id)}"`);
  await runInTenant({ db: createTenantDb(client), tenantId: tenant.id }, async () => {
    await db.insert(appUsersTable).values({
      username: DEMO_ADMIN_USERNAME,
      passwordHash: hashPassword(DEMO_ADMIN_PASSWORD),
      role: "super_admin",
      submenuAccess: [...SUBMENUS],
    });

    const inserted = await db
      .insert(computersTable)
      .values([
        { name: "PC-01", room: "Room 101", status: "online", userName: "Priya Sharma", os: "Windows 11 Pro", usbState: "allowed", keyboard: true, mouse: true },
        { name: "PC-02", room: "Room 101", status: "online", userName: "Marcus Chen", os: "Windows 11 Pro", usbState: "allowed", keyboard: true, mouse: true },
        { name: "PC-03", room: "Room 102", status: "offline", userName: null, os: "Ubuntu 24.04", usbState: "blocked", keyboard: true, mouse: true },
      ])
      .returning({ id: computersTable.id, name: computersTable.name });

    const byName = new Map(inserted.map((computer) => [computer.name, computer.id]));
    const pc01 = byName.get("PC-01")!;
    const pc02 = byName.get("PC-02")!;

    await db.insert(studentSessionsTable).values([
      {
        studentName: "Priya Sharma",
        studentId: "20260012",
        computerId: pc01,
        computerName: "PC-01",
        status: "active",
        startedAt: minutesAgo(42),
      },
      {
        studentName: "Marcus Chen",
        studentId: "20260077",
        computerId: pc02,
        computerName: "PC-02",
        status: "active",
        startedAt: minutesAgo(28),
      },
    ]);

    await db.insert(usbPoliciesTable).values([
      {
        name: "Default removable media policy",
        description: "Controls flash drives, phones, and other removable storage in the lab.",
        mode: "allowed",
        scope: "all",
        updatedAt: minutesAgo(60),
      },
    ]);

    await db.insert(eventsTable).values([
      { type: "student_login", message: "Priya Sharma signed in on PC-01", actor: "Priya Sharma", createdAt: minutesAgo(42) },
      { type: "student_login", message: "Marcus Chen signed in on PC-02", actor: "Marcus Chen", createdAt: minutesAgo(28) },
      { type: "usb_policy_change", message: "USB policy set to allowed for all computers", actor: "Demo Owner", createdAt: minutesAgo(60) },
    ]);
  });
} finally {
  await client.query("SET search_path TO public").catch(() => {});
  client.release();
}

console.log(
  `[seed] Created demo tenant "${DEMO_SLUG}" with 3 computers. ` +
    `Sign in at /t/${DEMO_SLUG}/login as ${DEMO_ADMIN_USERNAME}/${DEMO_ADMIN_PASSWORD}.`,
);
process.exit(0);
