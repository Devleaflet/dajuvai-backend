import { APIError } from "./ApiError";

// ── 400 Bad Request ──────────────────────────────────────────────────────────

export class ValidationError extends APIError {
    public readonly fields?: { field: string; message: string }[];

    constructor(
        message: string = "Validation failed",
        fields?: { field: string; message: string }[],
    ) {
        super(400, message, "VALIDATION_ERROR");
        this.fields = fields;
    }
}

export class BadRequestError extends APIError {
    constructor(message: string = "Bad request") {
        super(400, message, "BAD_REQUEST");
    }
}

export class InvalidOrderStatusTransitionError extends APIError {
    constructor(message: string) {
        super(400, message, "INVALID_ORDER_STATUS_TRANSITION");
    }
}

export class OrderStateChangedError extends APIError {
    constructor(message: string = "This order was updated by another user. Refresh and try again.") {
        super(409, message, "ORDER_STATE_CHANGED");
    }
}

// ── 401 Unauthorized ─────────────────────────────────────────────────────────

export class AuthError extends APIError {
    constructor(message: string = "Authentication required") {
        super(401, message, "AUTHENTICATION_FAILED");
    }
}

export class TokenExpiredError extends APIError {
    constructor(message: string = "Token has expired") {
        super(401, message, "TOKEN_EXPIRED");
    }
}

// ── 403 Forbidden ────────────────────────────────────────────────────────────

export class ForbiddenError extends APIError {
    constructor(message: string = "Access denied") {
        super(403, message, "FORBIDDEN");
    }
}

// ── 404 Not Found ────────────────────────────────────────────────────────────

export class NotFoundError extends APIError {
    constructor(resource: string = "Resource") {
        super(404, `${resource} not found`, "RESOURCE_NOT_FOUND");
    }
}

// ── 409 Conflict ─────────────────────────────────────────────────────────────

export class ConflictError extends APIError {
    constructor(message: string = "Resource already exists") {
        super(409, message, "CONFLICT");
    }
}

// ── 402 Payment Required ─────────────────────────────────────────────────────

export class PaymentError extends APIError {
    constructor(message: string = "Payment processing failed") {
        super(402, message, "PAYMENT_ERROR");
    }
}

// ── 422 Unprocessable Entity ─────────────────────────────────────────────────

export class UnprocessableError extends APIError {
    constructor(message: string = "Unprocessable entity") {
        super(422, message, "UNPROCESSABLE");
    }
}

// ── 429 Too Many Requests ────────────────────────────────────────────────────

export class RateLimitError extends APIError {
    constructor(message: string = "Too many requests") {
        super(429, message, "RATE_LIMIT_EXCEEDED");
    }
}

// ── 410 Gone ─────────────────────────────────────────────────────────────────

export class GoneError extends APIError {
    constructor(message: string = "Resource is no longer available") {
        super(410, message, "GONE");
    }
}

// ── 503 Service Unavailable ──────────────────────────────────────────────────

export class ServiceUnavailableError extends APIError {
    constructor(message: string = "Service temporarily unavailable") {
        super(503, message, "SERVICE_UNAVAILABLE");
    }
}

// ── Database-layer errors (mapped from TypeORM inside globalErrorHandler) ────
// Also exported here for explicit service-layer use and tests.

export class UniqueConstraintError extends APIError {
    constructor(message: string = "A record with this value already exists") {
        super(409, message, "UNIQUE_CONSTRAINT_VIOLATION");
    }
}

export class ForeignKeyConstraintError extends APIError {
    constructor(message: string = "Related record not found") {
        super(422, message, "FOREIGN_KEY_VIOLATION");
    }
}

export class DatabaseError extends APIError {
    constructor(message: string = "A database error occurred") {
        // isOperational = false → always returns opaque 500 in production
        super(500, message, "DATABASE_ERROR", false);
    }
}
