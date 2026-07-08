import { Repository } from "typeorm";
import { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import AppDataSource from "../config/db.config";
import { CommissionDocument } from "../entities/commissionDocument.entity";
import { NotFoundError } from "../errors";

const UPLOADS_DIR = path.join(
  __dirname,
  "..",
  "uploads",
  "commission-documents",
);

export class CommissionService {
  private commissionRepo: Repository<CommissionDocument>;

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
    await fsp.mkdir(UPLOADS_DIR, { recursive: true });

    const storedFileName = `${crypto.randomUUID()}.pdf`;
    await fsp.writeFile(
      path.join(UPLOADS_DIR, storedFileName),
      dto.file.buffer,
    );

    await this.commissionRepo.update({ isActive: true }, { isActive: false });

    const document = this.commissionRepo.create({
      title: dto.title,
      fileUrl: storedFileName,
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

  /** Absolute path to the given document's file on disk. */
  getFilePath(document: CommissionDocument): string {
    return path.join(UPLOADS_DIR, document.fileUrl);
  }

  /**
   * Soft-deletes the currently active commission document.
   * Kept as history (isActive = false) — file stays on disk.
   */
  async deleteDocument(): Promise<void> {
    const document = await this.commissionRepo.findOne({
      where: { isActive: true },
    });
    if (!document) throw new NotFoundError("Commission document");
    await this.commissionRepo.update(document.id, { isActive: false });
  }
}
