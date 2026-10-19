import type { NextFunction, Request, Response } from "express";
import { BadRequestError } from "../errors";
import { SearchService } from "../service/search.service";
import { searchCatalogSchema } from "../search/catalog-search.types";

export class CatalogSearchController {
  constructor(private readonly searchService: SearchService) {}

  async search(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    const parsed = searchCatalogSchema.safeParse({
      ...req.query,
      q: typeof req.query.q === "string" ? req.query.q : "",
      mode: typeof req.query.mode === "string" ? req.query.mode : "catalog",
    });
    if (!parsed.success) {
      throw new BadRequestError("Invalid catalog search query");
    }

    const data = await this.searchService.getCatalog(parsed.data);
    res.status(200).json({ success: true, data });
  }
}
