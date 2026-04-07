import { Request, Response, NextFunction } from "express";
import { CreateDealInput, UpdateDealInput } from "../utils/zod_validations/deal.zod";
import { AuthRequest } from "../middlewares/auth.middleware";
import { DealStatus } from "../entities/deal.entity";
import { DealService } from "../service/deal.service";

export class DealController {
    private dealService: DealService;

    constructor() {
        this.dealService = new DealService();
    }

    async createDeal(req: AuthRequest<{}, {}, CreateDealInput>, res: Response, _next: NextFunction): Promise<void> {
        const deal = await this.dealService.createDeal(req.body, req.user!.id);
        res.status(201).json({ success: true, data: deal });
    }

    async updateDeal(req: AuthRequest<{ id: string }, {}, UpdateDealInput>, res: Response, _next: NextFunction): Promise<void> {
        const deal = await this.dealService.updateDeal(Number(req.params.id), req.body);
        res.status(200).json({ success: true, data: deal });
    }

    async getDealById(req: Request<{ id: string }>, res: Response, _next: NextFunction): Promise<void> {
        const deal = await this.dealService.getDealById(Number(req.params.id));
        res.status(200).json({ success: true, data: deal });
    }

    async getAllDeals(req: Request<{}, {}, {}, { status?: string }>, res: Response, _next: NextFunction): Promise<void> {
        const status = req.query.status as DealStatus | undefined;
        const { deals, total, productCounts } = await this.dealService.getAllDeals(status);
        res.status(200).json({ success: true, data: { deals, total, productCounts } });
    }

    async deleteDeal(req: AuthRequest<{ id: string }>, res: Response, _next: NextFunction): Promise<void> {
        const deletedDeal = await this.dealService.deleteDeal(Number(req.params.id));
        res.status(200).json({ success: true, msg: "Deal deleted successfully", deletedDeal });
    }
}
