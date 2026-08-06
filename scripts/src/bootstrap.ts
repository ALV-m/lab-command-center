import { sql } from "drizzle-orm";
import { db, ensureSchema, tenantsTable } from "@workspace/db";

try {
  await ensureSchema();
  const result = await db.execute<{ count: string }>(
    sql`select count(*)::int as count from tenants`,
  );
  const count = Number(result.rows[0]?.count ?? 0);
  console.log(`[bootstrap] Schema ready. ${count} tenant(s) currently registered.`);
  process.exit(0);
} catch (error) {
  console.error("[bootstrap] Failed to ensure schema:", error);
  process.exit(1);
}
