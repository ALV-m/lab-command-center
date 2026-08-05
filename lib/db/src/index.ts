import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";

// ---------------------------------------------------------------------------
// Schema bootstrap
// ---------------------------------------------------------------------------
// DDL is kept in sync with the Drizzle tables declared in ./schema/lab.ts.
// `ensureSchema()` is idempotent (CREATE TABLE IF NOT EXISTS) and is used by
// the deployment scripts and at server startup so a fresh database always has
// the expected tables.
// ---------------------------------------------------------------------------

const DDL_STATEMENTS = [
  `
  CREATE TABLE IF NOT EXISTS lab_computers (
    id serial PRIMARY KEY,
    name text NOT NULL,
    room text NOT NULL,
    status text NOT NULL DEFAULT 'offline',
    user_name text,
    last_seen timestamptz NOT NULL DEFAULT now(),
    os text NOT NULL DEFAULT 'Windows 11 Pro',
    usb_state text NOT NULL DEFAULT 'blocked',
    keyboard boolean NOT NULL DEFAULT true,
    mouse boolean NOT NULL DEFAULT true,
    agent_token text,
    agent_version text,
    av_enabled boolean,
    av_signature text,
    av_last_scan_at timestamptz
  );
  `,
  `
  ALTER TABLE lab_computers ADD COLUMN IF NOT EXISTS agent_token text;
  ALTER TABLE lab_computers ADD COLUMN IF NOT EXISTS agent_version text;
  ALTER TABLE lab_computers ADD COLUMN IF NOT EXISTS av_enabled boolean;
  ALTER TABLE lab_computers ADD COLUMN IF NOT EXISTS av_signature text;
  ALTER TABLE lab_computers ADD COLUMN IF NOT EXISTS av_last_scan_at timestamptz;
  ALTER TABLE lab_computers ADD COLUMN IF NOT EXISTS av_scan_state text;
  ALTER TABLE lab_computers ADD COLUMN IF NOT EXISTS firewall_enabled boolean;
  ALTER TABLE lab_computers ADD COLUMN IF NOT EXISTS firewall_profiles text;
  `,
  `
  CREATE TABLE IF NOT EXISTS lab_actions (
    id serial PRIMARY KEY,
    computer_id integer NOT NULL,
    action text NOT NULL,
    status text NOT NULL DEFAULT 'queued',
    message text,
    payload text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  `,
  `
  ALTER TABLE lab_actions ADD COLUMN IF NOT EXISTS payload text;
  `,
  `
  CREATE TABLE IF NOT EXISTS lab_alerts (
    id serial PRIMARY KEY,
    severity text NOT NULL,
    title text NOT NULL,
    detail text NOT NULL,
    computer_name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'open'
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS lab_usb_policies (
    id serial PRIMARY KEY,
    name text NOT NULL,
    description text NOT NULL,
    mode text NOT NULL DEFAULT 'approval_required',
    scope text NOT NULL DEFAULT 'all',
    computer_ids integer[],
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS lab_student_sessions (
    id serial PRIMARY KEY,
    student_name text NOT NULL,
    student_id text NOT NULL,
    computer_id integer NOT NULL,
    computer_name text NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    status text NOT NULL DEFAULT 'active'
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS lab_events (
    id serial PRIMARY KEY,
    type text NOT NULL,
    message text NOT NULL,
    actor text NOT NULL,
    computer_name text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  `,
  `
  ALTER TABLE lab_events ADD COLUMN IF NOT EXISTS computer_name text;
  `,
  `
  CREATE TABLE IF NOT EXISTS lab_usb_devices (
    id serial PRIMARY KEY,
    computer_id integer NOT NULL,
    computer_name text NOT NULL,
    device_id text,
    drive_letter text,
    label text,
    status text NOT NULL DEFAULT 'pending',
    scan_result text,
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS lab_peripherals (
    id serial PRIMARY KEY,
    computer_id integer NOT NULL,
    computer_name text NOT NULL,
    kind text NOT NULL,
    name text NOT NULL,
    instance_id text NOT NULL,
    present boolean NOT NULL DEFAULT true,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_changed_at timestamptz NOT NULL DEFAULT now()
  );
  `,
  `
  ALTER TABLE lab_peripherals ADD COLUMN IF NOT EXISTS last_changed_at timestamptz;
  CREATE UNIQUE INDEX IF NOT EXISTS lab_peripherals_computer_instance_idx
    ON lab_peripherals (computer_id, instance_id);
  `,
  `
  CREATE TABLE IF NOT EXISTS lab_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS lab_scan_runs (
    id serial PRIMARY KEY,
    action text NOT NULL,
    initiated_by text NOT NULL,
    status text NOT NULL DEFAULT 'queued',
    requested_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
  );
  CREATE TABLE IF NOT EXISTS lab_scan_results (
    id serial PRIMARY KEY,
    run_id integer NOT NULL,
    computer_id integer NOT NULL,
    computer_name text NOT NULL,
    status text NOT NULL DEFAULT 'queued',
    detail text,
    finished_at timestamptz
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS lab_file_entries (
    id serial PRIMARY KEY,
    computer_id integer NOT NULL,
    path text NOT NULL,
    name text NOT NULL,
    is_dir boolean NOT NULL DEFAULT false,
    size bigint NOT NULL DEFAULT 0,
    modified_at text,
    listed_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS lab_file_entries_computer_path_idx
    ON lab_file_entries (computer_id, path);
  `,
];

export async function ensureSchema(): Promise<void> {
  for (const statement of DDL_STATEMENTS) {
    await pool.query(statement);
  }
}
