import { Request, Response, NextFunction } from "express";
import { QueryFailedError, EntityNotFoundError } from "typeorm";
import { ZodError } from "zod";
import {
    JsonWebTokenError,
    TokenExpiredError as JwtTokenExpiredError,
} from "jsonwebtoken";
import { APIError } from "../errors/ApiError";
import {
    AuthError,
    DatabaseError,
    ForeignKeyConstraintError,
    NotFoundError,
    TokenExpiredError,
    UniqueConstraintError,
    ValidationError,
} from "../errors/HttpErrors";
import logger from "../utils/logger";
import config from "../config/env.config";

const isProduction = config.NODE_ENV === "production";

// ── Normalize any unknown thrown value into a typed APIError ─────────────────

function normalizeError(err: unknown): APIError {
    // Already one of our errors — pass through unchanged
    if (err instanceof APIError) return err;

    // TypeORM: QueryFailedError — map PostgreSQL error codes
    if (err instanceof QueryFailedError) {
        const pgErr = err as QueryFailedError & {
            code?: string;
            detail?: string;
            column?: string;
        };

        // 23505 = unique_violation
        if (pgErr.code === "23505") {
            const match = pgErr.detail?.match(/Key \((.+?)\)/);
            const field = match ? match[1] : "field";
            return new UniqueConstraintError(
                `A record with this ${field} already exists`,
            );
        }

        // 23503 = foreign_key_violation
        if (pgErr.code === "23503") {
            return new ForeignKeyConstraintError("Referenced record does not exist");
        }

        // 23502 = not_null_violation
        if (pgErr.code === "23502") {
            const col = pgErr.column ?? "field";
            return new ValidationError(`Field '${col}' cannot be null`);
        }

        // All other DB errors are programmer errors — never expose internals
        return new DatabaseError("A database error occurred");
    }

    // TypeORM: EntityNotFoundError (thrown by findOneOrFail)
    if (err instanceof EntityNotFoundError) {
        return new NotFoundError();
    }

    // Zod validation error (when validateZod calls next(zodError))
    if (err instanceof ZodError) {
        const fields = err.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
        }));
        return new ValidationError("Validation failed", fields);
    }

    // JWT: expired token
    if (err instanceof JwtTokenExpiredError) {
        return new TokenExpiredError("Token has expired — please log in again");
    }

    // JWT: any other JWT error (invalid signature, malformed, etc.)
    if (err instanceof JsonWebTokenError) {
        return new AuthError("Invalid token — please log in again");
    }

    // express.json() malformed body SyntaxError
    if (err instanceof SyntaxError && "body" in err) {
        return new ValidationError("Malformed JSON in request body");
    }

    // Unknown / programmer error — never expose internals
    const apiErr = new APIError(
        500,
        "Internal server error",
        "INTERNAL_ERROR",
        false,
    );
    // Preserve original stack for server-side logging
    apiErr.stack = err instanceof Error ? err.stack : String(err);
    return apiErr;
}

// ── Global error handler ─────────────────────────────────────────────────────
// IMPORTANT: The 4-parameter signature (err, req, res, next) is mandatory.
// Express identifies error handlers purely by arity — omitting `next` would
// silently degrade this into regular middleware.

export function globalErrorHandler(
    err: unknown,
    req: Request,
    res: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    next: NextFunction,
): void {
    const apiError = normalizeError(err);

    const logPayload = {
        errorCode: apiError.errorCode,
        status: apiError.status,
        message: apiError.message,
        isOperational: apiError.isOperational,
        method: req.method,
        url: req.originalUrl,
        stack: apiError.stack,
    };

    if (apiError.status >= 500) {
        logger.error("Server error", logPayload);
    } else {
        logger.warn("Client error", logPayload);
    }

    // Non-operational errors in production → always return opaque 500
    if (!apiError.isOperational && isProduction) {
        res.status(500).json({
            success: false,
            errorCode: "INTERNAL_ERROR",
            message: "Internal server error",
        });
        return;
    }

    const response: Record<string, unknown> = {
        success: false,
        errorCode: apiError.errorCode,
        message: apiError.message,
    };

    // Include field-level detail for validation errors
    if (apiError instanceof ValidationError && apiError.fields?.length) {
        response.errors = apiError.fields;
    }

    // Stack traces only in non-production environments
    if (!isProduction) {
        response.stack = apiError.stack;
    }

    res.status(apiError.status).json(response);
}

// ── 404 handler for completely unknown routes ─────────────────────────────────
// Register this AFTER all route definitions, BEFORE globalErrorHandler.

export function notFoundHandler(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl}`));
}
