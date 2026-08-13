import { NextFunction, Response } from "express";
import { AuditLogQuery } from "../utils/zod_validations/audit.zod";
import { AuditService } from "../service/audit.service";
import { AuthRequest } from "../middlewares/auth.middleware";

export class AdminAuditController {
  private readonly auditService = new AuditService();

  async list(
    req: AuthRequest<{}, {}, {}, AuditLogQuery>,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    const data = await this.auditService.list({
      ...req.query,
      page: req.query.page ?? 1,
      limit: req.query.limit ?? 25,
    });
    res.status(200).json({ success: true, ...data });
  }
}
