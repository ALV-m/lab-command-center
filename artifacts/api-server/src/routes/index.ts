import { Router, type IRouter } from "express";
import agentRouter from "./agent";
import healthRouter from "./health";
import labRouter from "./lab";
import peripheralsRouter from "./peripherals";
import reportsRouter from "./reports";
import securityRouter from "./security";
import settingsRouter from "./settings";
import usbDevicesRouter from "./usb-devices";

const router: IRouter = Router();

router.use(agentRouter);
router.use(healthRouter);
router.use(labRouter);
router.use(peripheralsRouter);
router.use(reportsRouter);
router.use(securityRouter);
router.use(settingsRouter);
router.use(usbDevicesRouter);

export default router;
