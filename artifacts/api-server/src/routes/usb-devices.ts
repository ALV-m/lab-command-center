import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, alertsTable, eventsTable, usbDevicesTable } from "@workspace/db";
import {
  DecideUsbDeviceBody,
  DecideUsbDeviceParams,
  DecideUsbDeviceResponse,
  GetUsbDevicesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const iso = (value: Date | string | null | undefined) =>
  value instanceof Date ? value.toISOString() : value ?? null;

router.get("/lab/usb-devices", async (_req, res): Promise<void> => {
  const devices = await db
    .select()
    .from(usbDevicesTable)
    .orderBy(desc(usbDevicesTable.createdAt));
  res.json(
    GetUsbDevicesResponse.parse(
      devices.map((device) => ({
        ...device,
        createdAt: iso(device.createdAt) as string,
        decidedAt: iso(device.decidedAt),
      })),
    ),
  );
});

router.post("/lab/usb-devices/:deviceId/decide", async (req, res): Promise<void> => {
  const params = DecideUsbDeviceParams.safeParse(req.params);
  const body = DecideUsbDeviceBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid decision" });
    return;
  }

  const [device] = await db
    .select()
    .from(usbDevicesTable)
    .where(eq(usbDevicesTable.id, params.data.deviceId))
    .limit(1);
  if (!device) {
    res.status(404).json({ error: "USB device not found" });
    return;
  }

  const [updated] = await db
    .update(usbDevicesTable)
    .set({ status: body.data.status, decidedAt: new Date() })
    .where(eq(usbDevicesTable.id, device.id))
    .returning();

  await db
    .update(alertsTable)
    .set({ status: "resolved" })
    .where(
      and(
        eq(alertsTable.computerName, device.computerName),
        eq(alertsTable.title, "USB device awaiting approval"),
        eq(alertsTable.status, "open"),
      ),
    );

  const label = device.driveLetter
    ? ` (drive ${device.driveLetter}:)`
    : "";
  await db.insert(eventsTable).values({
    type: body.data.status === "approved" ? "usb_connected" : "usb_blocked",
    message: `USB device on ${device.computerName}${label} ${
      body.data.status === "approved" ? "approved for use" : "blocked"
    } by administrator`,
    actor: "Lab administrator",
    computerName: device.computerName,
  });

  res.json(
    DecideUsbDeviceResponse.parse({
      ...updated,
      createdAt: iso(updated.createdAt) as string,
      decidedAt: iso(updated.decidedAt),
    }),
  );
});

export default router;
