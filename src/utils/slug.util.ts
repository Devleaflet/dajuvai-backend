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

const DEVANAGARI_CONSONANTS: Record<string, string> = {
    क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "ng", च: "ch", छ: "chh", ज: "j", झ: "jh", ञ: "ny",
    ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n", त: "t", थ: "th", द: "d", ध: "dh", न: "n",
    प: "p", फ: "ph", ब: "b", भ: "bh", म: "m", य: "y", र: "r", ल: "l", ळ: "l", व: "v",
    श: "sh", ष: "sh", स: "s", ह: "h",
};
const DEVANAGARI_VOWELS: Record<string, string> = {
    अ: "a", आ: "a", इ: "i", ई: "i", उ: "u", ऊ: "u", ऋ: "ri", ए: "e", ऐ: "ai", ओ: "o", औ: "au",
};
const DEVANAGARI_SIGNS: Record<string, string> = {
    "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
};
const DEVANAGARI_MARKS: Record<string, string> = { "ं": "n", "ँ": "n", "ः": "h" };
const VIRAMA = "्";
const NUKTA = /़/g;

/**
 * Nepali/Hindi script to plain Latin letters (`ढाका टोपी` -> `dhaka topi`), so
 * a product named only in Devanagari still gets a readable slug instead of a
 * fallback. A consonant carries an `a` unless a vowel sign or virama follows,
 * and drops it at the end of a word, as the words are spoken.
 */
function romaniseDevanagari(input: string): string {
    const chars = [...input.replace(NUKTA, "")];
    let out = "";
    for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        const consonant = DEVANAGARI_CONSONANTS[ch];
        if (consonant !== undefined) {
            out += consonant;
            const next = chars[i + 1];
            if (next !== undefined && DEVANAGARI_SIGNS[next] !== undefined) {
                out += DEVANAGARI_SIGNS[next];
                i++;
            } else if (next === VIRAMA) {
                i++;
            } else if (
                next !== undefined &&
                (DEVANAGARI_CONSONANTS[next] !== undefined || DEVANAGARI_MARKS[next] !== undefined)
            ) {
                out += "a";
            }
            continue;
        }
        if (DEVANAGARI_VOWELS[ch] !== undefined) out += DEVANAGARI_VOWELS[ch];
        else if (DEVANAGARI_MARKS[ch] !== undefined) out += DEVANAGARI_MARKS[ch];
        else if (ch >= "०" && ch <= "९") out += String(ch.charCodeAt(0) - "०".charCodeAt(0));
        else out += ch;
    }
    return out;
}

/**
 * Lowercase ASCII, hyphen-separated. Accents are folded (`Café` -> `cafe`),
 * apostrophes are dropped rather than split on (`Men's` -> `mens`), `&` reads
 * as `and`, Devanagari is romanised (`अचार` -> `achar`), and other scripts with
 * no Latin form are removed. Returns an empty string when nothing survives;
 * callers supply a fallback.
 */
export function slugify(input: string | null | undefined): string {
    if (!input) return "";

    const slug = romaniseDevanagari(input)
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
