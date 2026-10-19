import type { Request, Response } from "express";
import AppDataSource from "../config/db.config";
import { BadRequestError } from "../errors";
import { SearchAliasService } from "../service/search-alias.service";
import { SearchAliasCandidate } from "../entities/search-alias-candidate.entity";

export class SearchAliasController {
  private readonly service = new SearchAliasService(AppDataSource);

  private id(value: string): number {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestError("Invalid search alias id");
    return id;
  }

  async list(req: Request, res: Response): Promise<void> {
    const state = req.query.state === "active" ? "active" : "candidate";
    const data = state === "active"
      ? await this.service.list("active")
      : await AppDataSource.getRepository(SearchAliasCandidate).find({
        where: { active: false },
        order: { confidence: "DESC", id: "ASC" },
        take: 100,
      });
    res.status(200).json({ success: true, data });
  }

  async approve(req: Request<{ id: string }>, res: Response): Promise<void> {
    if (!await this.service.approve(this.id(req.params.id))) throw new BadRequestError("Search alias not found");
    res.status(200).json({ success: true });
  }

  async disable(req: Request<{ id: string }>, res: Response): Promise<void> {
    if (!await this.service.disable(this.id(req.params.id))) throw new BadRequestError("Search alias not found");
    res.status(200).json({ success: true });
  }
}
