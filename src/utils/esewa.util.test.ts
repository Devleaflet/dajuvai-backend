import { describe, expect, it } from "vitest";
import { decodeEsewaReturn, esewaSignature, sameAmount, verifyEsewaReturn } from "./esewa.util";

const SECRET = "test-secret";
const SIGNED = "transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names";

/** Builds a return token the way eSewa does: signature over the raw text of each signed field. */
function esewaToken(values: Record<string, string>, rawAmount: string, secret = SECRET): string {
    const all: Record<string, string> = { ...values, signed_field_names: SIGNED };
    const message = SIGNED.split(",")
        .map((k) => `${k}=${k === "total_amount" ? rawAmount.replace(/"/g, "") : all[k]}`)
        .join(",");
    const json =
        `{"transaction_code":"${all.transaction_code}","status":"${all.status}",` +
        `"total_amount":${rawAmount},"transaction_uuid":"${all.transaction_uuid}",` +
        `"product_code":"${all.product_code}","signed_field_names":"${SIGNED}",` +
        `"signature":"${esewaSignature(message, secret)}"}`;
    return Buffer.from(json).toString("base64");
}

const genuine = {
    transaction_code: "000AWEO",
    status: "COMPLETE",
    transaction_uuid: "4f1c2a9e-uuid",
    product_code: "NP-ES-DAJUVAI",
};

describe("eSewa return verification", () => {
    it("accepts a genuine payload, including an amount JSON.parse would reformat", () => {
        const payload = decodeEsewaReturn(esewaToken(genuine, "1000.0"));
        expect(payload).not.toBeNull();
        expect(verifyEsewaReturn(payload!, SECRET)).toBe(true);
        expect(payload!.totalAmount).toBe(1000);
        expect(payload!.transactionUuid).toBe("4f1c2a9e-uuid");
    });

    it("accepts a quoted amount with thousands separators", () => {
        const payload = decodeEsewaReturn(esewaToken(genuine, '"1,250.5"'))!;
        expect(verifyEsewaReturn(payload, SECRET)).toBe(true);
        expect(payload.totalAmount).toBe(1250.5);
    });

    it("rejects a forged payload with no signature", () => {
        const forged = Buffer.from('{"status":"COMPLETE","transaction_uuid":"x"}').toString("base64");
        expect(decodeEsewaReturn(forged)).toBeNull();
    });

    it("rejects a payload signed with another secret", () => {
        const payload = decodeEsewaReturn(esewaToken(genuine, "1000.0", "attacker"))!;
        expect(verifyEsewaReturn(payload, SECRET)).toBe(false);
    });

    it("rejects a tampered amount", () => {
        const token = esewaToken(genuine, "10.0");
        const tampered = Buffer.from(
            Buffer.from(token, "base64").toString("utf8").replace('"total_amount":10.0', '"total_amount":9999.0'),
        ).toString("base64");
        expect(verifyEsewaReturn(decodeEsewaReturn(tampered)!, SECRET)).toBe(false);
    });

    it("rejects junk and an empty secret", () => {
        expect(decodeEsewaReturn("not base64 json")).toBeNull();
        expect(verifyEsewaReturn(decodeEsewaReturn(esewaToken(genuine, "1.0"))!, "")).toBe(false);
    });
});

describe("sameAmount", () => {
    it("compares in paisa", () => {
        expect(sameAmount(1000, "1,000.0")).toBe(true);
        expect(sameAmount(0.1 + 0.2, 0.3)).toBe(true);
        expect(sameAmount(999.5, 999.49)).toBe(false);
        expect(sameAmount("abc", "abc")).toBe(false);
    });
});
