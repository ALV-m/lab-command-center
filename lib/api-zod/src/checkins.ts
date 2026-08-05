import * as zod from "zod";

export const CheckinEntry = zod.object({
  id: zod.number(),
  computerId: zod.number(),
  computerName: zod.string(),
  userName: zod.string().nullish(),
  role: zod.enum(["student", "admin"]).nullish(),
  studentName: zod.string(),
  phone: zod.string().nullish(),
  admissionNo: zod.string().nullish(),
  email: zod.string().nullish(),
  photoFileId: zod.string().nullish(),
  submittedAt: zod.string(),
});

export const GetCheckinsResponse = zod.object({
  checkins: zod.array(CheckinEntry),
});

export const SetComputerUsbModeParams = zod.object({
  computerId: zod.coerce.number(),
});

export const SetComputerUsbModeBody = zod.object({
  mode: zod.enum(["allowed", "blocked", "review"]),
});

export const SetComputerUsbModeResponse = zod.object({
  computerId: zod.number(),
  usbState: zod.enum(["allowed", "blocked", "review"]),
});

export const ScreenshotInfo = zod.object({
  fileId: zod.string(),
  takenAt: zod.string(),
});

export const GetLatestScreenshotParams = zod.object({
  computerId: zod.coerce.number(),
});

export const GetLatestScreenshotResponse = zod.object({
  screenshot: ScreenshotInfo.nullable(),
});
