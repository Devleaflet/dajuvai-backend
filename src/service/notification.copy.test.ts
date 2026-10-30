import { describe, expect, it } from "vitest";

import { readableNotificationMessage } from "./notification.service";

/**
 * Status notifications stored before the copy was rewritten end in a raw
 * enum ("status updated to ASSIGNED_TO_RIDER"); they are read in the words
 * new ones are written in.
 */
describe("readableNotificationMessage", () => {
    it("rewords a stored raw status", () => {
        expect(readableNotificationMessage("Order #DJV-53434BAC-ADAA status updated to ASSIGNED_TO_RIDER")).toBe(
            "Order #DJV-53434BAC-ADAA is now out for delivery.",
        );
        expect(readableNotificationMessage("Order #12 status updated to ARRIVED_AT_WAREHOUSE")).toBe(
            "Order #12 is now at our warehouse.",
        );
        expect(readableNotificationMessage("Order #12 status updated to CONFIRMED")).toBe("Order #12 is now confirmed.");
    });

    it("leaves every other message alone", () => {
        expect(readableNotificationMessage("Order #12 is now confirmed.")).toBe("Order #12 is now confirmed.");
        expect(readableNotificationMessage("50% off today only")).toBe("50% off today only");
        expect(readableNotificationMessage(null)).toBeNull();
    });
});
