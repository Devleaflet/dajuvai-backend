import AppDataSource from "../config/db.config";
import { MAX_SELECTED_RECIPIENTS, RecipientSearchQuery, TargetSearchQuery } from "../utils/zod_validations/broadcast.zod";

/**
 * Search for the broadcast composer: who to send to, and what a message
 * opens. Both are server-side so they stay accurate and fast with thousands
 * of customers and products, instead of filtering a full list in the browser.
 */

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Turns a query into SQL: every whitespace-separated word must match one of
 * `columns` (so "ram shr" finds "Ram Shrestha"), a number also matches the id,
 * and digits also match a phone number with its punctuation stripped.
 *
 * Returns the condition and its parameters, numbered from `offset + 1`.
 */
export function wordConditions(
    query: string,
    columns: string[],
    options: { idColumn: string; phoneColumn?: string; offset?: number },
): { sql: string; params: unknown[] } {
    const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 6);
    const params: unknown[] = [];
    const next = (value: unknown) => {
        params.push(value);
        return `$${(options.offset ?? 0) + params.length}`;
    };
    const clauses = words.map((word) => {
        const like = next(`%${escapeLike(word)}%`);
        const parts = columns.map((column) => `${column} ILIKE ${like}`);
        if (/^\d+$/.test(word)) parts.push(`${options.idColumn}::text = ${next(word)}`);
        const digits = word.replace(/\D/g, "");
        if (options.phoneColumn && digits.length >= 3)
            parts.push(`regexp_replace(COALESCE(${options.phoneColumn}, ''), '\\D', '', 'g') LIKE ${next(`%${digits}%`)}`);
        return `(${parts.join(" OR ")})`;
    });
    return { sql: clauses.length ? clauses.join(" AND ") : "TRUE", params };
}

/**
 * Best matches first: an exact email, phone or id; then a name or email that
 * starts with the query; then everything else.
 */
function rankSql(nameColumn: string, emailColumn: string, phoneColumn: string, idColumn: string, param: string) {
    return `CASE
        WHEN lower(${emailColumn}) = lower(${param}) OR ${phoneColumn} = ${param} OR ${idColumn}::text = ${param} THEN 0
        WHEN ${nameColumn} ILIKE ${param} || '%' OR ${emailColumn} ILIKE ${param} || '%' THEN 1
        ELSE 2 END`;
}

export interface RecipientRow {
    id: number;
    name: string | null;
    email: string | null;
    phone: string | null;
    /** Vendors: their district. */
    detail: string | null;
    verified: boolean;
    emailOptIn: boolean;
    hasDevice: boolean;
    createdAt: string;
}

