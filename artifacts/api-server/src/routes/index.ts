import { Router, type IRouter } from "express";
import healthRouter from "./health";
import labRouter from "./lab";

const router: IRouter = Router();

router.use(healthRouter);
router.use(labRouter);

export default router;
