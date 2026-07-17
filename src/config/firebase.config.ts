import admin from "firebase-admin";
import config from "./env.config";
import logger from "../utils/logger";

/**
 * Initialises the Firebase Admin SDK once, from a base64-encoded service
 * account. Base64 keeps the key's embedded newlines intact through .env files
 * and dashboards that mangle multi-line values.
 *
 * Push is optional infrastructure: a missing credential logs loudly and leaves
 * push disabled rather than blocking startup, so local dev and unrelated
 * features keep working. A malformed credential is a different story — that is
 * a misconfiguration and throws.
 */
if (!admin.apps.length) {
    const base64 = config.FIREBASE_SERVICE_ACCOUNT_BASE64;

    if (!base64) {
        logger.warn(
            "[Firebase] FIREBASE_SERVICE_ACCOUNT_BASE64 not set — push notifications are DISABLED. " +
            "Sends will be recorded as failed.",
        );
    } else {
        let serviceAccount: admin.ServiceAccount & { project_id?: string };
        try {
            serviceAccount = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
        } catch (error) {
            logger.error("[Firebase] FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64-encoded JSON");
            throw error;
        }

        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

        // Device tokens are scoped to a single Firebase project: a token minted
        // by an app built against project A is rejected outright by project B.
        // Logging the project on every boot makes that mismatch obvious instead
        // of surfacing later as blanket "registration-token-not-registered".
        logger.info("[Firebase] Admin SDK initialized", {
            projectId: serviceAccount.project_id ?? serviceAccount.projectId,
            clientEmail: serviceAccount.clientEmail,
        });

        if (
            config.FIREBASE_PROJECT_ID &&
            config.FIREBASE_PROJECT_ID !== (serviceAccount.project_id ?? serviceAccount.projectId)
        ) {
            logger.error(
                "[Firebase] FIREBASE_PROJECT_ID does not match the service account's project. " +
                "One of them is wrong; device tokens will not resolve.",
                {
                    expected: config.FIREBASE_PROJECT_ID,
                    actual: serviceAccount.project_id ?? serviceAccount.projectId,
                },
            );
        }
    }
}

export default admin;
