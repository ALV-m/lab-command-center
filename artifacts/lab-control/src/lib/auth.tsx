import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { Redirect, Route } from "wouter";
import { getMe, logout } from "@workspace/api-client-react";
import type { SubmenuKey, UserAccount } from "@workspace/api-client-react";

import { Spinner } from "@/components/ui/spinner";
import { hasSubmenuAccess } from "./submenus";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: UserAccount | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<UserAccount | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await getMe();
      setUser(result.user);
      setStatus("authenticated");
    } catch {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } catch {
      // The session may already be invalid; clear local state regardless.
    }
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo(
    () => ({ status, user, refresh, signOut }),
    [status, user, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useSubmenuAccess(submenu: SubmenuKey): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return hasSubmenuAccess(submenu, user.role, user.submenuAccess);
}

export function FullScreenSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <Spinner className="size-8" />
      {label ? (
        <p className="text-sm text-muted-foreground">{label}</p>
      ) : null}
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return <FullScreenSpinner label="Checking session…" />;
  }
  if (status !== "authenticated") {
    return <Redirect to="/login" replace />;
  }
  return <>{children}</>;
}

export function GuardedRoute({
  path,
  submenu,
  component: Component,
  superAdminOnly = false,
}: {
  path: string;
  submenu: SubmenuKey;
  component: ComponentType;
  superAdminOnly?: boolean;
}) {
  const { user } = useAuth();
  const allowed =
    user != null &&
    hasSubmenuAccess(submenu, user.role, user.submenuAccess) &&
    (!superAdminOnly || user.role === "super_admin");

  return (
    <Route path={path}>
      {allowed ? <Component /> : <NotAuthorized />}
    </Route>
  );
}

function NotAuthorized() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
      <h1 className="text-2xl font-bold">Access denied</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Your account does not have access to this section. Contact a super
        admin to request access.
      </p>
    </div>
  );
}
