# Lab Command Center

A complete management dashboard for a computer lab: track computers, run operator actions (lock, unlock, restart, send messages, push files), monitor alerts, control USB policies with scan-before-use approval, and record student attendance and violations — all behind one Express API that also serves the React frontend. Each lab PC runs a zero-dependency PowerShell agent (`lab-agent.ps1`) that phones home to the server.

## Features

- **Dashboard** — live lab summary, status distribution chart, recent alerts.
- **Computers** — searchable/filterable list with per-machine actions (lock, unlock, restart, wake, send message, remote control, block/allow USB, push file, delete file, antivirus scan). New machines register automatically when the agent first runs.
- **Alerts** — acknowledge and resolve alerts raised across the lab.
- **USB policy** — set removable-media policy to allowed/blocked/review for all or selected computers; USB device connections are scanned and must be approved before they can be used.
- **Reports** — attendance (student sign-in/out) and violations (blocked USB, unexpected devices, failed logins) with JSON + CSV export.
- **Agent** — download `lab-agent.ps1` and install it on each lab PC; it reports heartbeat/status, tracks logins, scans and reports USB devices, and executes queued actions.
- **Events** — an audit log of operator actions, logins, and USB events.
- **Deployment** — a `render.yaml` blueprint for the web service with schema bootstrap and seed data.

## Tech stack

| Layer      | Stack                                                        |
| ---------- | ------------------------------------------------------------ |
| Frontend   | React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui, wouter, TanStack Query, recharts, sonner |
| API        | Express 5, Zod 3 (v4 API), pino logging, esbuild bundling    |
| Database   | PostgreSQL, Drizzle ORM, `node-postgres`                     |
| Tooling    | pnpm workspaces with a shared version catalog                |

## Repository layout

```
lab-command-center/
├── artifacts/
│   ├── api-server/          # Express API, serves the built frontend too
│   └── lab-control/         # React dashboard (Vite)
├── lib/
│   ├── api-zod/             # Zod schemas shared by the server and client
│   ├── api-client-react/    # Typed fetch client + React Query hooks
│   └── db/                  # Drizzle schema, pool, and idempotent ensureSchema()
├── scripts/                 # DB bootstrap + seed scripts
├── render.yaml              # Render blueprint (DB + web service)
├── pnpm-workspace.yaml      # Workspace + version catalog
└── tsconfig.base.json
```

## Prerequisites

- Node.js >= 20 (tested on 22)
- pnpm >= 11 (`corepack enable` if needed)
- A PostgreSQL database (local or hosted)

## Running locally

1. **Install dependencies**

   ```sh
   pnpm install
   ```

2. **Configure environment** — copy the example file and fill in real values:

   ```sh
   cp .env.example .env
   ```

   Required variables:

   - `DATABASE_URL` — PostgreSQL connection string.
   - `PORT` — port for the API (default 3000).
   - `BASE_PATH` — base path for the frontend build (keep `/`).

3. **Create and seed the schema**

   ```sh
   pnpm run db:setup
   ```

   This runs `db:bootstrap` (idempotent `CREATE TABLE IF NOT EXISTS`) followed by `db:seed` (sample computers, alerts, sessions, events — skipped if already seeded).

4. **Build**

   ```sh
   pnpm run build
   ```

   The Vite config requires `PORT` and `BASE_PATH` to be set in the environment (as above).

5. **Run**

   ```sh
   pnpm start
   ```

   The server listens on `PORT` (e.g. `http://localhost:3000`). It serves:

   - the built dashboard at `/`,
   - the API under `/api`.

   For development with hot reload:

   ```sh
   pnpm --filter @workspace/lab-control run dev   # Vite dev server on PORT
   pnpm --filter @workspace/api-server run dev    # bundled API on PORT
   ```

## API

