import { Request, Response, NextFunction } from "express";
import { PromoService } from "../service/promo.service";
import { CreatePromoCodeInput } from "../utils/zod_validations/promo.zod";
import { BadRequestError } from "../errors";

export class PromoController {
    private promoService: PromoService;

    constructor() {
        this.promoService = new PromoService();
    }

    async getPromoCode(_req: Request, res: Response, _next: NextFunction) {
        const promoCodes = await this.promoService.getPromoCode();
        res.status(200).json({ success: true, data: promoCodes });
    }

    async createPromo(req: Request, res: Response, _next: NextFunction) {
        const promoCode = await this.promoService.createPromo(req.body as CreatePromoCodeInput);
        res.status(201).json({ success: true, promocode: promoCode });
    }

    async deletePromo(req: Request, res: Response, next: NextFunction) {
        if (!req.params.id) return next(new BadRequestError("Promo id is required"));
        await this.promoService.deletePromo(req.params);
        res.status(200).json({ success: true, msg: "Promo code deleted successfully" });
    }
}
