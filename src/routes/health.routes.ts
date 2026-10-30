import { Router, type Request, type Response } from "express";

import AppDataSource from "../config/db.config";

const healthRouter = Router();

/** Liveness plus the one dependency every request needs: the database. */
export async function healthCheck(_req: Request, res: Response): Promise<void> {
    res.set("Cache-Control", "no-store");
    try {
        await AppDataSource.query("SELECT 1");
        res.status(200).json({ status: "ok", database: "up" });
    } catch {
        // Deploy checks only need the verdict; the cause stays in server logs.
        res.status(503).json({ status: "unavailable", database: "down" });
    }
}

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check
 *     description: Liveness and database readiness for deploy and uptime checks. No authentication.
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: The API is up and the database answers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 database:
 *                   type: string
 *                   example: up
 *       503:
 *         description: The database is unreachable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: unavailable
 *                 database:
 *                   type: string
 *                   example: down
 */
healthRouter.get("/", healthCheck);

export default healthRouter;
