/**
 * Self-check for the FCM push layer. No DB, no Firebase, no test framework.
 *
 *   npx ts-node src/scripts/fcm.selfcheck.ts
 *
 * Covers the parts that fail silently rather than loudly: zod coercion/defaults
 * (query params arrive as strings), and the Express 5 req.query fix in
 * validateZod — a plain assignment there no-ops, so a regression would quietly
 * strip defaults instead of throwing.
 */
import assert from "assert";
import express from "express";
import { readFileSync } from "fs";
import { join } from "path";
import { validateZod } from "../middlewares/auth.middleware";
import {
    sendToUserSchema,
    sendToTopicSchema,
    dispatchQuerySchema,
    registerDeviceSchema,
} from "../utils/zod_validations/push.zod";

const ok = (name: string) => console.log(`  ok - ${name}`);

async function checkSchemas() {
    // priority defaults to high when omitted
    const user = await sendToUserSchema.parseAsync({
        userId: "42", // query/body ids often arrive as strings
        title: "Sale",
        body: "50% off",
    });
    assert.strictEqual(user.userId, 42, "userId must coerce to number");
    assert.strictEqual(user.priority, "high", "priority must default to high");
    ok("sendToUser coerces userId and defaults priority");

    await assert.rejects(
        () => sendToUserSchema.parseAsync({ userId: 1, title: "", body: "x" }),
        "empty title must be rejected",
    );
    await assert.rejects(
        () => sendToUserSchema.parseAsync({ userId: 1, title: "t", body: "b", imageUrl: "not-a-url" }),
        "invalid imageUrl must be rejected",
    );
    ok("sendToUser rejects empty title and bad imageUrl");

    // Firebase rejects topics outside this charset, so we must too.
    await assert.rejects(
        () => sendToTopicSchema.parseAsync({ topic: "bad topic!", title: "t", body: "b" }),
        "topic with invalid chars must be rejected",
    );
    assert.strictEqual(
        (await sendToTopicSchema.parseAsync({ topic: "all-users", title: "t", body: "b" })).topic,
        "all-users",
    );
    ok("sendToTopic enforces Firebase topic charset");

    await assert.rejects(
        () => registerDeviceSchema.parseAsync({ fcmToken: "short", deviceId: "d", platform: "android" }),
        "token under 20 chars must be rejected",
    );
    await assert.rejects(
        () =>
            registerDeviceSchema.parseAsync({
                fcmToken: "x".repeat(32),
                deviceId: "d",
                platform: "symbian",
            }),
        "unknown platform must be rejected",
    );
    ok("registerDevice enforces token length and platform enum");

    // FCM caps data at 4KB; we cap pair count well below it.
    const tooMuchData = Object.fromEntries(
        Array.from({ length: 11 }, (_, i) => [`k${i}`, "v"]),
    );
    await assert.rejects(
        () => sendToUserSchema.parseAsync({ userId: 1, title: "t", body: "b", data: tooMuchData }),
        "more than 10 data pairs must be rejected",
    );
    ok("data payload pair count is capped");

    await assert.rejects(
        () =>
            dispatchQuerySchema.parseAsync({
                startDate: "2026-02-01T00:00:00Z",
                endDate: "2026-01-01T00:00:00Z",
            }),
        "endDate before startDate must be rejected",
    );
    ok("dispatch query rejects inverted date range");
}

/**
 * The regression guard: Express 5 defines req.query as a getter-only prototype
 * property. `req.query = parsed` silently does nothing, so the endpoint would
 * receive raw strings with no defaults and paginate on NaN.
 */
function checkQueryValidationApplies(): Promise<void> {
    return new Promise((resolve, reject) => {
        const app = express();
        app.get(
            "/history",
            validateZod(dispatchQuerySchema, "query"),
            (req, res) => {
                res.json(req.query);
            },
        );
        // Stands in for the app's global error handler; without it Express logs
        // the expected 400 rejection to stderr as if it were a crash.
        app.use((err: any, _req: any, res: any, _next: any) => {
            res.status(err?.statusCode ?? 400).json({ success: false, error: err?.message });
        });

        const server = app.listen(0, async () => {
            try {
                const port = (server.address() as import("net").AddressInfo).port;

                const res = await fetch(`http://localhost:${port}/history?page=3`);
                const body: any = await res.json();

                assert.strictEqual(res.status, 200);
                assert.strictEqual(body.page, 3, "page must be coerced to a number, not left as '3'");
                assert.strictEqual(body.limit, 20, "limit default must survive onto req.query");
                ok("validateZod writes parsed values onto Express 5 req.query");

                const bad = await fetch(`http://localhost:${port}/history?limit=999`);
                assert.strictEqual(bad.status, 400, "limit over max must be rejected");
                ok("validateZod still rejects out-of-range query params");

                resolve();
            } catch (error) {
                reject(error);
            } finally {
                server.close();
            }
        });
    });
}

/**
 * The push limiters key on req.user/req.vendor, which only exist after an auth
 * middleware has run. If a route ever lists the limiter BEFORE its auth
 * middleware, keyGenerator silently falls back to IP and every account behind
 * one NAT shares a bucket — no error, no log, just wrong. This asserts the
 * real router's ordering.
 */
function checkLimiterRunsAfterAuth() {
    const src = readFileSync(join(__dirname, "../routes/notification.routes.ts"), "utf8");

    // Each route registration = one call block ending in ");"
    const blocks = src.split(/notificationRoutes\.(?:get|post|patch|delete)\(/).slice(1);
    let checked = 0;

    for (const block of blocks) {
        const body = block.split(/\n\);/)[0];
        const limiterAt = body.search(/\b\w*Limiter\b/);
        if (limiterAt === -1) continue; // route has no limiter
        const authAt = body.search(/\b(combinedAuthMiddleware|authMiddleware)\b/);
        assert.notStrictEqual(authAt, -1, "a limited route must also be authenticated");
        const path = (body.match(/"([^"]+)"/) ?? [])[1];
        assert.ok(
            authAt < limiterAt,
            `${path}: auth middleware must come BEFORE the rate limiter, else it keys by IP`,
        );
        checked++;
    }

    assert.ok(checked >= 6, `expected to check at least 6 limited routes, saw ${checked}`);
    ok(`all ${checked} rate-limited routes run auth before the limiter`);
}

(async () => {
    console.log("fcm self-check");
    await checkSchemas();
    await checkQueryValidationApplies();
    checkLimiterRunsAfterAuth();
    console.log("\nall checks passed");
})().catch((error) => {
    console.error("\nFAILED:", error.message);
    process.exit(1);
});
