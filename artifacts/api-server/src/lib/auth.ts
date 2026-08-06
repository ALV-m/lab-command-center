import { and, eq, gt } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { randomBytes } from "node:crypto";
import { appUsersTable, authSessionsTable, db } from "@workspace/db";
import {
  SUBMENUS,
  type SubmenuKey,
  type UserRole,
} from "@workspace/api-zod";
import { logger } from "./logger";
import { hashPassword } from "./passwords";

// ---------------------------------------------------------------------------
// Request augmentation
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
  submenuAccess: SubmenuKey[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = "lcc_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_MS,
};

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(
  userId: number,
  token: string,
): Promise<void> {
  await db.insert(authSessionsTable).values({
    id: token,
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(authSessionsTable).where(eq(authSessionsTable.id, token));
}

export async function resolveSession(req: Request): Promise<AuthUser | null> {
  const token = typeof req.cookies?.[SESSION_COOKIE] === "string"
    ? req.cookies[SESSION_COOKIE]
    : "";
  if (!token) return null;

  const [row] = await db
    .select()
    .from(authSessionsTable)
    .innerJoin(appUsersTable, eq(authSessionsTable.userId, appUsersTable.id))
    .where(
      and(
        eq(authSessionsTable.id, token),
        gt(authSessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    id: row.app_users.id,
    username: row.app_users.username,
    role: row.app_users.role as UserRole,
    submenuAccess: row.app_users.submenuAccess as SubmenuKey[],
  };
}

// ---------------------------------------------------------------------------
// Submenu routing for per-submenu access control
// ---------------------------------------------------------------------------
// Admin users only reach APIs belonging to submenus listed in their
// `submenu_access`. Super admins bypass this entirely. Routes are matched in
// order; a path may map to several submenus (any match grants access). The
// special "*" submenu marks routes every authenticated admin may use (the
// read-only computer/alert lists are needed by many dashboard pages). A path
// that matches nothing is denied for admin users (fail closed).

type SubmenuGrant = SubmenuKey | "*";

const SUBMENU_ROUTES: Array<{ test: (path: string, method: string) => boolean; submenu: SubmenuGrant }> = [
  { test: (p, m) => m === "GET" && p === "/api/lab/computers", submenu: "*" },
  { test: (p, m) => m === "GET" && p === "/api/lab/alerts", submenu: "*" },
  { test: (p) => p === "/api/lab/summary", submenu: "overview" },
  { test: (p) => p.startsWith("/api/lab/computers/") && p.includes("/files/browse"), submenu: "files" },
  { test: (p) => p.startsWith("/api/lab/computers/"), submenu: "computers" },
  { test: (p) => p === "/api/lab/computers", submenu: "computers" },
  { test: (p) => p.startsWith("/api/lab/alerts"), submenu: "alerts" },
  { test: (p) => p.startsWith("/api/lab/usb-policies"), submenu: "usb_policies" },
  { test: (p) => p.startsWith("/api/lab/usb-devices"), submenu: "usb_policies" },
  { test: (p) => p.startsWith("/api/lab/student-sessions"), submenu: "sessions" },
  { test: (p) => p.startsWith("/api/lab/events"), submenu: "events" },
  { test: (p) => p.startsWith("/api/lab/settings"), submenu: "settings" },
  { test: (p) => p.startsWith("/api/lab/checkins"), submenu: "checkins" },
  { test: (p) => p.startsWith("/api/lab/peripherals"), submenu: "peripherals" },
  { test: (p) => p.startsWith("/api/lab/files/screenshots/"), submenu: "checkins" },
  { test: (p) => p.startsWith("/api/lab/files/screenshots/"), submenu: "computers" },
  { test: (p) => p.startsWith("/api/lab/files/"), submenu: "files" },
  { test: (p) => p === "/api/lab/files", submenu: "files" },
  { test: (p) => p.startsWith("/api/reports/"), submenu: "reports" },
  { test: (p) => p === "/api/reports", submenu: "reports" },
  { test: (p) => p.startsWith("/api/security/"), submenu: "antivirus" },
  { test: (p) => p.startsWith("/api/security/"), submenu: "firewall" },
  { test: (p) => p.startsWith("/api/users"), submenu: "users" },
];

export function submenusForPath(path: string, method: string): SubmenuGrant[] {
  const normalized = path.split("?")[0];
  return SUBMENU_ROUTES
    .filter((entry) => entry.test(normalized, method))
    .map((entry) => entry.submenu);
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await resolveSession(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.user = user;
  next();
}

export function requireSubmenuAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.role === "super_admin") {
    next();
    return;
  }

  const submenus = submenusForPath(req.originalUrl ?? req.url, req.method);
  if (submenus.length === 0) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (
    submenus.includes("*") ||
    submenus.some((submenu) => submenu !== "*" && user.submenuAccess.includes(submenu))
  ) {
    next();
    return;
  }
  res.status(403).json({ error: "You do not have access to this section" });
}

export function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.role !== "super_admin") {
    res.status(403).json({ error: "Super admin access required" });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
// Auto-create the first super admin from environment variables on every
// startup. Re-running with changed credentials re-syncs the password so the
// account can always be recovered from the environment.

export async function seedSuperAdmin(): Promise<void> {
  const username = process.env.SUPER_ADMIN_USERNAME?.trim();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!username || !password) {
    return;
  }
  if (password.length < 6) {
    logger.warn("SUPER_ADMIN_PASSWORD is too short; super admin not synced");
    return;
  }

  try {
    await db
      .insert(appUsersTable)
      .values({
        username,
        passwordHash: hashPassword(password),
        role: "super_admin",
        submenuAccess: [...SUBMENUS],
      })
      .onConflictDoUpdate({
        target: appUsersTable.username,
        set: {
          passwordHash: hashPassword(password),
          role: "super_admin",
          submenuAccess: [...SUBMENUS],
        },
      });
    logger.info({ username }, "Super admin synced from environment");
  } catch (err) {
    logger.warn({ err }, "Could not sync super admin from environment");
  }
}
