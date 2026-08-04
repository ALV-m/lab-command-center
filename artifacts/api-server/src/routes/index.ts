import { Router, type IRouter } from "express";
import agentRouter from "./agent";
import healthRouter from "./health";
import labRouter from "./lab";
import reportsRouter from "./reports";
import usbDevicesRouter from "./usb-devices";

const router: IRouter = Router();

router.use(agentRouter);
router.use(healthRouter);
router.use(labRouter);
router.use(reportsRouter);
router.use(usbDevicesRouter);

export default router;
