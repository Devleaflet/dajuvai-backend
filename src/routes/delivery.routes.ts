import { Router } from "express";
import deliveryAdminRouter from "./delivery.admin.routes";
import deliveryRiderRouter from "./delivery.rider.routes";

const deliveryRouter = Router();

deliveryRouter.use("/admin",deliveryAdminRouter);
deliveryRouter.use("/rider",deliveryRiderRouter);

export default deliveryRouter;
