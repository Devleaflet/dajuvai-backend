import { NextFunction, Request, Response } from "express";
import { APIError } from "./ApiError.utils";

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(err);

    if (err instanceof APIError) {
        return res.status(err.status || 400).json({
            success: false,
            message: err.message || "Something went wrong",
        });
    }

    // fallback for other errors
    res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal Server Error",
    });
};