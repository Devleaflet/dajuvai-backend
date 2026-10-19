import { describe, expect, it } from "vitest";
import { BroadcastStatus } from "../entities/broadcast.entity";
import {
    actionProblem,
    actionUrl,
    isPermanentEmailError,
    renderBroadcastEmail,
    settledStatus,
    signUnsubscribeToken,
    verifyUnsubscribeToken,
} from "./broadcast.utils";
import { createBroadcastSchema, sendBroadcastSchema } from "./zod_validations/broadcast.zod";

const base = {
    name: "Dashain sale",
    audienceType: "ALL_USERS",
    channels: ["IN_APP"],
    title: "Big sale",
    body: "Up to 50% off",
};

describe("broadcast actions", () => {
    it("requires a target for product and store actions, and a real link for URLs", () => {
        expect(actionProblem("NONE", null)).toBeNull();
        expect(actionProblem("OPEN_DEALS", null)).toBeNull();
        expect(actionProblem("OPEN_PRODUCT", " ")).not.toBeNull();
        expect(actionProblem("OPEN_STORE", "12")).toBeNull();
        expect(actionProblem("OPEN_URL", "https://dajuvai.com/sale")).toBeNull();
        expect(actionProblem("OPEN_URL", "javascript:alert(1)")).not.toBeNull();
        expect(actionProblem("OPEN_URL", "dajuvai.com")).not.toBeNull();
        expect(actionProblem("OPEN_ORDER", "5")).not.toBeNull();
    });

    it("links to the storefront's own paths", () => {
        expect(actionUrl("https://dajuvai.com/", "OPEN_PRODUCT", "42")).toBe("https://dajuvai.com/product/42");
        expect(actionUrl("https://dajuvai.com", "OPEN_STORE", "a b")).toBe("https://dajuvai.com/store/a%20b");
        expect(actionUrl("https://dajuvai.com", "OPEN_DEALS", null)).toBe("https://dajuvai.com/shop?hasDeal=true");
        expect(actionUrl("https://dajuvai.com", "OPEN_URL", "ftp://x")).toBeNull();
        expect(actionUrl("https://dajuvai.com", "NONE", "42")).toBeNull();
    });
});

describe("renderBroadcastEmail", () => {
    it("escapes everything an admin typed", () => {
        const html = renderBroadcastEmail(
            { title: "<b>Hi</b>", body: "<script>x()</script>\nline two", imageUrl: 'https://x/"a.png' },
            { appUrl: "https://dajuvai.com" },
        );
        expect(html).not.toContain("<script>");
        expect(html).not.toContain("<b>Hi</b>");
        expect(html).toContain("&lt;script&gt;");
        expect(html).toContain("&quot;a.png");
    });

    it("adds the action button and unsubscribe link only when there is one", () => {
        const plain = renderBroadcastEmail({ title: "t", body: "b" }, { appUrl: "https://d.com" });
        expect(plain).not.toContain("View product");
        expect(plain).not.toContain("Unsubscribe");
        const full = renderBroadcastEmail(
            { title: "t", body: "b", actionType: "OPEN_PRODUCT", actionValue: "7" },
            { appUrl: "https://d.com", unsubscribeUrl: "https://d.com/unsubscribe?t=x" },
        );
        expect(full).toContain('href="https://d.com/product/7"');
        expect(full).toContain('href="https://d.com/unsubscribe?t=x"');
    });
});

describe("settledStatus", () => {
    it("treats skips as expected, failures as partial, and reaching nobody as failed", () => {
        expect(settledStatus({ sent: 10, failed: 0 })).toBe(BroadcastStatus.COMPLETED);
        expect(settledStatus({ sent: 10, failed: 1 })).toBe(BroadcastStatus.PARTIALLY_COMPLETED);
        expect(settledStatus({ sent: 0, failed: 0 })).toBe(BroadcastStatus.FAILED);
        expect(settledStatus({ sent: 0, failed: 3 })).toBe(BroadcastStatus.FAILED);
    });
});

