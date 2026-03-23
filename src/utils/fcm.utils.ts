import admin from "../config/firebase.config";

export async function sendPushNotification(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>
): Promise<void> {
    try {
        await admin.messaging().send({
            token,
            notification: { title, body },
            data: data ?? {},
            android: {
                priority: "high",
                notification: { sound: "default" },
            },
            apns: {
                payload: {
                    aps: { sound: "default" },
                },
            },
        });
    } catch (error) {
        console.error(`[FCM] Failed to send push to token ${token}:`, error);
    }
}

export async function sendPushToMultiple(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>
): Promise<void> {
    if (!tokens.length) return;

    const messages = tokens.map((token) => ({
        token,
        notification: { title, body },
        data: data ?? {},
        android: {
            priority: "high" as const,
            notification: { sound: "default" },
        },
        apns: {
            payload: {
                aps: { sound: "default" },
            },
        },
    }));

    try {
        const response = await admin.messaging().sendEach(messages);
        if (response.failureCount > 0) {
            console.error(`[FCM] ${response.failureCount} message(s) failed to send`);
        }
    } catch (error) {
        console.error("[FCM] sendEach error:", error);
    }
}
