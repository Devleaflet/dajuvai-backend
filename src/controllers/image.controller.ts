import { Request, Response, NextFunction } from "express";
import { CloudinaryService } from "../service/image.service";
import { BadRequestError } from "../errors";

export class ImageController {
    private imageService: CloudinaryService;

    constructor() {
        this.imageService = new CloudinaryService();
    }

    async uploadSingle(req: Request<{}, {}, {}, { folder?: string }>, res: Response, next: NextFunction) {
        const files = req.files as Express.Multer.File[] | undefined;
        const file = req.file ?? files?.[0];
        if (!file) return next(new BadRequestError("No file uploaded"));

        const upload = await this.imageService.uploadSingleImage(file, req.query.folder);
        res.json({
            success: true,
            data: upload.url,
            publicId: upload.publicId,
            resourceType: upload.resourceType,
        });
    }
}
