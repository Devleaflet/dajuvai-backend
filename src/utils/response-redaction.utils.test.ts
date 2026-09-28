import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import cookieParser from "cookie-parser";
import { responseCache } from "../middlewares/responseCache.middleware";
import { redactEntitySecrets } from "./response-redaction.utils";

describe("redactEntitySecrets as the json replacer", () => {
    const app = express();
    app.set("json replacer", redactEntitySecrets);
    app.get("/banner", (_req, res) => {
        res.json({
            success: true,
            token: "session-jwt",
            data: {
                id: 3,
                createdBy: {
                    id: 1,
                    fullName: "admin",
                    password: "$2b$10$hash",
                    resetToken: "$2b$10$reset",
                    resetTokenExpire: "2026-01-01",
                    verificationCode: "123",
                    fcmToken: "device",
                },
                vendors: [{ id: 4, businessName: "Fast & Fine+", password: "$2b$10$v" }],
            },
        });
    });

    it("strips secret columns at any depth and keeps everything else", async () => {
        const res = await request(app).get("/banner");
        expect(res.body).toEqual({
            success: true,
            token: "session-jwt",
            data: {
                id: 3,
                createdBy: { id: 1, fullName: "admin" },
                vendors: [{ id: 4, businessName: "Fast & Fine+" }],
            },
        });
    });
});

describe("responseCache", () => {
    let calls = 0;
    const app = express();
    app.set("json replacer", redactEntitySecrets);
    app.use(cookieParser());
    app.get("/cached", responseCache({ ttlSeconds: 60, keyPrefix: `test-${Date.now()}` }), (req, res) => {
        calls++;
        res.json({ author: { name: "admin", password: "$2b$10$hash" }, viewer: req.cookies?.token ?? null });
    });

    it("serves cache hits through the same redaction as live responses", async () => {
        const first = await request(app).get("/cached");
        const second = await request(app).get("/cached");
        expect(first.body.author).toEqual({ name: "admin" });
        expect(second.body.author).toEqual({ name: "admin" });
        expect(calls).toBe(1);
    });

    it("never caches or serves a cached copy to a cookie session", async () => {
        const res = await request(app).get("/cached").set("Cookie", "token=abc");
        expect(res.body.viewer).toBe("abc");
        const anonymous = await request(app).get("/cached");
        expect(anonymous.body.viewer).toBeNull();
    });
});
