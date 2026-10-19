import { Repository } from "typeorm";
import { Promo } from '../entities/promo.entity';
import AppDataSource from "../config/db.config";
import { CreatePromoCodeInput, PromoIdParam, UpdatePromoCodeInput } from "../utils/zod_validations/promo.zod";
import { APIError } from "../utils/ApiError.utils";
import { normalizePromoCode } from "./promoRules";

export class PromoService {

    private promoRepository: Repository<Promo>;
    constructor() {
        this.promoRepository = AppDataSource.getRepository(Promo);
    }

    async getPromoCode() {
        return await this.promoRepository.find();
    }

    async createPromo(data: CreatePromoCodeInput): Promise<Promo> {
        const newpromoCode = this.promoRepository.create({
            ...data,
            // Store codes normalized (trim + uppercase) so customer-facing
            // matching is case-insensitive and unique-by-uppercase.
            promoCode: normalizePromoCode(data.promoCode),
        })

        const savedpromoCode = await this.promoRepository.save(newpromoCode);

        return savedpromoCode;
    }

    async deletePromo(data: PromoIdParam) {

        const promo = await this.promoRepository.findOne({
            where: {
                id: data.id
            }
        });
        if (!promo) {
            throw new APIError(404, "Promo code not found");
        }
        const deletedPromo = this.promoRepository.delete(data.id);

        console.log("deleted promo code", deletedPromo);
        return deletedPromo;
    }

    /** Case-insensitive lookup — a customer may type the code in any case. */
    async findPromoByCode(code: string) {
        const normalized = normalizePromoCode(code);
        if (!normalized) return null;
        return await this.promoRepository
            .createQueryBuilder("promo")
            .where("LOWER(promo.promoCode) = LOWER(:code)", {
                code: normalized,
            })
            .getOne();
    }

    async findPromoCodeById(promoCodeId: number) {
        return await this.promoRepository.findOne({
            where: {
                id: promoCodeId
            }
        })
    }

    async updatePromoCodeById(promoId: number, data: UpdatePromoCodeInput) {
        const payload: Partial<UpdatePromoCodeInput> & { id: number } = {
            // Coerced here as well as in the route's params schema. `save()`
            // reads a string primary key as "no key yet" and INSERTs, so a
            // caller that skips the middleware would silently turn every edit
            // into a duplicate-code 409 rather than failing loudly.
            id: Number(promoId),
            ...data,
        };
        if (data.promoCode) {
            payload.promoCode = normalizePromoCode(data.promoCode);
        }
        return await this.promoRepository.save(payload);
    }
}