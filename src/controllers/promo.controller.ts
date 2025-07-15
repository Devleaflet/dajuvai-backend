import { Request, Response } from "express";
import { PromoService } from "../service/promo.service";
import { CreatePromoCodeInput, createPromoSchema, DeletePromoCodeInput } from '../utils/zod_validations/promo.zod';
import { APIError } from "../utils/ApiError.utils";


export class PromoController {
    private promoService: PromoService;

    constructor() {
        this.promoService = new PromoService();
    }

    async getPromoCode(req: Request, res: Response) {
        try {
            const promoCodes = await this.promoService.getPromoCode();

            res.status(200).json({
                success: true,
                data: promoCodes
            })
        } catch (error) {
            if (error instanceof APIError) {
                console.log(error)
                res.status(error.status).json({ success: false, msg: error.message })
            } else {
                console.log(error)
                res.status(500).json({ success: false, msg: "Internal server error" })
            }
        }
    }

    async createPromo(req: Request, res: Response) {
        try {
            const promoData: CreatePromoCodeInput = req.body;

            const promoCode = await this.promoService.createPromo(promoData);

            res.status(201).json({ success: true, promocode: promoCode })
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                console.error('promo code creation error:', error);
                res.status(500).json({ success: false, message: 'Internal Server Error' });
            }
        }

    }

    async deletePromo(req: Request, res: Response) {
        try {

            const id = req.params.id;
            if (!id) {
                throw new APIError(400, "Promo id is required")
            }
            await this.promoService.deletePromo(req.params);

            res.status(200).json({
                success: true,
                msg: "Promo code deleted successfully"
            })
        } catch (error) {
            // Handle API errors with specific status codes
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors for debugging
                console.error('delete promo code error:', error);
                res.status(500).json({ success: false, message: 'Internal Server Error' });
            }
        }
    }
}