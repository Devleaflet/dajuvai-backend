/**
 * Custom error class to standardize API error responses.
 * 
 * Extends the built-in Error class by adding an HTTP status code property.
 * This allows throwing errors with both a message and an HTTP status code,
 * which can be used by middleware or error handlers to send consistent
 * error responses to clients.
 * 
 * @param status - HTTP status code to represent the error type (e.g., 400, 404, 500)
 * @param message - Human-readable error message describing the problem
 * 
 * Example usage:
 *   throw new APIError(404, 'Resource not found');
 */
export class APIError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.status = status;

    }
}
