import { getMetadataArgsStorage } from "typeorm";
import { describe, expect, it } from "vitest";
import { Broadcast, BroadcastRecipient } from "./broadcast.entity";

const column = (target: Function, name: string) =>
    getMetadataArgsStorage().columns.find((c) => c.target === target && c.propertyName === name)?.options;

// TypeORM's default enum name lowercases the column ("..._recipienttype_enum");
// migration 1785900000000 created the mixed-case names the worker casts to.
describe("broadcast enum columns", () => {
    it("name the types migration 1785900000000 created", () => {
        expect(column(BroadcastRecipient, "recipientType")?.enumName).toBe("broadcast_recipients_recipientType_enum");
        expect(column(Broadcast, "audienceType")?.enumName).toBe("broadcasts_audienceType_enum");
    });

    it("keep a failure reason on the broadcast", () => {
        expect(column(Broadcast, "failureReason")).toMatchObject({ type: "varchar", length: 300, nullable: true });
    });
});
