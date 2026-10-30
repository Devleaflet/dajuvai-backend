import { describe, expect, it, vi } from "vitest";

const repos = vi.hoisted(() => ({
    users: [{ id: 1, fullName: "QA Admin", email: "admin@example.com" }],
    vendors: [{ id: 1, businessName: "QA Store One", email: "store@example.com" }],
}));
vi.mock("../config/db.config", () => ({
    default: {
        getRepository: (entity: { name: string }) => ({
            find: vi.fn(async () => (entity.name === "Vendor" ? repos.vendors : repos.users)),
        }),
    },
}));

import { AuditService } from "./audit.service";
import { AuditActorType } from "../entities/auditLog.entity";

// QA NEW-2: admin user 1 was shown as vendor 1 ("QA Store One") because the
// actor lookup ignored the actor's type and vendors won on a shared id.
describe("audit log actors", () => {
    it("names each actor from its own kind of account, even when ids collide", async () => {
        const service = new AuditService() as any;
        const [admin, vendor] = await service.resolveActors([
            { id: 1, actorType: AuditActorType.ADMIN, actorId: 1 },
            { id: 2, actorType: AuditActorType.VENDOR, actorId: 1 },
        ]);

        expect(admin.actor.name).toBe("QA Admin");
        expect(admin.actor.email).toBe("admin@example.com");
        expect(vendor.actor.name).toBe("QA Store One");
    });
});
