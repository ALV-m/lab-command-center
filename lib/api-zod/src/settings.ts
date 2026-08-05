import * as zod from "zod";

export const SigninMethod = zod.enum(["password", "shared_account"]);

export const GetLabSettingsResponse = zod.object({
  idleLogoutMinutes: zod.number().int().nonnegative().nullish(),
  signinMethod: SigninMethod.nullish(),
  sharedAccountUser: zod.string().max(64).nullish(),
  sharedAccountPassword: zod.string().max(128).nullish(),
  adminGateSecret: zod.string().max(128).nullish(),
});

export const UpdateLabSettingsBody = zod.object({
  idleLogoutMinutes: zod.number().int().nonnegative().max(600).nullish(),
  signinMethod: SigninMethod.nullish(),
  sharedAccountUser: zod.string().max(64).nullish(),
  sharedAccountPassword: zod.string().max(128).nullish(),
  adminGateSecret: zod.string().max(128).nullish(),
});

export const UpdateLabSettingsResponse = GetLabSettingsResponse;
