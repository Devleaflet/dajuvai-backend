import { Response, NextFunction } from "express";
import fs from "fs";
import {
  AuthRequest,
  CombinedAuthRequest,
} from "../middlewares/auth.middleware";
import { CommissionService } from "../service/commission.service";
import { emitCommissionUpdate, emitCommissionDelete } from "../socket/socket";
import { BadRequestError, NotFoundError } from "../errors";

export class CommissionController {
  private commissionService: CommissionService;

  constructor() {
    this.commissionService = new CommissionService();
  }

  async uploadDocument(
    req: AuthRequest<{}, {}, { title?: string }>,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    const files = req.files as Express.Multer.File[] | undefined;
    const file = files?.[0];
    const title = (req.body.title || "").trim();

    if (!title) throw new BadRequestError("Title is required");
    if (!file) throw new BadRequestError("Please choose a file to upload");
    if (file.mimetype !== "application/pdf") {
      throw new BadRequestError(
        "Only PDF files are allowed for the commission document",
      );
    }

    const document = await this.commissionService.uploadDocument(
      { title, file },
      req.user.id,
    );

    emitCommissionUpdate(document);

    res.status(201).json({
      success: true,
      message: "Commission document updated",
      data: document,
    });
  }

  /**
   * GET /api/commission
   * Returns { success: true, data: document } when one exists,
   * or { success: true, data: null } when none — never 404s.
   * The 404 warn spam was caused by throwing here on every page load.
   */
  async getDocument(
    _req: CombinedAuthRequest,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    const document = await this.commissionService.getCurrentDocument();
    res.status(200).json({ success: true, data: document ?? null });
  }

  /**
   * GET /api/commission/file
   * Streams the PDF. Returns 404 when no active document exists.
   */
  async getFile(
    req: CombinedAuthRequest<{}, {}, {}, { download?: string }>,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    const document = await this.commissionService.getCurrentDocumentOrThrow();
    const filePath = this.commissionService.getFilePath(document);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundError("Commission document file");
    }

    const fileName = document.fileName || "commission-document.pdf";
    const disposition = req.query.download === "1" ? "attachment" : "inline";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${fileName.replace(/"/g, '\\"')}"`,
    );

    const stat = fs.statSync(filePath);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Cache-Control", "private, max-age=300");

    fs.createReadStream(filePath).pipe(res);
  }

  async deleteDocument(
    _req: AuthRequest,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    await this.commissionService.deleteDocument();
    emitCommissionDelete();
    res.status(200).json({
      success: true,
      message: "Commission document deleted",
    });
  }
}
