import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
    createUser: vi.fn(async (data: Record<string, unknown>) => ({ id: 41, ...data })),
    findUserByEmail: vi.fn(async () => null),
    setStaffPermissions: vi.fn(async () => undefined),
    findUserById: vi.fn(async () => ({ id: 41, role: "staff" })),
    updateStaffById: vi.fn(async (id: number, data: Record<string, unknown>) => ({ id, ...data })),
    updateStaffPermissions: vi.fn(async () => undefined),
}));

vi.mock("../service/user.service", () => service);

import { UserController } from "./user.controller";

function fakeResponse() {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
}

/**
 * Staff edits showed an empty phone field because the phone number never
 * reached the database: signup validated it and then dropped it.
 */
describe("staff account writes", () => {
    beforeEach(() => vi.clearAllMocks());

    it("persists the phone number given at signup", async () => {
        await new UserController().staffSignup(
            {
                body: {
                    email: "Zz-Test-Staff@Example.com",
                    password: "password123",
                    phoneNumber: "9800000000",
                    fullName: "Zz Test",
                    permissions: { order: 1 },
                },
            } as any,
            fakeResponse(),
        );

        expect(service.createUser).toHaveBeenCalledWith(
            expect.objectContaining({
                email: "zz-test-staff@example.com",
                phoneNumber: "9800000000",
            }),
        );
    });

    it("lowercases an edited email so the staff member can still sign in", async () => {
        await new UserController().updateStaff(
            { params: { id: "41" }, body: { email: "New@Example.com" } } as any,
            fakeResponse(),
        );

        expect(service.updateStaffById).toHaveBeenCalledWith(41, { email: "new@example.com" });
    });
});
