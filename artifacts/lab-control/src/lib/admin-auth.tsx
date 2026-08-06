import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Redirect } from "wouter";
import {
  adminLogout,
  getAdminMe,
} from "@workspace/api-client-react";
import type { PlatformAdminAccount } from "@workspace/api-client-react";

import { Spinner } from "@/components/ui/spinner";

type AdminAuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AdminAuthContextValue {
  status: AdminAuthStatus;
  admin: PlatformAdminAccount | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminAuthStatus>("loading");
  const [admin, setAdmin] = useState<PlatformAdminAccount | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await getAdminMe();
      setAdmin(result.user);
      setStatus("authenticated");
    } catch {
      setAdmin(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await adminLogout();
    } catch {
      // The session may already be invalid; clear local state regardless.
    }
    setAdmin(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo(
    () => ({ status, admin, refresh, signOut }),
    [status, admin, refresh, signOut],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status } = useAdminAuth();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (status !== "authenticated") {
    return <Redirect to="/login" replace />;
  }
  return <>{children}</>;
}
