/**
 * URL slugs for public-facing records.
 *
 * A slug is derived from a record's display name (`"Men's Running Shoes"` ->
 * `mens-running-shoes`) and is unique per table. Uniqueness is resolved by a
 * numeric suffix (`mens-running-shoes-2`), never by exposing the database id.
 *
 * Slugs are assigned by `SlugSubscriber` on insert and reassigned when the
 * source name changes; the previous slug is kept in `slug_redirects` so links
 * that were already shared keep resolving. Nothing outside that subscriber and
 * the backfill migration should write a slug column.
 */

export const SLUG_MAX_LENGTH = 100;

const COMBINING_MARKS = /\p{M}+/gu;
const APOSTROPHES = /['’`]/g;
const NON_SLUG_CHARS = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;

/**
 * Lowercase ASCII, hyphen-separated. Accents are folded (`Café` -> `cafe`),
 * apostrophes are dropped rather than split on (`Men's` -> `mens`), `&` reads
 * as `and`, and scripts with no Latin form (Devanagari) are removed. Returns
 * an empty string when nothing survives; callers supply a fallback.
 */
export function slugify(input: string | null | undefined): string {
    if (!input) return "";

    const slug = input
        .normalize("NFKD")
        .replace(COMBINING_MARKS, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(APOSTROPHES, "")
        .replace(NON_SLUG_CHARS, "-")
        .replace(EDGE_HYPHENS, "");

    if (slug.length <= SLUG_MAX_LENGTH) return slug;

    // Cut on a word boundary so a long product title does not end mid-word.
    const cut = slug.slice(0, SLUG_MAX_LENGTH);
    const lastHyphen = cut.lastIndexOf("-");
    return (lastHyphen > SLUG_MAX_LENGTH / 2 ? cut.slice(0, lastHyphen) : cut).replace(EDGE_HYPHENS, "");
}

/**
 * The slug a record should be based on before any uniqueness suffix.
 *
 * An all-digit slug is prefixed, because every `/:idOrSlug` route reads a
 * purely numeric segment as a primary key — a product named "2024" must not
 * shadow product #2024.
 */
export function baseSlug(source: string | null | undefined, fallback: string): string {
    const slug = slugify(source);
    if (!slug) return fallback;
    return /^\d+$/.test(slug) ? `${fallback}-${slug}` : slug;
}

/** Picks `base`, else the lowest free `base-N` (N >= 2), given the slugs already taken. */
export function nextFreeSlug(base: string, taken: Iterable<string>): string {
    const used = new Set(taken);
    if (!used.has(base)) return base;
    for (let n = 2; ; n++) {
        const candidate = `${base}-${n}`;
        if (!used.has(candidate)) return candidate;
    }
}

/** True when `slug` is `base` or `base` plus a uniqueness suffix, i.e. still a faithful slug of `base`. */
export function slugMatchesBase(slug: string | null | undefined, base: string): boolean {
    if (!slug) return false;
    return slug === base || new RegExp(`^${base}-\\d+$`).test(slug);
}

export type SlugIdentifier = { id: number } | { slug: string };

/**
 * Reads a route segment that may be either a numeric id (existing clients,
 * the mobile app) or a slug. Anything else is rejected by returning null so
 * the caller can answer 404 instead of querying with junk.
 */
export function parseIdOrSlug(value: unknown): SlugIdentifier | null {
    const raw = String(value ?? "").trim();
    if (/^\d+$/.test(raw)) {
        const id = Number(raw);
        return Number.isSafeInteger(id) && id > 0 ? { id } : null;
    }
    const slug = raw.toLowerCase();
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= SLUG_MAX_LENGTH + 12 ? { slug } : null;
}
