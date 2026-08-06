import { Router, type IRouter } from "express";
import { requireAuth, requireSubmenuAccess } from "../lib/auth";
import agentRouter from "./agent";
import authRouter from "./auth";
import checkinsRouter from "./checkins";
import filesRouter from "./files";
import healthRouter from "./health";
import labRouter from "./lab";
import peripheralsRouter from "./peripherals";
import reportsRouter from "./reports";
import securityRouter from "./security";
import settingsRouter from "./settings";
import usbDevicesRouter from "./usb-devices";

const router: IRouter = Router();

// Publicly reachable (agent authentication is token-based, auth endpoints
// manage their own sessions, and the health check stays unauthenticated).
router.use(authRouter);
router.use(agentRouter);
router.use(healthRouter);

// Everything after this point requires a valid dashboard session. Admins are
// further limited to the APIs of the submenus granted in `submenu_access`.
router.use(requireAuth);
router.use(requireSubmenuAccess);

router.use(checkinsRouter);
router.use(filesRouter);
router.use(labRouter);
router.use(peripheralsRouter);
router.use(reportsRouter);
router.use(securityRouter);
router.use(settingsRouter);
router.use(usbDevicesRouter);

export default router;
