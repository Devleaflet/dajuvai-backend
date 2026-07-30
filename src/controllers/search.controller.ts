import type { NextFunction, Request, Response } from "express";
import { BadRequestError } from "../errors";
import { SearchService } from "../service/search.service";
import { searchSuggestionSchema } from "../search/search-suggestion.schema";

export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  async getSuggestions(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const parsed = searchSuggestionSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError("Invalid search suggestion query");
    }

    const data = await this.searchService.getSuggestions(parsed.data);
    res.status(200).json({ success: true, data });
  }
}