export class BroadcastSearchService {
    async recipients(query: RecipientSearchQuery) {
        const user = query.kind === "user";
        const t = user
            ? {
                  from: `"user" p`,
                  base: `p.role = 'user' AND p."deletionRequestedAt" IS NULL`,
                  name: `COALESCE(NULLIF(p."fullName", ''), p.username)`,
                  columns: [`p."fullName"`, `p.username`, `p.email`],
                  detail: `NULL::text`,
                  device: `t."userId" = p.id`,
                  join: "",
              }
            : {
                  from: `"vendor" p`,
                  base: `p."deletionRequestedAt" IS NULL`,
                  name: `p."businessName"`,
                  columns: [`p."businessName"`, `p.email`, `d.name`],
                  detail: `d.name`,
                  device: `t."vendorId" = p.id`,
                  join: `LEFT JOIN "district" d ON d.id = p."districtId"`,
              };

        const words = wordConditions(query.q, t.columns, { idColumn: "p.id", phoneColumn: `p."phoneNumber"` });
        const params = [...words.params];
        let where = `${t.base} AND ${words.sql}`;
        if (query.ids) where += ` AND p.id = ANY($${params.push(query.ids)}::int[])`;
        const from = `FROM ${t.from} ${t.join} WHERE ${where}`;

        if (query.all === "1") {
            const rows: { id: number }[] = await AppDataSource.query(
                `SELECT p.id ${from} ORDER BY p.id LIMIT ${MAX_SELECTED_RECIPIENTS + 1}`,
                params,
            );
            return {
                ids: rows.slice(0, MAX_SELECTED_RECIPIENTS).map((r) => r.id),
                truncated: rows.length > MAX_SELECTED_RECIPIENTS,
            };
        }

        // Bound only when used: Postgres refuses a parameter it cannot type.
        const countParams = [...params];
        const rank = query.q
            ? rankSql(t.name, "p.email", `p."phoneNumber"`, "p.id", `$${params.push(query.q)}`)
            : null;
        const [rows, [{ total }]] = await Promise.all([
            AppDataSource.query(
                `SELECT p.id, ${t.name} AS name, p.email, p."phoneNumber" AS phone, ${t.detail} AS detail,
                        p."isVerified" AS verified, p."marketingEmailsEnabled" AS "emailOptIn", p."createdAt",
                        EXISTS (SELECT 1 FROM "device_tokens" t WHERE t."isActive" = true AND ${t.device}) AS "hasDevice"
                 ${from}
                 ORDER BY ${rank ? `${rank}, ` : ""}lower(${t.name}) NULLS LAST, p.id
                 LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`,
                params,
            ) as Promise<RecipientRow[]>,
            AppDataSource.query(`SELECT COUNT(*)::int AS total ${from}`, countParams),
        ]);
        return { data: rows, total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) };
    }

    /**
     * What a message can open. Only what a shopper could actually reach:
     * products that are live from approved stores, and approved stores.
     */
    async targets(query: TargetSearchQuery) {
        const shapes = {
            product: {
                select: `p.id, TRIM(p.name) AS label, v."businessName" AS detail, p."productImages"[1] AS "imageUrl",
                         COALESCE(p."finalPrice", p."basePrice") AS price`,
                from: `"products" p JOIN "vendor" v ON v.id = p."vendorId"`,
                base: `p.deleted_at IS NULL AND v."isApproved" = true AND v."isVerified" = true`,
                columns: [`p.name`, `p.slug`, `v."businessName"`],
                name: `TRIM(p.name)`,
            },
            store: {
                select: `p.id, p."businessName" AS label, d.name AS detail, p."profilePicture" AS "imageUrl", NULL::numeric AS price`,
                from: `"vendor" p LEFT JOIN "district" d ON d.id = p."districtId"`,
                base: `p."isApproved" = true AND p."isVerified" = true AND p."deletionRequestedAt" IS NULL`,
                columns: [`p."businessName"`, `p.slug`, `d.name`],
                name: `p."businessName"`,
            },
            category: {
                select: `p.id, p.name AS label,
                         (SELECT COUNT(*) FROM "subcategory" s WHERE s."categoryId" = p.id)::text || ' subcategories' AS detail,
                         p.image AS "imageUrl", NULL::numeric AS price`,
                from: `"category" p`,
                base: "TRUE",
                columns: [`p.name`, `p.slug`],
                name: `p.name`,
            },
            subcategory: {
                select: `p.id, p.name AS label, c.name AS detail, p.image AS "imageUrl", NULL::numeric AS price`,
                from: `"subcategory" p JOIN "category" c ON c.id = p."categoryId"`,
                base: "TRUE",
                columns: [`p.name`, `p.slug`, `c.name`],
                name: `p.name`,
            },
        } as const;
        const shape = shapes[query.type];

        const words = wordConditions(query.q, [...shape.columns], { idColumn: "p.id" });
        const params = [...words.params];
        let where = `${shape.base} AND ${words.sql}`;
        if (query.ids) where += ` AND p.id = ANY($${params.push(query.ids)}::int[])`;
        // No query, no rank: a bare "ORDER BY 0" is read as a column position.
        let rank: string | null = null;
        if (query.q) {
            const q = `$${params.push(query.q)}`;
            rank = `CASE WHEN p.id::text = ${q} THEN 0 WHEN ${shape.name} ILIKE ${q} || '%' THEN 1 ELSE 2 END`;
        }

        const rows = await AppDataSource.query(
            `SELECT ${shape.select} FROM ${shape.from} WHERE ${where}
             ORDER BY ${rank ? `${rank}, ` : ""}lower(${shape.name}), p.id LIMIT ${query.limit}`,
            params,
        );
        return {
            data: rows.map((row: { price: string | null } & Record<string, unknown>) => ({
                ...row,
                price: row.price === null ? null : Number(row.price),
            })),
        };
    }
}

export const broadcastSearchService = new BroadcastSearchService();
