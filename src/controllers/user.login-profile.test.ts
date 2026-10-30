import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

const { findUserByEmailLogin } = vi.hoisted(() => ({ findUserByEmailLogin: vi.fn() }));
vi.mock("../service/user.service", async (orig) => ({
    ...(await orig<typeof import("../service/user.service")>()),
    findUserByEmailLogin,
}));
vi.mock("../config/env.config", async (orig) => {
    const real = (await orig<{ default: Record<string, unknown> }>()).default;
    return { default: { ...real, JWT_REFRESH_SECRET: "test-refresh" } };
});

import { UserController } from "./user.controller";

/**
 * Signing in answers with the shopper's name and picture, as /me does. The
 * storefront header greets them from this reply; without the name it showed
 * the first letter of their email until the page was reloaded.
 */
function fakeResponse() {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    res.cookie = vi.fn(() => res);
    return res;
}

describe("UserController.login", () => {
    it("answers with the shopper's name and picture", async () => {
        findUserByEmailLogin.mockResolvedValue({
            id: 194,
            email: "asha@example.com",
            role: "user",
            provider: "local",
            isVerified: true,
            password: bcrypt.hashSync("Right#Pass1", 4),
            username: "Asha QA",
            profilePicture: "https://example.com/asha.jpg",
        });
        const controller = Object.create(UserController.prototype) as any;
        controller.jwtSecret = "test-access";
        const res = fakeResponse();

        await controller.login({ body: { email: "asha@example.com", password: "Right#Pass1" } }, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].data).toMatchObject({
            userId: 194,
            username: "Asha QA",
            profilePicture: "https://example.com/asha.jpg",
        });
    });
});
