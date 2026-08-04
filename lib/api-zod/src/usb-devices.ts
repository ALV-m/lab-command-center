import * as zod from "zod";

export const UsbDeviceStatus = zod.enum(["pending", "approved", "denied"]);

export const UsbDeviceItem = zod.object({
  id: zod.number(),
  computerId: zod.number(),
  computerName: zod.string(),
  deviceId: zod.string().nullish(),
  driveLetter: zod.string().nullish(),
  label: zod.string().nullish(),
  status: UsbDeviceStatus,
  scanResult: zod.string().nullish(),
  createdAt: zod.string(),
  decidedAt: zod.string().nullish(),
});

export const GetUsbDevicesResponse = zod.array(UsbDeviceItem);

export const DecideUsbDeviceParams = zod.object({ deviceId: zod.coerce.number() });

export const DecideUsbDeviceBody = zod.object({
  status: zod.enum(["approved", "denied"]),
});

export const DecideUsbDeviceResponse = UsbDeviceItem;
