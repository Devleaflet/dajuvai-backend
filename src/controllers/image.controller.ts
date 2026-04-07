import { Request, Response, NextFunction } from "express";
import { ImageService } from "../service/image.service";
import { BadRequestError } from "../errors";

export class ImageController {
    private imageService: ImageService;

    constructor() {
        this.imageService = new ImageService();
    }

    async uplaodSingle(req: Request<{}, {}, {}, { folder: string }>, res: Response, next: NextFunction) {
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) return next(new BadRequestError("No file uploaded"));

        const upload = await this.imageService.uploadSingleImage(files[0], req.query.folder);
        res.json({ success: true, data: upload });
    }
}