describe("isPermanentEmailError", () => {
    it("separates a bad address from a flaky server", () => {
        expect(isPermanentEmailError("550 5.1.1 The email account does not exist")).toBe(true);
        expect(isPermanentEmailError("Mailbox not found")).toBe(true);
        expect(isPermanentEmailError("421 Service not available, try again later")).toBe(false);
        expect(isPermanentEmailError("Connection timeout")).toBe(false);
    });
});

describe("unsubscribe tokens", () => {
    const secret = "test-secret";

    it("round-trips and rejects tampering", () => {
        const token = signUnsubscribeToken(secret, "vendor", 12);
        expect(verifyUnsubscribeToken(secret, token)).toEqual({ type: "vendor", id: 12 });
        expect(verifyUnsubscribeToken(secret, token.replace("vendor.12", "vendor.13"))).toBeNull();
        expect(verifyUnsubscribeToken(secret, token.replace("vendor", "user"))).toBeNull();
        expect(verifyUnsubscribeToken("other-secret", token)).toBeNull();
        expect(verifyUnsubscribeToken(secret, "garbage")).toBeNull();
        expect(verifyUnsubscribeToken("", token)).toBeNull();
    });
});

describe("createBroadcastSchema", () => {
    it("accepts a minimal broadcast and defaults the action", () => {
        const parsed = createBroadcastSchema.parse(base);
        expect(parsed.actionType).toBe("NONE");
    });

    it("needs recipients for a hand-picked audience, and dedupes them", () => {
        expect(createBroadcastSchema.safeParse({ ...base, audienceType: "SELECTED_USERS" }).success).toBe(false);
        const parsed = createBroadcastSchema.parse({ ...base, audienceType: "SELECTED_USERS", selectedUserIds: [3, 3, "4"] });
        expect(parsed.selectedUserIds).toEqual([3, 4]);
    });

    it("rejects duplicate channels, bad actions, OPEN_ORDER and non-https images", () => {
        expect(createBroadcastSchema.safeParse({ ...base, channels: ["FCM", "FCM"] }).success).toBe(false);
        expect(createBroadcastSchema.safeParse({ ...base, channels: [] }).success).toBe(false);
        expect(createBroadcastSchema.safeParse({ ...base, actionType: "OPEN_URL", actionValue: "nope" }).success).toBe(false);
        expect(createBroadcastSchema.safeParse({ ...base, actionType: "OPEN_ORDER", actionValue: "5" }).success).toBe(false);
        expect(createBroadcastSchema.safeParse({ ...base, imageUrl: "http://x.com/a.png" }).success).toBe(false);
        expect(createBroadcastSchema.safeParse({ ...base, imageUrl: "" }).success).toBe(true);
    });
});

describe("sendBroadcastSchema", () => {
    it("takes an ISO time with an offset, or nothing", () => {
        expect(sendBroadcastSchema.parse({}).scheduledAt).toBeUndefined();
        expect(sendBroadcastSchema.parse({ scheduledAt: "" }).scheduledAt).toBeNull();
        expect(sendBroadcastSchema.safeParse({ scheduledAt: "2026-10-01T10:00:00+05:45" }).success).toBe(true);
        expect(sendBroadcastSchema.safeParse({ scheduledAt: "tomorrow" }).success).toBe(false);
    });
});

describe("category actions", () => {
    it("link to the category page and the filtered shop", () => {
        expect(actionUrl("https://d.com", "OPEN_CATEGORY", "3")).toBe("https://d.com/category/3");
        expect(actionUrl("https://d.com", "OPEN_SUBCATEGORY", "9")).toBe("https://d.com/shop?subcategoryIds=9");
        expect(actionProblem("OPEN_CATEGORY", "")).not.toBeNull();
    });

    it("label the email button by what it opens", () => {
        const html = renderBroadcastEmail(
            { title: "t", body: "b", actionType: "OPEN_CATEGORY", actionValue: "3" },
            { appUrl: "https://d.com" },
        );
        expect(html).toContain("Browse the category");
    });
});
