import { Request, Response, NextFunction } from "express";
import { ZodError, ZodSchema } from "zod";
import { ValidationError } from "../errors/HttpErrors";

/**
 * Validates request body/query/params using a Zod schema.
 * Forwards a ValidationError to the global error handler on failure.
 *
 * This is generic request validation, not authentication — it used to live
 * in auth.middleware.ts, which meant e.g. the order-status schema bug
 * surfaced with a stack trace pointing into an unrelated auth file.
 *
 * @param schema - Zod schema to validate against
 * @param property - Target request property ('body' | 'query' | 'params'), defaults to 'body'
 */
export const validateZod = (
  schema: ZodSchema,
  property: "body" | "query" | "params" = "body",
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync(req[property]);
      // Express 5 exposes req.query as a getter-only prototype property, so a
      // plain assignment silently no-ops and the coerced/defaulted values are
      // lost. defineProperty writes an own property that shadows the getter.
      Object.defineProperty(req, property, {
        value: parsed,
        writable: true,
        configurable: true,
        enumerable: true,
      });
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const fields = error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));
        return next(new ValidationError("Validation failed", fields));
      }
      return next(error);
    }
  };
};
