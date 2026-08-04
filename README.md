# Lab Command Center

A complete management dashboard for a computer lab: track computers, run operator actions (lock, unlock, restart, send messages), monitor alerts, control USB policies, and record student sessions — all behind one Express API that also serves the React frontend.

## Features

- **Dashboard** — live lab summary, status distribution chart, recent alerts.
- **Computers** — searchable/filterable list with per-machine actions (lock, unlock, restart, wake, send message, remote view, block/allow USB).
- **Alerts** — acknowledge and resolve alerts raised across the lab.
- **USB policy** — set removable-media policy to allowed/blocked for all or selected computers.
- **Sessions** — start and track student login sessions.
- **Events** — an audit log of operator actions, logins, and USB events.
- **Deployment** — a `render.yaml` blueprint provisions a PostgreSQL database and the web service with schema bootstrap and seed data.

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
| GET    | `/api/lab/summary`                | Dashboard summary counters              |
| GET    | `/api/lab/computers`              | List computers                          |
| POST   | `/api/lab/computers/:id/actions`  | Queue an action for a computer          |
| GET    | `/api/lab/alerts`                 | List alerts                             |
| PATCH  | `/api/lab/alerts/:id`             | Update alert status                     |
| GET    | `/api/lab/usb-policies`           | List USB policies                       |
| PATCH  | `/api/lab/usb-policies`           | Update the lab USB policy               |
| GET    | `/api/lab/student-sessions`       | List student sessions                   |
| POST   | `/api/lab/student-sessions`       | Start a session (sign a student in)     |
| GET    | `/api/lab/events`                 | List recent audit events                |

Computer actions: `lock`, `unlock`, `restart`, `wake`, `send_message`, `remote_view`, `remote_control`, `block_usb`, `allow_usb`.

All request/response bodies are validated with the Zod schemas in `lib/api-zod`.

## Deploying to Render

The `render.yaml` blueprint defines two resources:

1. **PostgreSQL** — `lab-command-center-db` (free tier, database `lab_command_center`).
2. **Web service** — `lab-command-center` (free tier):
   - Build: `corepack enable && corepack prepare pnpm@11.11.0 --activate && pnpm install && pnpm run db:setup && pnpm run build`
   - Start: `node artifacts/api-server/dist/index.mjs`
   - Health check: `/api/healthz`
   - Env: `NODE_VERSION=22.15.0`, `PNPM_VERSION=11.11.0`, `PORT=10000`, `BASE_PATH=/`, and `DATABASE_URL` wired to the provisioned database.

Connect the blueprint from the Render dashboard ("New → Blueprint") and point it at this repository. Deploys are automatic on push.

## Verification

```sh
pnpm run typecheck   # typechecks libs (tsc --build) + all packages
pnpm run build       # bundles the API and builds the dashboard
```

## License

MIT
