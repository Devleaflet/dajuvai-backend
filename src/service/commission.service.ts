import { Repository } from "typeorm";
import path from "path";
import AppDataSource from "../config/db.config";
import { CommissionDocument } from "../entities/commissionDocument.entity";
import { NotFoundError } from "../errors";
import { CloudinaryService } from "./image.service";

/**
 * Where documents uploaded before the move to Cloudinary still live. New
 * uploads never write here: a container's disk does not survive a redeploy.
 */
const UPLOADS_DIR = path.join(
  __dirname,
  "..",
  "uploads",
  "commission-documents",
);

export class CommissionService {
  private commissionRepo: Repository<CommissionDocument>;
  private cloudinaryService = new CloudinaryService();

  constructor() {
    this.commissionRepo = AppDataSource.getRepository(CommissionDocument);
  }

  /**
   * Replace the currently active commission document with a new one.
   * The previous document is kept (isActive = false) as history.
   */
  async uploadDocument(
    dto: { title: string; file: Express.Multer.File },
    adminId: number,
  ): Promise<CommissionDocument> {
    // Uploaded before the current document is retired, so a failed upload
    // leaves vendors with the old terms rather than none.
    const uploaded = await this.cloudinaryService.uploadSingleImage(
      dto.file,
      "commission-documents",
    );

    await this.commissionRepo.update({ isActive: true }, { isActive: false });

    const document = this.commissionRepo.create({
      title: dto.title,
      fileUrl: uploaded.url,
      fileName: dto.file.originalname,
      isActive: true,
      uploadedById: adminId,
    });

    return this.commissionRepo.save(document);
  }

  /**
   * Returns null (instead of throwing) when no active document exists.
   * Controllers that need to 404 explicitly will call getCurrentDocumentOrThrow.
   */
  async getCurrentDocument(): Promise<CommissionDocument | null> {
    return this.commissionRepo.findOne({
      where: { isActive: true },
      relations: ["uploadedBy"],
      select: {
        id: true,
        title: true,
        fileUrl: true,
        fileName: true,
        createdAt: true,
        updatedAt: true,
        uploadedBy: {
          id: true,
          fullName: true,
        },
      },
    });
  }

  /**
   * Throws NotFoundError when no active document exists.
   * Used by file-serving endpoints where 404 is the correct HTTP response.
   */
  async getCurrentDocumentOrThrow(): Promise<CommissionDocument> {
    const document = await this.getCurrentDocument();
    if (!document) throw new NotFoundError("Commission document");
    return document;
  }

  /** True when the file is held on Cloudinary rather than on local disk. */
  isRemoteFile(document: CommissionDocument): boolean {
    return /^https:\/\//.test(document.fileUrl);
  }

  /** Absolute path to a pre-Cloudinary document's file on disk. */
  getFilePath(document: CommissionDocument): string {
    return path.join(UPLOADS_DIR, path.basename(document.fileUrl));
  }

  /**
   * Soft-deletes the currently active commission document.
   * Kept as history (isActive = false) — the file stays where it is.
   */
  async deleteDocument(): Promise<void> {
    const document = await this.commissionRepo.findOne({
      where: { isActive: true },
    });
    if (!document) throw new NotFoundError("Commission document");
    await this.commissionRepo.update(document.id, { isActive: false });
  }
}
