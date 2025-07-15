import { z } from "zod";

export const createDistrictSchema = z.object({
    // District name is required and must be at least 1 character
    name: z.string().min(1, "District name is required"),
});

export const updateDistrictSchema = z.object({
    // District name is optional on update but if present, must be at least 1 character
    name: z.string().min(1, "District name is required").optional(),
});

export const getDistrictByIdSchema = z.object({
    // District ID is a string input transformed to int and validated as positive number
    id: z.string()
        .transform((val) => parseInt(val))
        .refine((val) => !isNaN(val) && val > 0, {
            message: "Valid district ID is required",
        }),
});

// Types inferred from Zod schemas for use in TS types
export type CreateDistrictInput = z.infer<typeof createDistrictSchema>;
export type UpdateDistrictInput = z.infer<typeof updateDistrictSchema>;
export type GetDistrictByIdInput = z.infer<typeof getDistrictByIdSchema>;
