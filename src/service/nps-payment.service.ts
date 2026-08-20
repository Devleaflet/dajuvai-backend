import crypto from "crypto";
import axios from "axios";
import config from "../config/env.config";

/**
 * Shared Nepal Payment System (NPS / NPX) gateway configuration and helpers.
 * Used by both the payment proxy routes and the order service (draft
 * settlement needs to query the gateway directly).
 */
export const NPS_CONFIG = {
    MERCHANT_ID: config.NPX_MERCHANT_ID,
    MERCHANT_NAME: config.NPX_MERCHANT_NAME,
    API_USERNAME: config.NPX_API_USERNAME,
    API_PASSWORD: config.NPX_API_PASSWORD,
    SECRET_KEY: config.NPX_SECRET_KEY,
    BASE_URL: config.NPX_BASE_URL,
    GATEWAY_URL: config.NPS_GATEWAY_URL,
};

/** Generate HMAC SHA512 signature over sorted-key concatenated values. */
export function generateNpsSignature(
    data: Record<string, string>,
    secretKey: string,
): string {
    const sortedKeys = Object.keys(data).sort();
    const concatenatedValues = sortedKeys.map((key) => data[key]).join("");
    const hmac = crypto.createHmac("sha512", secretKey);
    hmac.update(concatenatedValues, "utf8");
    return hmac.digest("hex");
}

/** Generate Basic auth header for NPS API calls. */
export function getNpsAuthHeader(): string {
    const credentials = Buffer.from(
        `${NPS_CONFIG.API_USERNAME}:${NPS_CONFIG.API_PASSWORD}`,
    ).toString("base64");
    return `Basic ${credentials}`;
}

/** Normalized gateway transaction status. */
export type NpsTransactionStatus = "Success" | "Failed" | "Pending" | "Unknown";

export class NpsPaymentService {
    /**
     * Query the gateway for the definitive status of a transaction.
     * Never throws — network/API failures resolve to "Unknown" so callers
     * can safely keep polling instead of crashing payment callbacks.
     */
    async checkTransactionStatus(
        merchantTxnId: string,
    ): Promise<{ status: NpsTransactionStatus; raw: any }> {
        try {
            const requestData: Record<string, string> = {
                MerchantId: NPS_CONFIG.MERCHANT_ID,
                MerchantName: NPS_CONFIG.MERCHANT_NAME,
                MerchantTxnId: merchantTxnId,
            };

            requestData.Signature = generateNpsSignature(
                requestData,
                NPS_CONFIG.SECRET_KEY,
            );

            const response = await axios.post(
                `${NPS_CONFIG.BASE_URL}/CheckTransactionStatus`,
                requestData,
                {
                    headers: {
                        Authorization: getNpsAuthHeader(),
                        "Content-Type": "application/json",
                    },
                    timeout: 15000,
                },
            );

            const raw = response.data;
            const rawStatus = String(raw?.data?.Status ?? "").toLowerCase();

            let status: NpsTransactionStatus = "Unknown";
            if (rawStatus === "success") {
                status = "Success";
            } else if (
                ["failed", "failure", "cancelled", "canceled", "declined"].includes(
                    rawStatus,
                )
            ) {
                status = "Failed";
            } else if (
                ["pending", "processing", "initiated", "inprogress"].includes(
                    rawStatus,
                )
            ) {
                status = "Pending";
            }

            return { status, raw };
        } catch (error) {
            console.error(
                `[NPS] CheckTransactionStatus failed for ${merchantTxnId}:`,
                error instanceof Error ? error.message : error,
            );
            return { status: "Unknown", raw: null };
        }
    }
}
