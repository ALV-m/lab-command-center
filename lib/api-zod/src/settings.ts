import * as zod from "zod";

export const GetLabSettingsResponse = zod.object({
  idleLogoutMinutes: zod.number().int().nonnegative().nullish(),
});

export const UpdateLabSettingsBody = zod.object({
  idleLogoutMinutes: zod.number().int().nonnegative().max(600).nullish(),
});

export const UpdateLabSettingsResponse = GetLabSettingsResponse;
