import * as zod from "zod";

export const TenantStatus = zod.enum(["active", "suspended"]);
export type TenantStatus = zod.infer<typeof TenantStatus>;

export const TenantAccount = zod.object({
  id: zod.number(),
  name: zod.string(),
  slug: zod.string(),
  contactName: zod.string(),
  contactEmail: zod.string().nullable(),
  status: TenantStatus,
  createdAt: zod.string(),
});
export type TenantAccount = zod.infer<typeof TenantAccount>;

export const RegisterTenantBody = zod.object({
  orgName: zod.string().trim().min(2).max(100),
  contactName: zod.string().trim().min(2).max(100),
  contactEmail: zod.string().email().trim().max(200).optional().or(zod.literal("")),
  username: zod.string().trim().min(2).max(100),
  password: zod.string().min(6).max(200),
});

export const RegisterTenantResponse = zod.object({
  tenant: TenantAccount,
});