| Method | Path                              | Description                              |
| ------ | --------------------------------- | ---------------------------------------- |
| GET    | `/api/healthz`                    | Health check                            |
| GET    | `/api/agent/download`             | Download `lab-agent.ps1`                |
| POST   | `/api/agent/register`             | Register/re-key an agent + computer     |
| POST   | `/api/agent/heartbeat`            | Agent heartbeat; polls for actions      |
| POST   | `/api/agent/actions/:id/complete` | Mark an action complete/failed          |
| POST   | `/api/agent/events`               | Agent-reported events (login, USB, ...) |
| GET    | `/api/agent/files/download/:id`   | Download a file queued for a computer   |
| GET    | `/api/lab/summary`                | Dashboard summary counters              |
| GET    | `/api/lab/computers`              | List computers                          |
| POST   | `/api/lab/computers/:id/actions`  | Queue an action for a computer          |
| GET    | `/api/lab/alerts`                 | List alerts                             |
| PATCH  | `/api/lab/alerts/:id`             | Update alert status                     |
| GET    | `/api/lab/usb-policies`           | List USB policies                       |
| PATCH  | `/api/lab/usb-policies`           | Update the lab USB policy               |
| GET    | `/api/lab/usb-devices`            | List USB devices (pending/decided)      |
| POST   | `/api/lab/usb-devices/:id/decide` | Approve/deny a pending USB device       |
| GET    | `/api/lab/student-sessions`       | List student sessions                   |
| POST   | `/api/lab/student-sessions`       | Start a session (sign a student in)     |
| GET    | `/api/lab/events`                 | List recent audit events                |
| GET    | `/api/reports/attendance`         | Attendance report (JSON)                |
| GET    | `/api/reports/attendance.csv`     | Attendance report (CSV)                 |
| GET    | `/api/reports/violations`         | Violations report (JSON)                |
| GET    | `/api/reports/violations.csv`     | Violations report (CSV)                 |

Computer actions: `lock`, `unlock`, `restart`, `wake`, `send_message`, `remote_view`, `remote_control`, `block_usb`, `allow_usb`, `push_file`, `delete_file`, `av_scan`.

All request/response bodies are validated with the Zod schemas in `lib/api-zod`.

## Installing the client agent

1. After deploying, download the agent script:

   ```sh
   curl -o lab-agent.ps1 https://<your-app>.onrender.com/api/agent/download
   ```

2. On each lab PC (Windows PowerShell 5.1+), run once to test:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File lab-agent.ps1 -ServerUrl https://<your-app>.onrender.com
   ```

3. To install it so it starts at every user logon:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File lab-agent.ps1 -Install -ServerUrl https://<your-app>.onrender.com
   ```

The agent registers the PC (its name becomes the computer name in the dashboard), heartbeats every 30 seconds, reports USB device connections (scanning them with Windows Defender first), tracks student login/logout, and executes queued actions. `-ServerUrl` can be an `http://<ip>:<port>` address for a LAN deployment.

## Deploying to Render

The `render.yaml` blueprint defines the **web service** (free tier). It deliberately does **not** provision a database — the app connects to a database you already run, so it plays nicely with your other projects on a shared Postgres.

Why it's safe to share a database:

- Every table uses the `lab_` prefix (`lab_computers`, `lab_actions`, `lab_alerts`, `lab_usb_policies`, `lab_usb_devices`, `lab_student_sessions`, `lab_events`), so nothing collides with other apps' tables.
- Schema bootstrap is idempotent (`CREATE TABLE IF NOT EXISTS`).
- The seed script exits early if `lab_computers` already has data, so it never re-seeds or overwrites anything.

To deploy:

1. Render dashboard → **New → Blueprint** and connect the `lab-command-center` repository.
2. Pick the repo; Render creates the `lab-command-center` web service (no database resource).
3. Open the service → **Environment** → set `DATABASE_URL` to the connection string of the database you want to share:
   - If it's another **Render Postgres**, use its **Internal Database URL** and connect that database to this service from the database's dashboard (Render manages the network access automatically).
   - If it's an **external** database (e.g. Neon, Supabase, a VM), use its connection string and add the web service's IP range to the database's allowlist.
4. First deploy runs `pnpm install && pnpm run db:setup && pnpm run build`, then starts the server. Health check `/api/healthz` marks it live.
5. Future pushes to `main` auto-deploy.

Note: the shared database must be reachable from Render — Render-managed databases and standard managed Postgres (Neon/Supabase) work out of the box.

## Verification

```sh
pnpm run typecheck   # typechecks libs (tsc --build) + all packages
pnpm run build       # bundles the API and builds the dashboard
```

## License

MIT
