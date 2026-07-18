/**
 * Integration check for the device-token layer against a real Postgres.
 *
 *   npx ts-node src/scripts/fcm.dbcheck.ts
 *
 * Exercises the flows that only break against a real database: the unique
 * constraint on fcmToken, token hand-off between accounts, and the raw-SQL
 * aggregates in getStats().
 *
 * Every row it writes uses the `dbcheck-` deviceId prefix and is deleted in a
 * finally block, so it is safe to run against a populated database.
 */
import AppDataSource from "../config/db.config";
import { DeviceToken, DevicePlatform } from "../entities/deviceToken.entity";
import { deviceTokenService } from "../service/deviceToken.service";
import { User, UserRole } from "../entities/user.entity";
import assert from "assert";

const PREFIX = "dbcheck-";
const TOKEN_A = "dbcheck-token-aaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "dbcheck-token-bbbbbbbbbbbbbbbbbbbbbbbb";

const ok = (m: string) => console.log(`  ok - ${m}`);
const fail = (m: string, e: unknown) =>
    console.log(`  FAIL - ${m}\n         ${e instanceof Error ? e.message.split("\n")[0] : e}`);

async function cleanup() {
    // Raw query rather than the DeleteQueryBuilder: `.from(Entity)` blows up with
    // "this.subQuery is not a function" on this TypeORM version.
    await AppDataSource.query(`DELETE FROM device_tokens WHERE "deviceId" LIKE $1`, [`${PREFIX}%`]);
    await AppDataSource.query(`DELETE FROM notifications WHERE title LIKE $1`, [`${PREFIX}%`]);
}

