import * as zod from "zod";

export const PeripheralKind = zod.enum(["keyboard", "mouse", "monitor", "display", "other"]);

export const AgentPeripheral = zod.object({
  kind: PeripheralKind,
  name: zod.string().max(300),
  instanceId: zod.string().max(500),
  present: zod.boolean(),
});

export const AgentPeripheralsBody = zod.object({
  token: zod.string().min(1),
  user: zod.string().nullish(),
  devices: zod.array(AgentPeripheral).max(200),
});

export const AgentPeripheralsResponse = zod.object({
  ok: zod.boolean(),
});

export const PeripheralItem = zod.object({
  id: zod.number(),
  computerId: zod.number(),
  computerName: zod.string(),
  kind: PeripheralKind,
  name: zod.string(),
  instanceId: zod.string(),
  present: zod.boolean(),
  firstSeenAt: zod.string(),
  lastChangedAt: zod.string(),
});

export const GetPeripheralsResponse = zod.array(PeripheralItem);
