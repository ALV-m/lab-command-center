import * as zod from "zod";

export const PushFileParams = zod.object({ computerId: zod.coerce.number() });

export const PushFileResponse = zod.object({
  actionId: zod.number(),
  fileName: zod.string(),
  size: zod.number(),
});

export const BroadcastPushFileResponse = zod.object({
  fileName: zod.string(),
  size: zod.number(),
  queued: zod.number(),
});

export const BroadcastDeleteFilesBody = zod.object({
  path: zod.string().min(1).max(500),
  computerIds: zod.array(zod.number()).optional(),
  initiatedBy: zod.string().max(100).optional(),
});

export const BroadcastDeleteFilesResponse = zod.object({
  queued: zod.number(),
});
