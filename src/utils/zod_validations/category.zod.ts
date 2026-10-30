import { z } from 'zod';
import { DEFAULT_MINIMUM_AGE } from '../../service/age-restriction.service';

/**
 * Shared base schema for category validation
 */
const baseCategorySchema = z.object({
    // Category name is required and must not exceed 100 characters
    name: z
        .string()
        .min(1, 'Category name is required')
        .max(100, 'Category name cannot exceed 100 characters'),

    // Image must be a valid URL if provided
    image: z
        .string()
        .url('Image must be a valid URL')
        .optional()
        .nullable(),
    isAgeRestricted: z.union([z.boolean(), z.string().transform(value => value.toLowerCase() === 'true')]).optional(),
    minimumAge: z.coerce.number().int().min(1).max(130).nullable().optional(),
    restrictionMessage: z.string().trim().max(500).nullable().optional(),
});

/**
 * Ages a restriction message states, read only from age phrasing: "21+",
 * "21 years", "21 or older" / "21 and over", "aged 21", "age of 21",
 * "over/under/above 21". Bare numbers ("750ml", "2 bottles") are not ages.
 * ponytail: phrase regex, not NLP; "over 5000 rupees" would read as an age,
 * which an age-gate message has no reason to say.
 */
const AGE_PHRASE =
    /(\d+)\s*\+|(\d+)\s*(?:years?|yrs?)\b|(\d+)\s*(?:or|and)\s*(?:older|over|above)|\b(?:aged?|over|under|above)\s+(?:the\s+age\s+)?(?:of\s+)?(\d+)/gi;

export const agesInRestrictionMessage = (message: string): number[] =>
    [...message.matchAll(AGE_PHRASE)].map((m) => Number(m[1] ?? m[2] ?? m[3] ?? m[4]));

/**
 * QA BUG-032: the storefront gate's heading comes from `minimumAge` and its
 * body from `restrictionMessage`, so the message may not name another age.
 * An omitted age is checked against the 18 the service will store.
 */
const restrictionMessageMatchesAge = (
    value: { isAgeRestricted?: boolean; minimumAge?: number | null; restrictionMessage?: string | null },
    ctx: z.RefinementCtx,
) => {
    if (!value.isAgeRestricted || !value.restrictionMessage) return;
    const age = value.minimumAge ?? DEFAULT_MINIMUM_AGE;
    const other = agesInRestrictionMessage(value.restrictionMessage).find((n) => n !== age);
    if (other !== undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['restrictionMessage'],
            message: `This message mentions age ${other}, but the minimum age is ${age}. Update the message to match.`,
        });
    }
};

/**
 * Schema for creating a category
 */
export const createCategorySchema = baseCategorySchema.superRefine(restrictionMessageMatchesAge);

/**
 * Schema for updating a category (all fields optional)
 */
export const updateCategorySchema = baseCategorySchema.partial().superRefine(restrictionMessageMatchesAge);

/**
 * TypeScript types inferred from Zod schemas
 */
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