(async () => {
    await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(DeviceToken);
    let failures = 0;

    // Two real user ids to attach to (FKs are enforced).
    const users = await AppDataSource.getRepository(User).find({
        where: { role: UserRole.USER },
        select: { id: true },
        take: 2,
    });
    if (users.length < 2) {
        console.log("need at least 2 users in the DB to run this check");
        process.exit(1);
    }
    const [u1, u2] = users.map((u) => u.id);
    console.log(`fcm db-check (using userIds ${u1}, ${u2})\n`);

    await cleanup();

    try {
        // ── 1. plain register ────────────────────────────────────────────────
        await deviceTokenService.registerOrUpdate("user", u1, {
            fcmToken: TOKEN_A,
            deviceId: `${PREFIX}dev-1`,
            platform: DevicePlatform.ANDROID,
        });
        const t1 = await deviceTokenService.getTokensForUser(u1);
        assert.deepStrictEqual(t1, [TOKEN_A]);
        ok("register creates an active token");

        // ── 2. same device, refreshed token -> UPDATE not duplicate ──────────
        await deviceTokenService.registerOrUpdate("user", u1, {
            fcmToken: TOKEN_B,
            deviceId: `${PREFIX}dev-1`,
            platform: DevicePlatform.ANDROID,
        });
        const rows = await repo.find({ where: { userId: u1 } });
        const mine = rows.filter((r) => r.deviceId === `${PREFIX}dev-1`);
        assert.strictEqual(mine.length, 1, "token refresh must not create a second row");
        assert.strictEqual(mine[0].fcmToken, TOKEN_B);
        ok("token refresh updates the existing device row");

        // ── 3. THE BIG ONE: same phone, different user (logout -> login) ─────
        // The old owner's row still physically holds the token, and fcmToken is
        // UNIQUE, so inserting the new owner's row can collide.
        try {
            await deviceTokenService.registerOrUpdate("user", u2, {
                fcmToken: TOKEN_B,
                deviceId: `${PREFIX}dev-1`,
                platform: DevicePlatform.ANDROID,
            });
            const forU2 = await deviceTokenService.getTokensForUser(u2);
            const forU1 = await deviceTokenService.getTokensForUser(u1);
            assert.deepStrictEqual(forU2, [TOKEN_B], "new owner should now hold the token");
            assert.deepStrictEqual(forU1, [], "old owner must no longer receive push");
            ok("token hand-off between users on the same phone");
        } catch (e) {
            failures++;
            fail("token hand-off between users on the same phone", e);
        }

        // ── 4. same user moves token to a new deviceId ───────────────────────
        try {
            await deviceTokenService.registerOrUpdate("user", u2, {
                fcmToken: TOKEN_B,
                deviceId: `${PREFIX}dev-2`,
                platform: DevicePlatform.IOS,
            });
            const active = await repo.find({ where: { userId: u2, isActive: true } });
            assert.strictEqual(active.length, 1, "only the newest device should stay active");
            assert.strictEqual(active[0].deviceId, `${PREFIX}dev-2`);
            ok("same token moving to a new deviceId");
        } catch (e) {
            failures++;
            fail("same token moving to a new deviceId", e);
        }

        // ── 5. multi-device: one user, two phones, two tokens ────────────────
        try {
            await deviceTokenService.registerOrUpdate("user", u1, {
                fcmToken: `${PREFIX}multi-1-xxxxxxxxxxxxxxxx`,
                deviceId: `${PREFIX}phone`,
                platform: DevicePlatform.ANDROID,
            });
            await deviceTokenService.registerOrUpdate("user", u1, {
                fcmToken: `${PREFIX}multi-2-xxxxxxxxxxxxxxxx`,
                deviceId: `${PREFIX}tablet`,
                platform: DevicePlatform.ANDROID,
            });
            const t = await deviceTokenService.getTokensForUser(u1);
            assert.strictEqual(t.length, 2, `expected 2 devices, got ${t.length}`);
            ok("one user, two devices, both receive");
        } catch (e) {
            failures++;
            fail("one user, two devices", e);
        }

        // ── 6. deactivate on logout ──────────────────────────────────────────
        try {
            const removed = await deviceTokenService.deactivateDevice("user", u1, `${PREFIX}phone`);
            assert.strictEqual(removed, true);
            const t = await deviceTokenService.getTokensForUser(u1);
            assert.strictEqual(t.length, 1, "only the logged-out device should stop");
            ok("logout deactivates exactly one device");
        } catch (e) {
            failures++;
            fail("logout deactivates one device", e);
        }

        // ── 7. getStats raw SQL actually runs (camelCase columns in Postgres) ─
        try {
            const stats = await deviceTokenService.getStats();
            assert.ok(typeof stats.total === "number", "total must be a number");
            ok(`getStats runs (total=${stats.total}, android=${stats.android})`);
        } catch (e) {
            failures++;
            fail("deviceTokenService.getStats", e);
        }

        // ── 8. push.service getStats — the SUM() raw expressions ─────────────
        try {
            const { pushService } = await import("../service/push.service");
            const s = await pushService.getStats();
            assert.ok(typeof s.delivery.successRate === "number");
            ok(`pushService.getStats runs (successRate=${s.delivery.successRate})`);
        } catch (e) {
            failures++;
            fail("pushService.getStats", e);
        }

        // ── 9. getHistory pagination ─────────────────────────────────────────
        try {
            const { pushService } = await import("../service/push.service");
            const h = await pushService.getHistory({ page: 1, limit: 10 } as any);
            assert.ok(Array.isArray(h.data));
            assert.strictEqual(h.page, 1);
            ok(`getHistory runs (total=${h.total}, totalPages=${h.totalPages})`);
        } catch (e) {
            failures++;
            fail("pushService.getHistory", e);
        }
        // ── 10. IDOR: one user must not read another's notification ──────────
        try {
            const { NotificationService } = await import("../service/notification.service");
            const { Notification, NotificationTarget, NotificationType } = await import(
                "../entities/notification.entity"
            );
            const svc = new NotificationService();
            const nRepo = AppDataSource.getRepository(Notification);
            const userRepo = AppDataSource.getRepository(User);

            const saved = await nRepo.save(
                nRepo.create({
                    title: `${PREFIX}idor`,
                    message: "private to u1",
                    type: NotificationType.GENERAL,
                    target: NotificationTarget.USER,
                    createdById: u1,
                }),
            );

            const owner = await userRepo.findOneBy({ id: u1 });
            const other = await userRepo.findOneBy({ id: u2 });

            assert.strictEqual(svc.canAccess(saved, owner!), true, "owner must be able to read it");
            assert.strictEqual(
                svc.canAccess(saved, other!),
                false,
                "a different user MUST NOT read it",
            );

            await nRepo.delete(saved.id);
            ok("IDOR: other users cannot read someone else's notification");
        } catch (e) {
            failures++;
            fail("IDOR ownership check", e);
        }

        // ── 11. CHECK constraint: a row cannot belong to user AND vendor ─────
        try {
            await AppDataSource.query(
                `INSERT INTO device_tokens ("userId","vendorId","fcmToken","deviceId","platform")
                 VALUES ($1,$2,$3,$4,'android')`,
                [u1, 1, `${PREFIX}both-owners-xxxxxxxxxxxx`, `${PREFIX}both`],
            );
            failures++;
            fail("CHECK constraint", new Error("DB accepted a row owned by BOTH user and vendor"));
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("CHK_device_tokens_one_owner")) {
                ok("CHECK constraint rejects a row owned by both user and vendor");
            } else {
                failures++;
                fail("CHECK constraint (unexpected error)", e);
            }
        }
    } finally {
        await cleanup();
        await AppDataSource.destroy();
    }

    console.log(failures === 0 ? "\nall db checks passed" : `\n${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
})();
