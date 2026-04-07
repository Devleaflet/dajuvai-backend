import { Request, Response, NextFunction } from "express";
import { DistrictService } from "../service/district.service";
import {
    CreateDistrictInput,
    createDistrictSchema,
    getDistrictByIdSchema,
    UpdateDistrictInput,
    updateDistrictSchema,
} from "../utils/zod_validations/district.zod";
import { AuthRequest } from "../middlewares/auth.middleware";
import { ValidationError } from "../errors";

export class DistrictController {
    private districtService: DistrictService;

    constructor() {
        this.districtService = new DistrictService();
    }

    async createDistrict(req: AuthRequest<{}, {}, CreateDistrictInput>, res: Response, next: NextFunction): Promise<void> {
        const parsed = createDistrictSchema.safeParse(req.body);
        if (!parsed.success) {
            return next(new ValidationError("Validation failed", parsed.error.errors.map(e => ({ field: e.path.join("."), message: e.message }))));
        }
        const district = await this.districtService.createDistrict(parsed.data.name);
        res.status(201).json({ success: true, data: district });
    }

    async updateDistrict(req: AuthRequest<{ id: string }, {}, UpdateDistrictInput>, res: Response, next: NextFunction): Promise<void> {
        const idParsed = getDistrictByIdSchema.safeParse(req.params);
        if (!idParsed.success) {
            return next(new ValidationError("Validation failed", idParsed.error.errors.map(e => ({ field: e.path.join("."), message: e.message }))));
        }
        const parsed = updateDistrictSchema.safeParse(req.body);
        if (!parsed.success) {
            return next(new ValidationError("Validation failed", parsed.error.errors.map(e => ({ field: e.path.join("."), message: e.message }))));
        }
        const district = await this.districtService.updateDistrict(idParsed.data.id, parsed.data.name);
        res.status(200).json({ success: true, data: district });
    }

    async getDistricts(_req: Request, res: Response, _next: NextFunction): Promise<void> {
        const districts = await this.districtService.getDistricts();
        res.status(200).json({ success: true, data: districts });
    }

    async getDistrictById(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
        const parsed = getDistrictByIdSchema.safeParse(req.params);
        if (!parsed.success) {
            return next(new ValidationError("Validation failed", parsed.error.errors.map(e => ({ field: e.path.join("."), message: e.message }))));
        }
        const district = await this.districtService.findDistrictById(parsed.data.id);
        res.status(200).json({ success: true, data: district });
    }

    async deleteDistrict(req: AuthRequest<{ id: string }, {}, {}>, res: Response, next: NextFunction): Promise<void> {
        const parsed = getDistrictByIdSchema.safeParse(req.params);
        if (!parsed.success) {
            return next(new ValidationError("Validation failed", parsed.error.errors.map(e => ({ field: e.path.join("."), message: e.message }))));
        }
        await this.districtService.deleteDistrict(parsed.data.id);
        res.status(200).json({ success: true, message: "District deleted successfully" });
    }
}
