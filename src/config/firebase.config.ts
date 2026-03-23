import admin from "firebase-admin";

if (!admin.apps.length) {
    const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!base64) {
        console.warn("[Firebase] FIREBASE_SERVICE_ACCOUNT_BASE64 env var not set. Push notifications disabled.");
    } else {
        const serviceAccount = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
        });
    }
}

export default admin;
