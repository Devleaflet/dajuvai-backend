import { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>;

/**
 * Wrapper to handle async route handlers and middleware in Express.
 * 
 * This function takes an async function (that returns a Promise) and
 * returns a standard Express RequestHandler function. It automatically
 * catches any rejected Promise (errors thrown in async functions) and
 * forwards them to Express's error handling middleware via `next()`.
 * 
 * Without this wrapper, async errors can cause unhandled rejections
 * and crash the server or cause the request to hang.
 * 
 * Usage:
 * 
 * app.get('/route', asyncHandler(async (req, res, next) => {
 *    // your async code here
 * }));
 * 
 * @param fn - An async function that handles the request, response, and next
 * @returns A standard Express middleware/request handler function
 */
export const asyncHandler = (fn: AsyncHandler): RequestHandler => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
