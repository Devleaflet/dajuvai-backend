import type { NextFunction, Request, Response } from "express";
import { BadRequestError } from "../errors";
import { SearchService } from "../service/search.service";
import { searchEventSchema } from "../search/search-event.schema";
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

  /**
   * Accepted rather than OK, and the body is not echoed: the caller gets
   * nothing back it could use to probe which ids exist.
   */
  async recordEvent(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const parsed = searchEventSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Invalid search event");
    }

    await this.searchService.recordSearchOutcome(parsed.data);
    res.status(202).json({ success: true });
  }
}
