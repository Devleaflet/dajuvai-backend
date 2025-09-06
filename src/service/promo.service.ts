import { Repository } from "typeorm";
import { Promo } from '../entities/promo.entity';
import AppDataSource from "../config/db.config";
import { CreatePromoCodeInput, DeletePromoCodeInput } from "../utils/zod_validations/promo.zod";
import { APIError } from "../utils/ApiError.utils";

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
            ...data
        })

        console.log(newpromoCode);

        const savedpromoCode = await this.promoRepository.save(newpromoCode);

        return savedpromoCode;
    }

    async deletePromo(data: DeletePromoCodeInput) {

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

    async findPromoByCode(code: string) {
        return await this.promoRepository.findOne({
            where: {
                promoCode: code
            }
        })
    }

    async findPromoCodeById(promoCodeId: number) {
        return await this.promoRepository.findOne({
            where: {
                id: promoCodeId
            }
        })
    }
}