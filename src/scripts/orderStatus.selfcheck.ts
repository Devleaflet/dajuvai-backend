/**
 * Self-check for the unified order-status permission matrix. No DB, no
 * network, no test framework.
 *
 *   npx ts-node src/scripts/orderStatus.selfcheck.ts
 *
 * Covers canTransition()'s 3 actor roles and the updateOrderStatusSchema's
 * now-required reason field — the two places a bug here would silently
 * let an unauthorized status change through, or silently accept a
 * status change with no audit reason.
 */
import assert from "assert";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { canTransition } from "../constants/orderStatus.constants";
import { OrderStatus } from "../entities/order.entity";
import { updateOrderStatusSchema } from "../utils/zod_validations/order.zod";

const ok = (name: string) => console.log(`  ok - ${name}`);

function checkAdminIsFreeForm() {
    // Every (from, to) pair where from !== to must be allowed for ADMIN —
    // that's the entire point of the free-form redesign.
    const statuses = Object.values(OrderStatus);
    let checked = 0;
    for (const from of statuses) {
        for (const to of statuses) {
            if (from === to) continue;
            assert.ok(
                canTransition("ADMIN", from, to),
                `admin must be able to move ${from} -> ${to}`,
            );
            checked++;
        }
    }
    assert.strictEqual(checked, statuses.length * (statuses.length - 1));
    ok(`admin can move between all ${checked} (from, to) pairs`);
}

function checkSystemIsFreeForm() {
    assert.ok(
        canTransition("SYSTEM", OrderStatus.CREATED, OrderStatus.CANCELLED),
        "system must be free-form too (internal webhook transitions)",
    );
    ok("system role is free-form");
}

function checkRiderIsRestrictedToTwoMoves() {
    assert.ok(
        canTransition("RIDER", OrderStatus.ASSIGNED_TO_RIDER, OrderStatus.DELIVERED),
        "rider must be able to mark DELIVERED",
    );
    assert.ok(
        canTransition("RIDER", OrderStatus.ASSIGNED_TO_RIDER, OrderStatus.NOT_RECEIVED),
        "rider must be able to mark NOT_RECEIVED",
    );

    const statuses = Object.values(OrderStatus);
    let disallowed = 0;
    for (const from of statuses) {
        for (const to of statuses) {
            if (from === to) continue;
            const isOneOfTheTwoAllowedMoves =
                from === OrderStatus.ASSIGNED_TO_RIDER &&
                (to === OrderStatus.DELIVERED || to === OrderStatus.NOT_RECEIVED);
            if (isOneOfTheTwoAllowedMoves) continue;

            assert.strictEqual(
                canTransition("RIDER", from, to),
                false,
                `rider must NOT be able to move ${from} -> ${to}`,
            );
            disallowed++;
        }
    }
    assert.ok(disallowed > 0);
    ok(`rider is blocked on all ${disallowed} other (from, to) pairs`);
}

async function checkReasonIsRequired() {
    await assert.rejects(
        () =>
            updateOrderStatusSchema.parseAsync({
                status: "CANCELLED",
                reason: "",
            }),
        "empty reason must be rejected",
    );
    await assert.rejects(
        () => updateOrderStatusSchema.parseAsync({ status: "CANCELLED" }),
        "missing reason must be rejected",
    );
    const parsed = await updateOrderStatusSchema.parseAsync({
        status: "CANCELLED",
        reason: "Customer requested cancellation",
    });
    assert.strictEqual(parsed.reason, "Customer requested cancellation");
    ok("updateOrderStatusSchema requires a non-empty reason");
}

/**
 * Regression guard: removed enum members must not silently creep back in
 * via a copy-pasted string literal anywhere in src/.
 */
function checkNoStaleEnumReferences() {
    // Word-boundary regex, not a plain substring check — "VendorOrderStatus"
    // is also a substring of the legitimate getVendorOrderStatusHistory
    // (added by this same overhaul), which a naive .includes() would
    // wrongly flag.
    const staleTokens = [
        /\bOrderStatus\.PENDING\b/,
        /\bOrderStatus\.SHIPPED\b/,
        /\bVendorOrderStatus\b/,
    ];
    const srcDir = join(__dirname, "..");
    let filesChecked = 0;

    const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            // Migrations are historical, immutable records — old ones
            // legitimately reference removed types by name in comments
            // describing what they did at the time.
            if (entry.isDirectory() && entry.name === "migrations") continue;

            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            if (!entry.name.endsWith(".ts")) continue;
            // Skip this file itself — its own stale-token list literally
            // contains the strings it's searching for.
            if (entry.name === "orderStatus.selfcheck.ts") continue;
            const content = readFileSync(full, "utf8");
            for (const token of staleTokens) {
                assert.ok(
                    !token.test(content),
                    `${full} still references removed ${token}`,
                );
            }
            filesChecked++;
        }
    };

    walk(srcDir);
    assert.ok(filesChecked > 50, `expected to scan >50 files, saw ${filesChecked}`);
    ok(`no stale enum references across ${filesChecked} source files`);
}

(async () => {
    console.log("order status self-check");
    checkAdminIsFreeForm();
    checkSystemIsFreeForm();
    checkRiderIsRestrictedToTwoMoves();
    await checkReasonIsRequired();
    checkNoStaleEnumReferences();
    console.log("\nall checks passed");
})().catch((error) => {
    console.error("\nFAILED:", error.message);
    process.exit(1);
});
