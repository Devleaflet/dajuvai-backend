import { describe, expect, it } from "vitest";

import { webhookEventId } from "./webhook-dedupe.service";

/**
 * The id is the whole guard: it decides which deliveries are "the same event".
 * Too loose and a genuine state change is dropped; too tight and every retry
 * looks new and is processed again.
 */
describe("webhookEventId", () => {
    it("treats an exact repeat as the same event", () => {
        const first = webhookEventId({
            merchantTxnId: "TXN_1789_abc",
            status: "Success",
            gatewayTxnId: "100010911912",
        });
        const retry = webhookEventId({
            merchantTxnId: "TXN_1789_abc",
            status: "Success",
            gatewayTxnId: "100010911912",
        });

        expect(first).toBe(retry);
    });

    it("is case-insensitive about the status the gateway spells differently", () => {
        expect(webhookEventId({ merchantTxnId: "TXN_1", status: "success" })).toBe(
            webhookEventId({ merchantTxnId: "TXN_1", status: "SUCCESS" }),
        );
    });

    it("treats a different outcome for the same transaction as a new event", () => {
        // Pending then success is a real state change and must be processed.
        const pending = webhookEventId({ merchantTxnId: "TXN_1", status: "Pending" });
        const success = webhookEventId({ merchantTxnId: "TXN_1", status: "Success" });

        expect(pending).not.toBe(success);
    });

    it("separates two gateway attempts against one merchant transaction", () => {
        const first = webhookEventId({
            merchantTxnId: "TXN_1",
            status: "Failed",
            gatewayTxnId: "GW-1",
        });
        const second = webhookEventId({
            merchantTxnId: "TXN_1",
            status: "Failed",
            gatewayTxnId: "GW-2",
        });

        expect(first).not.toBe(second);
    });

    it("never exceeds the column's length", () => {
        const id = webhookEventId({
            merchantTxnId: "T".repeat(300),
            status: "SUCCESS",
            gatewayTxnId: "G".repeat(300),
        });

        expect(id.length).toBeLessThanOrEqual(191);
    });

    it("keeps a missing status distinguishable rather than blank", () => {
        expect(webhookEventId({ merchantTxnId: "TXN_1" })).toContain("UNKNOWN");
    });
});
