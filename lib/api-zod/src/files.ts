import * as zod from "zod";

export const PushFileParams = zod.object({ computerId: zod.coerce.number() });

export const PushFileResponse = zod.object({
  actionId: zod.number(),
  fileName: zod.string(),
  size: zod.number(),
});
