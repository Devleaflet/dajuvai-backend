import { DataSource, In, Repository } from "typeorm";
import { SearchAlias } from "../entities/search-alias.entity";
import { normalizeSearchQuery } from "../search/normalize-search-query";

export class SearchAliasService {
  private readonly repository: Repository<SearchAlias>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(SearchAlias);
  }

  async resolve(query: string, locale?: string): Promise<string[]> {
    const normalizedQuery = normalizeSearchQuery(query);
    if (!normalizedQuery) return [];

    const matches = await this.repository.find({
      where: [
        { normalizedCanonical: normalizedQuery, ...(locale ? { locale } : {}) },
        { normalizedAlias: normalizedQuery, ...(locale ? { locale } : {}) },
        ...(locale ? [{ normalizedCanonical: normalizedQuery, locale: null }, { normalizedAlias: normalizedQuery, locale: null }] : []),
      ],
      order: { confidence: "DESC", id: "ASC" },
      take: 24,
    });

    return [...new Set(matches
      .filter((alias) => alias.active && alias.approvedAt)
      .flatMap((alias) => [alias.normalizedCanonical, alias.normalizedAlias])
      .filter((value) => value && value !== normalizedQuery))]
      .slice(0, 12);
  }

  async findActive(query: string, locale?: string): Promise<string[]> {
    return this.resolve(query, locale);
  }

  async list(state: "candidate" | "active") {
    return this.repository.find({
      where: state === "active" ? { active: true } : { active: false },
      order: { confidence: "DESC", id: "ASC" },
      take: 100,
    });
  }

  async approve(id: number): Promise<boolean> {
    const result = await this.repository.update({ id }, { active: true, approvedAt: new Date() });
    return Boolean(result.affected);
  }

  async disable(id: number): Promise<boolean> {
    const result = await this.repository.update({ id }, { active: false });
    return Boolean(result.affected);
  }
}
