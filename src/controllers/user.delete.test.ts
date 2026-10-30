import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ findOneBy: vi.fn(), remove: vi.fn() }));
const finalizeUserDeletion = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../config/db.config", () => ({ default: { getRepository: () => repo } }));
vi.mock("../service/user-deletion.service", () => ({
    UserDeletionService: class {
        finalizeUserDeletion = finalizeUserDeletion;
    },
}));

import { UserController } from "./user.controller";

function fakeResponse() {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
}

/** DELETE /api/auth/:id — the console's "delete customer" action. */
describe("deleteUserHandler", () => {
    beforeEach(() => vi.clearAllMocks());

    it.each(["admin", "staff", "rider"])("refuses to delete a %s account", async (role) => {
        repo.findOneBy.mockResolvedValue({ id: 9, role });
        const res = fakeResponse();

        await new UserController().deleteUserHandler({ params: { id: "9" } } as any, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(repo.remove).not.toHaveBeenCalled();
        expect(finalizeUserDeletion).not.toHaveBeenCalled();
    });

    it("anonymises a customer through the normal finalisation instead of removing the row", async () => {
        repo.findOneBy.mockResolvedValue({ id: 7, role: "user" });
        const res = fakeResponse();

        await new UserController().deleteUserHandler({ params: { id: "7" } } as any, res);

        expect(finalizeUserDeletion).toHaveBeenCalledWith(7);
        expect(repo.remove).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });
});
