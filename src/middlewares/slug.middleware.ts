import { NextFunction, Request, Response } from "express";
import AppDataSource from "../config/db.config";
import { NotFoundError } from "../errors";
import { SLUGGED_TABLES } from "../subscribers/slug.subscriber";
import { parseIdOrSlug } from "../utils/slug.util";

export type SluggedTable = keyof typeof SLUGGED_TABLES;

const label = (table: SluggedTable) => {
    const name = SLUGGED_TABLES[table].fallback;
    return name.charAt(0).toUpperCase() + name.slice(1);
};

/**
 * The id a route segment refers to: the number itself, the row currently
 * holding that slug, or the row that used to (see `slug_redirects`). Null
 * when nothing matches or the value is neither an id nor a slug.
 */
export async function resolveEntityId(table: SluggedTable, value: unknown): Promise<number | null> {
    const identifier = parseIdOrSlug(value);
    if (!identifier) return null;
    if ("id" in identifier) return identifier.id;

    const current: { id: number }[] = await AppDataSource.query(
        `SELECT id FROM "${table}" WHERE slug = $1`,
        [identifier.slug],
    );
    if (current[0]) return current[0].id;

    const previous: { id: number }[] = await AppDataSource.query(
        `SELECT "entityId" AS id FROM slug_redirects WHERE "entityType" = $1 AND slug = $2`,
        [SLUGGED_TABLES[table].entityType, identifier.slug],
    );
    return previous[0]?.id ?? null;
}

/**
 * Lets a `/:id` route also answer to a slug, by rewriting the param to the id
 * before the controller sees it. Numeric ids pass through untouched, so every
 * existing client (the mobile app, old links) keeps working.
 *
 * The response carries the record's current `slug`; a client that asked by an
 * old slug can compare and redirect to the canonical URL.
 */
export const resolveSlugParam =
    (table: SluggedTable, param = "id") =>
    async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
        const id = await resolveEntityId(table, req.params[param]);
        if (id === null) throw new NotFoundError(label(table));
        req.params[param] = String(id);
        next();
    };

/**
 * Same, for catalogue filters in the query string (`?categoryId=mens-fashion`
 * or `?categoryIds=3,sunglasses`). Every listed value must resolve: dropping
 * an unknown slug would widen the listing to everything instead of nothing.
 *
 * Express 5 exposes `req.query` as a getter, so the rewritten copy is defined
 * as an own property, as `validateZod` does.
 */
export const resolveSlugQuery =
    (fields: Record<string, SluggedTable>) =>
    async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
        const query: Record<string, unknown> = { ...(req.query as Record<string, unknown>) };
        let changed = false;

        for (const [field, table] of Object.entries(fields)) {
            const raw = query[field];
            if (raw === undefined || raw === "") continue;

            const tokens = (Array.isArray(raw) ? raw : [raw])
                .flatMap((value) => String(value).split(","))
                .map((token) => token.trim())
                .filter(Boolean);
            if (tokens.every((token) => /^\d+$/.test(token))) continue;

            const ids: number[] = [];
            for (const token of tokens) {
                const id = await resolveEntityId(table, token);
                if (id === null) throw new NotFoundError(label(table));
                ids.push(id);
            }
            query[field] = ids.join(",");
            changed = true;
        }

        if (changed) {
            Object.defineProperty(req, "query", { value: query, writable: true, configurable: true, enumerable: true });
        }
        next();
    };
