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

export const FileEntry = zod.object({
  name: zod.string(),
  isDir: zod.boolean(),
  size: zod.number(),
  modifiedAt: zod.string().nullish(),
});

export const ReportFileListingBody = zod.object({
  token: zod.string().min(1),
  path: zod.string().min(1).max(1000),
  entries: zod.array(FileEntry),
});

export const BrowseFilesParams = zod.object({ computerId: zod.coerce.number() });

export const BrowseFilesQuery = zod.object({
  path: zod.string().min(1).max(1000).optional(),
});

export const BrowseFilesResponse = zod.object({
  path: zod.string(),
  pending: zod.boolean(),
  error: zod.string().nullish(),
  entries: zod.array(FileEntry),
});
