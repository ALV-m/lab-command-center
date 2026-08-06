import * as zod from "zod";
import { TenantAccount, TenantStatus } from "./tenant";

export const AdminAccount = zod.object({
  id: zod.number(),
  username: zod.string(),
  createdAt: zod.string(),
});
export type AdminAccount = zod.infer<typeof AdminAccount>;

export const AdminLoginBody = zod.object({
  username: zod.string().trim().min(1).max(100),
  password: zod.string().min(1).max(200),
});

export const AdminLoginResponse = zod.object({
  user: AdminAccount,
});

export const AdminMeResponse = zod.object({
  user: AdminAccount,
});

export const AdminLogoutResponse = zod.object({
  ok: zod.boolean(),
});

export const TenantListItem = TenantAccount.extend({
  computers: zod.number(),
  admins: zod.number(),
});
export type TenantListItem = zod.infer<typeof TenantListItem>;

export const TenantsListResponse = zod.object({
  tenants: zod.array(TenantListItem),
});

export const TenantStatusUpdateBody = zod.object({
  status: TenantStatus,
});

export const TenantAdminPasswordBody = zod.object({
  password: zod.string().min(6).max(200),
});

export const PlatformStatsResponse = zod.object({
  totalTenants: zod.number(),
  activeTenants: zod.number(),
  suspendedTenants: zod.number(),
  totalComputers: zod.number(),
  totalAdmins: zod.number(),
});

export const TenantIdParams = zod.object({
  tenantId: zod.coerce.number().int().positive(),
});
