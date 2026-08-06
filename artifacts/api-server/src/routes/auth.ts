import { Router, type IRouter } from "express";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, appUsersTable } from "@workspace/db";
import {
  AuthMeResponse,
  LoginBody,
  LoginResponse,
  LogoutResponse,
  UserAccount,
  UserCreateBody,
  UserIdParams,
  UserUpdateBody,
  UsersListResponse,
} from "@workspace/api-zod";
import {
  createSession,
  deleteSession,
  generateSessionToken,
  requireAuth,
  requireSuperAdmin,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "../lib/auth";
import { hashPassword, verifyPassword } from "../lib/passwords";

const router: IRouter = Router();

const mapUser = (row: typeof appUsersTable.$inferSelect) => ({
  id: row.id,
  username: row.username,
  role: row.role,
  submenuAccess: row.submenuAccess,
  createdAt: row.createdAt instanceof Date
    ? row.createdAt.toISOString()
    : String(row.createdAt),
});

async function findUserByUsername(username: string) {
  const [row] = await db
    .select()
    .from(appUsersTable)
    .where(sql`lower(${appUsersTable.username}) = ${username.toLowerCase()}`)
    .limit(1);
  return row ?? null;
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const body = LoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid username or password" });
    return;
  }

  const user = await findUserByUsername(body.data.username);
  if (!user || !verifyPassword(body.data.password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const token = generateSessionToken();
  await createSession(user.id, token);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions);

  res.json(
    LoginResponse.parse({
      token,
      user: mapUser(user),
    }),
  );
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const token = typeof req.cookies?.[SESSION_COOKIE] === "string"
    ? req.cookies[SESSION_COOKIE]
    : "";
  if (token) {
    await deleteSession(token);
  }
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json(LogoutResponse.parse({ ok: true }));
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const [row] = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.id, user.id))
    .limit(1);
  if (!row) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(AuthMeResponse.parse({ user: mapUser(row) }));
});

router.get("/users", requireSuperAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(appUsersTable).orderBy(appUsersTable.id);
  res.json(UsersListResponse.parse({ users: rows.map(mapUser) }));
});

router.post("/users", requireSuperAdmin, async (req, res): Promise<void> => {
  const body = UserCreateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const existing = await findUserByUsername(body.data.username);
  if (existing) {
    res.status(409).json({ error: "A user with this username already exists" });
    return;
  }

  const [created] = await db
    .insert(appUsersTable)
    .values({
      username: body.data.username,
      passwordHash: hashPassword(body.data.password),
      role: body.data.role,
      submenuAccess: body.data.submenuAccess,
    })
    .returning();

  res.status(201).json(UserAccount.parse(mapUser(created)));
});

router.patch("/users/:userId", requireSuperAdmin, async (req, res): Promise<void> => {
  const params = UserIdParams.safeParse(req.params);
  const body = UserUpdateBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid user update" });
    return;
  }

  const [existing] = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.id, params.data.userId))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const isSelf = req.user!.id === existing.id;
  const demotingSelf =
    isSelf &&
    existing.role === "super_admin" &&
    body.data.role &&
    body.data.role !== "super_admin";
  const removingSelfAccess =
    isSelf &&
    existing.role === "super_admin" &&
    body.data.submenuAccess !== undefined &&
    !body.data.submenuAccess.includes("users");

  if (demotingSelf || removingSelfAccess) {
    res.status(400).json({ error: "You cannot remove your own super admin access" });
    return;
  }

  const [updated] = await db
    .update(appUsersTable)
    .set({
      ...(body.data.password ? { passwordHash: hashPassword(body.data.password) } : {}),
      ...(body.data.role ? { role: body.data.role } : {}),
      ...(body.data.submenuAccess !== undefined
        ? { submenuAccess: body.data.submenuAccess }
        : {}),
    })
    .where(eq(appUsersTable.id, existing.id))
    .returning();

  res.json(UserAccount.parse(mapUser(updated)));
});

router.delete("/users/:userId", requireSuperAdmin, async (req, res): Promise<void> => {
  const params = UserIdParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [existing] = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.id, params.data.userId))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (req.user!.id === existing.id) {
    res.status(400).json({ error: "You cannot delete your own account" });
    return;
  }
  if (existing.role === "super_admin") {
    const [otherSuper] = await db
      .select({ id: appUsersTable.id })
      .from(appUsersTable)
      .where(
        and(
          eq(appUsersTable.role, "super_admin"),
          ne(appUsersTable.id, existing.id),
        ),
      )
      .limit(1);
    if (!otherSuper) {
      res.status(400).json({ error: "Cannot delete the last super admin account" });
      return;
    }
  }

  await db.delete(appUsersTable).where(eq(appUsersTable.id, existing.id));
  res.json({ ok: true });
});

export default router;
