import app from "./app";
import { db, ensureAllTenantSchemas, ensureSchema, tenantsTable } from "@workspace/db";
import { logger } from "./lib/logger";
import { seedPlatformAdmin } from "./lib/auth";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main() {
  try {
    await ensureSchema();
  } catch (err) {
    logger.warn({ err }, "Could not ensure database schema at startup");
  }

  // Re-create missing schemas for existing tenants (e.g. after a restore).
  try {
    const tenants = await db.select({ id: tenantsTable.id }).from(tenantsTable);
    await ensureAllTenantSchemas(tenants.map((tenant) => tenant.id));
  } catch (err) {
    logger.warn({ err }, "Could not ensure tenant schemas at startup");
  }

  await seedPlatformAdmin();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

main();
