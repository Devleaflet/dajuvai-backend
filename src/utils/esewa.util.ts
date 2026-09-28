import crypto from "crypto";

/**
 * eSewa ePay v2 return payload, as found base64-encoded in the `data` query
 * parameter of the success redirect.
 *
 * Values are kept as the exact text eSewa sent, because the signature is over
 * that text: `JSON.parse` turns `"total_amount":1000.0` into `1000`, and a
 * signature recomputed from `1000` no longer matches.
 */
export interface EsewaReturn {
    fields: Record<string, string>;
    status: string;
    transactionUuid: string;
    productCode: string;
    totalAmount: number;
}

const FIELD = (key: string) =>
    new RegExp(`"${key}"\\s*:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|([^,}\\s]+))`);

function rawField(json: string, key: string): string | undefined {
    const match = FIELD(key).exec(json);
    if (!match) return undefined;
    return match[1] ?? match[2];
}

/** Parses the redirect token, or returns null when it is not an eSewa payload at all. */
export function decodeEsewaReturn(token: string): EsewaReturn | null {
    let json: string;
    try {
        json = Buffer.from(token, "base64").toString("utf8");
        JSON.parse(json);
    } catch {
        return null;
    }

    const signedFieldNames = rawField(json, "signed_field_names");
    const signature = rawField(json, "signature");
    if (!signedFieldNames || !signature) return null;

    const fields: Record<string, string> = { signature };
    for (const name of signedFieldNames.split(",")) {
        const value = rawField(json, name.trim());
        if (value === undefined) return null;
        fields[name.trim()] = value;
    }

    return {
        fields,
        status: fields.status ?? "",
        transactionUuid: fields.transaction_uuid ?? "",
        productCode: fields.product_code ?? "",
        totalAmount: parseEsewaAmount(fields.total_amount),
    };
}

/** eSewa formats amounts with thousands separators ("1,000.0"). */
export function parseEsewaAmount(value: string | undefined): number {
    if (value === undefined) return NaN;
    return Number(value.replace(/,/g, ""));
}

export function esewaSignature(message: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(message).digest("base64");
}

/**
 * True only when the payload was signed with our merchant secret over the
 * fields it names. Anyone can base64-encode `{"status":"COMPLETE"}`; only
 * eSewa can sign it.
 */
export function verifyEsewaReturn(payload: EsewaReturn, secret: string): boolean {
    if (!secret) return false;
    const names = payload.fields.signed_field_names.split(",").map((n) => n.trim());
    const message = names.map((name) => `${name}=${payload.fields[name]}`).join(",");

    const expected = Buffer.from(esewaSignature(message, secret));
    const received = Buffer.from(payload.fields.signature);
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

/** Money is compared in paisa so 1000 and "1,000.0" agree and float noise does not. */
export function sameAmount(a: number | string, b: number | string): boolean {
    const toPaisa = (v: number | string) => Math.round(Number(String(v).replace(/,/g, "")) * 100);
    const left = toPaisa(a);
    return Number.isFinite(left) && left === toPaisa(b);
}
