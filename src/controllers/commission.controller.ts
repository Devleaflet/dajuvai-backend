import { Response, NextFunction } from "express";
import fs from "fs";
import { Readable } from "stream";
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
    // The declared type is the browser's guess; the bytes are checked too, so
    // a renamed image cannot be published as the agreement.
    if (
      file.mimetype !== "application/pdf" ||
      file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-"
    ) {
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
    const fileName = document.fileName || "commission-document.pdf";
    const disposition = req.query.download === "1" ? "attachment" : "inline";

    const sendHeaders = (size: number | string | null) => {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `${disposition}; filename="${fileName.replace(/"/g, '\\"')}"`,
      );
      if (size) res.setHeader("Content-Length", size);
      res.setHeader("Cache-Control", "private, max-age=300");
    };

    // Relayed rather than redirected, so a download keeps its filename and
    // existing clients of this route need not change.
    if (this.commissionService.isRemoteFile(document)) {
      const upstream = await fetch(document.fileUrl);
      if (!upstream.ok || !upstream.body) {
        throw new NotFoundError("Commission document file");
      }
      sendHeaders(upstream.headers.get("content-length"));
      Readable.fromWeb(upstream.body as any).pipe(res);
      return;
    }

    const filePath = this.commissionService.getFilePath(document);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError("Commission document file");
    }

    sendHeaders(fs.statSync(filePath).size);
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
