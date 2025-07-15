/**
 * Custom error class representing a "Not Found" error.
 * Extends the built-in Error class to provide a specific error type
 * for resources or entities that cannot be found.
 */
export class NotFoundError extends Error {
    /**
     * Constructs a new NotFoundError.
     * @param message - A descriptive error message.
     */
    constructor(message: string) {
        super(message);
        this.name = 'NotFoundError';  // Set the error name explicitly for easier identification
    }
}
