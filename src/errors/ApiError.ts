/**
 * Base class for all intentional, operational API errors.
 *
 * isOperational = true  → client-caused error, safe to expose message to frontend
 * isOperational = false → programmer/system error, never expose internals in production
 */
export class APIError extends Error {
    public readonly status: number;
    public readonly errorCode: string;
    public readonly isOperational: boolean;
    /** Structured, client-safe context sent alongside the message. */
    public readonly details?: Record<string, unknown>;

    constructor(
        status: number,
        message: string,
        errorCode: string = "GENERIC_ERROR",
        isOperational: boolean = true,
        details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = this.constructor.name;
        this.status = status;
        this.errorCode = errorCode;
        this.isOperational = isOperational;
        this.details = details;

        // Required: fixes instanceof checks after TypeScript → CommonJS transpilation.
        // Without this, `err instanceof NotFoundError` silently returns false.
        Object.setPrototypeOf(this, new.target.prototype);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
