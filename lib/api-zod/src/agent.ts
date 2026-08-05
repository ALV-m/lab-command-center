import * as zod from "zod";

export const AgentComputerAction = zod.enum([
  "lock",
  "unlock",
  "restart",
  "wake",
  "send_message",
  "remote_view",
  "remote_control",
  "block_usb",
  "allow_usb",
  "push_file",
  "delete_file",
  "av_scan",
  "av_update",
  "av_toggle",
  "fw_enable",
  "fw_disable",
  "wol_relay",
]);

export const AgentRegisterBody = zod.object({
  name: zod.string().min(1).max(100),
  os: zod.string().max(200).optional(),
  agentVersion: zod.string().max(50).optional(),
  macAddress: zod.string().max(64).nullish(),
  ipAddress: zod.string().max(64).nullish(),
});

export const AgentRegisterResponse = zod.object({
  computerId: zod.number(),
  token: zod.string(),
  name: zod.string(),
  usbState: zod.enum(["blocked", "allowed", "review"]),
  serverTime: zod.string(),
});

export const AgentHeartbeatBody = zod.object({
  token: zod.string().min(1),
  userName: zod.string().nullish(),
  os: zod.string().nullish(),
  agentVersion: zod.string().nullish(),
  avEnabled: zod.boolean().nullish(),
  avSignature: zod.string().nullish(),
  avLastScanAt: zod.string().nullish(),
  avScanState: zod.string().nullish(),
  firewallEnabled: zod.boolean().nullish(),
  firewallProfiles: zod.string().nullish(),
  macAddress: zod.string().max(64).nullish(),
  ipAddress: zod.string().max(64).nullish(),
});

export const AgentPendingAction = zod.object({
  id: zod.number(),
  action: AgentComputerAction,
  message: zod.string().nullish(),
  payload: zod.string().nullish(),
});

export const AgentHeartbeatResponse = zod.object({
  serverTime: zod.string(),
  computer: zod.object({
    id: zod.number(),
    name: zod.string(),
    status: zod.enum(["online", "offline", "warning", "locked"]),
    usbState: zod.enum(["blocked", "allowed", "review"]),
    firewallEnabled: zod.boolean().nullish(),
    firewallProfiles: zod.string().nullish(),
    checkinRequired: zod.boolean().nullish(),
    signinMethod: zod.enum(["password", "shared_account"]).nullish(),
    sharedAccountUser: zod.string().max(64).nullish(),
    sharedAccountPassword: zod.string().max(128).nullish(),
  }),
  allowedUsb: zod.array(zod.string()),
  allowedDeviceIds: zod.array(zod.string()).default([]),
  pendingActions: zod.array(AgentPendingAction),
  idleLogoutMinutes: zod.number().int().nonnegative().nullish(),
});

export const AgentActionCompleteParams = zod.object({
  actionId: zod.coerce.number(),
});

export const AgentActionCompleteBody = zod.object({
  token: zod.string().min(1),
  success: zod.boolean(),
  detail: zod.string().nullish(),
});

export const AgentActionCompleteResponse = zod.object({
  ok: zod.boolean(),
});

export const AgentEventBody = zod.object({
  token: zod.string().min(1),
  type: zod.enum([
    "student_login",
    "student_logout",
    "usb_connected",
    "usb_removed",
    "login_failure",
    "password_change",
    "password_reset",
    "autologon",
  ]),
  message: zod.string().max(500).optional(),
  detail: zod.string().max(500).optional(),
});

export const AgentEventResponse = zod.object({
  ok: zod.boolean(),
});

export const AgentCheckinRole = zod.enum(["student", "admin"]);

export const AgentCheckinBody = zod.object({
  token: zod.string().min(1),
  userName: zod.string().max(200).nullish(),
  role: AgentCheckinRole.nullish(),
  studentName: zod.string().min(1).max(200),
  phone: zod.string().max(50).nullish(),
  admissionNo: zod.string().max(100).nullish(),
  email: zod.string().max(200).nullish(),
  photoFileId: zod.string().max(200).nullish(),
  adminUser: zod.string().max(100).nullish(),
  adminPass: zod.string().max(128).nullish(),
});

export const AgentCheckinResponse = zod.object({
  ok: zod.boolean(),
  checkinId: zod.number().nullish(),
  error: zod.string().max(300).nullish(),
});

export const AgentUploadResponse = zod.object({
  fileId: zod.string(),
});

export const AgentScreenshotResponse = zod.object({
  fileId: zod.string(),
  takenAt: zod.string(),
});
