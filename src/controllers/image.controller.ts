import { Request, Response } from "express";
import { APIError } from "../utils/ApiError.utils";
import { ImageService } from '../service/image.service';

export class ImageController {
    private imageService: ImageService
    constructor() {
        this.imageService = new ImageService()
    }
    async uplaodSingle(req: Request<{}, {}, {}, { folder: string }>, res: Response) {
        try {
            const files = req.files as Express.Multer.File[];
            console.log(files); // array of uploaded files

            if (!files || files.length === 0) {
                return res.status(400).json({ message: 'No file uploaded' });
            }

            const file = files[0]; 
            const folder = req.query.folder;

            const upload = await this.imageService.uploadSingleImage(file, folder);
            res.json({ success: true, data: upload });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({
                    success: false,
                    msg: error.message
                })
            } else {
                res.status(500).json({
                    success: false,
                    msg: "Error uploding image"
                })
            }
        }
    }
}