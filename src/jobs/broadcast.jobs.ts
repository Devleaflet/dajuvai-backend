import { Job, Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import nodemailer, { Transporter } from "nodemailer";
import AppDataSource from "../config/db.config";
import config from "../config/env.config";
import {
    Broadcast,
    BroadcastAudienceType,
    BroadcastChannel,
    BroadcastContent,
    BroadcastStatus,
} from "../entities/broadcast.entity";
import { deviceTokenService } from "../service/deviceToken.service";
import { emitNotification } from "../socket/socket";
import {
    actionUrl,
    isPermanentEmailError,
    renderBroadcastEmail,
    settledStatus,
    signUnsubscribeToken,
} from "../utils/broadcast.utils";
import { sendToTokens } from "../utils/fcm.utils";
import logger from "../utils/logger";

/**
 * Broadcast delivery, on one BullMQ queue.
 *
 * `start.<id>` resolves the audience into broadcast_recipients and one
 * broadcast_deliveries row per recipient and channel — inside a transaction,
 * with skips (no device, no email, unsubscribed) decided in SQL — then fans
 * out `deliver` jobs, each covering a range of recipient ids on one channel.
 *
 * A deliver job first *claims* its rows (PENDING → PROCESSING, stamped with
 * the job id) and only then sends, so no two jobs can ever send the same
 * delivery. A retry of the same job reclaims its own rows; a transient failure
 * leaves just the unsent rows claimed and throws, so BullMQ retries only those.
 *
 * Whichever job finishes the last delivery settles the broadcast. A sweep
 * repairs what a lost Redis or a crash can leave behind.
 */

const QUEUE_NAME = "broadcast";
const PREFIX = "dajuvai";
const SWEEP_INTERVAL_MS = 5 * 60_000;
// A claim this old, with the queue idle, belongs to a job that no longer exists.
const STALE_CLAIM_MINUTES = 10;

type StartJob = { broadcastId: string };
type DeliverJob = { broadcastId: string; channel: BroadcastChannel; fromId: string; toId: string };

type ClaimedRow = {
    id: string;
    recipientType: "USER" | "VENDOR";
    userId: number | null;
    vendorId: number | null;
    email: string | null;
};
type Outcome = { id: string; status: "SENT" | "FAILED" | "SKIPPED"; error: string | null };

let connection: IORedis | null = null;
let queue: Queue | null = null;
let worker: Worker | null = null;
let sweepTimer: NodeJS.Timeout | null = null;
let redisDownLogged = false;

function getConnection(): IORedis | null {
    if (!config.BROADCAST_ENABLED || !config.REDIS_URL) return null;
    if (!connection) {
        // maxRetriesPerRequest: null is what BullMQ requires of its connection.
        connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
        // ioredis reports every reconnect attempt; log the outage once.
        connection.on("error", (error) => {
            if (redisDownLogged) return;
            redisDownLogged = true;
            logger.error("Broadcast Redis unavailable", { error: error.message });
        });
        connection.on("ready", () => {
            if (redisDownLogged) logger.info("Broadcast Redis reconnected");
            redisDownLogged = false;
        });
    }
    return connection;
}

function getQueue(): Queue | null {
    const redis = getConnection();
    if (!redis) return null;
    queue ??= new Queue(QUEUE_NAME, { connection: redis, prefix: PREFIX });
    return queue;
}

/** Whether a send would be accepted right now, and if not, why. */
export function broadcastAvailability() {
    const ready = connection?.status === "ready";
    const reason = !config.BROADCAST_ENABLED
        ? "Broadcasts are switched off on the server (BROADCAST_ENABLED)."
        : !config.REDIS_URL
          ? "Broadcasts need a Redis queue, and REDIS_URL is not set."
          : !ready
            ? "The broadcast queue (Redis) is not reachable right now."
            : null;
    return {
        enabled: config.BROADCAST_ENABLED,
        queueReady: ready,
        dryRun: config.BROADCAST_DRY_RUN,
        canSend: reason === null,
        reason,
    };
}

const startJobId = (broadcastId: string) => `start.${broadcastId}`;

export async function enqueueBroadcastStart(broadcastId: string, runAt: Date | null): Promise<void> {
    const q = getQueue();
    if (!q) throw new Error("Broadcast queue is not configured");
    await q.add(
        "start",
        { broadcastId } satisfies StartJob,
        {
            jobId: startJobId(broadcastId),
            delay: runAt ? Math.max(0, runAt.getTime() - Date.now()) : 0,
            attempts: config.BROADCAST_RETRY_ATTEMPTS,
            backoff: { type: "exponential", delay: 10_000 },
            removeOnComplete: true,
            removeOnFail: 500,
        },
    );
}

/** Best effort: a job that is already running cannot be removed, and exits on its own. */
export async function removeBroadcastStart(broadcastId: string): Promise<void> {
    await getQueue()?.remove(startJobId(broadcastId)).catch(() => undefined);
}

// ── Audience ────────────────────────────────────────────────────────────────

export const includesUsers = (audience: BroadcastAudienceType) =>
    audience === BroadcastAudienceType.ALL_USERS ||
    audience === BroadcastAudienceType.ALL_USERS_AND_VENDORS ||
    audience === BroadcastAudienceType.SELECTED_USERS;

export const includesVendors = (audience: BroadcastAudienceType) =>
    audience === BroadcastAudienceType.ALL_VENDORS ||
    audience === BroadcastAudienceType.ALL_USERS_AND_VENDORS ||
    audience === BroadcastAudienceType.SELECTED_VENDORS;

/**
 * Who a broadcast can reach: every customer and vendor account, minus anyone
 * in their account-deletion grace period. Channel-level skips (no email, no
 * device, unsubscribed) are decided per delivery, not here. `$1` is the
 * hand-picked ids, NULL for an "all" audience.
 */
export const USER_AUDIENCE_SQL = `
    SELECT u.id, NULLIF(TRIM(u.email), '') AS email, u."marketingEmailsEnabled" AS "emailOptIn"
    FROM "user" u
    WHERE u.role = 'user' AND u."deletionRequestedAt" IS NULL
      AND ($1::int[] IS NULL OR u.id = ANY($1::int[]))`;

export const VENDOR_AUDIENCE_SQL = `
    SELECT v.id, NULLIF(TRIM(v.email), '') AS email, v."marketingEmailsEnabled" AS "emailOptIn"
    FROM "vendor" v
    WHERE v."deletionRequestedAt" IS NULL
      AND ($1::int[] IS NULL OR v.id = ANY($1::int[]))`;

export function audienceParams(
    audience: BroadcastAudienceType,
    selectedUserIds?: number[] | null,
    selectedVendorIds?: number[] | null,
) {
    return {
        users: [audience === BroadcastAudienceType.SELECTED_USERS ? selectedUserIds ?? [] : null],
        vendors: [audience === BroadcastAudienceType.SELECTED_VENDORS ? selectedVendorIds ?? [] : null],
    };
}

async function resolveAudience(broadcast: Broadcast): Promise<void> {
    const params = audienceParams(broadcast.audienceType, broadcast.selectedUserIds, broadcast.selectedVendorIds);
    await AppDataSource.transaction(async (manager) => {
        if (includesUsers(broadcast.audienceType)) {
            await manager.query(
                `INSERT INTO "broadcast_recipients" ("broadcastId", "recipientType", "userId", "email")
                 SELECT $2::uuid, 'USER'::"broadcast_recipients_recipientType_enum", a.id, a.email FROM (${USER_AUDIENCE_SQL}) a
                 ON CONFLICT DO NOTHING`,
                [...params.users, broadcast.id],
            );
        }
        if (includesVendors(broadcast.audienceType)) {
            await manager.query(
                `INSERT INTO "broadcast_recipients" ("broadcastId", "recipientType", "vendorId", "email")
                 SELECT $2::uuid, 'VENDOR'::"broadcast_recipients_recipientType_enum", a.id, a.email FROM (${VENDOR_AUDIENCE_SQL}) a
                 ON CONFLICT DO NOTHING`,
                [...params.vendors, broadcast.id],
            );
        }
        // Skips are decided here, once, rather than re-checked per send.
        await manager.query(
            `INSERT INTO "broadcast_deliveries" ("broadcastRecipientId", "channel", "status", "errorMessage")
             SELECT r.id, ch.channel::"broadcast_deliveries_channel_enum", s.status::"broadcast_deliveries_status_enum", s.reason
             FROM "broadcast_recipients" r
             CROSS JOIN unnest($2::text[]) AS ch(channel)
             LEFT JOIN "user" u ON u.id = r."userId"
             LEFT JOIN "vendor" v ON v.id = r."vendorId"
             CROSS JOIN LATERAL (
                 SELECT CASE
                     WHEN ch.channel = 'EMAIL' AND r.email IS NULL THEN 'No email address'
                     WHEN ch.channel = 'EMAIL' AND COALESCE(u."marketingEmailsEnabled", v."marketingEmailsEnabled", true) = false
                         THEN 'Unsubscribed from campaign email'
                     WHEN ch.channel = 'FCM' AND NOT EXISTS (
                         SELECT 1 FROM "device_tokens" t
                         WHERE t."isActive" = true
                           AND (t."userId" = r."userId" OR t."vendorId" = r."vendorId")
                     ) THEN 'No registered device'
                 END AS reason
             ) skip
             CROSS JOIN LATERAL (
                 SELECT CASE WHEN skip.reason IS NULL THEN 'PENDING' ELSE 'SKIPPED' END AS status, skip.reason
             ) s
             WHERE r."broadcastId" = $1
             ON CONFLICT DO NOTHING`,
            [broadcast.id, broadcast.channels],
        );
        await manager.query(
            `UPDATE "broadcasts" SET "totalRecipients" =
                (SELECT COUNT(*) FROM "broadcast_recipients" WHERE "broadcastId" = $1)
             WHERE id = $1`,
            [broadcast.id],
        );
    });
}

const batchSize = (channel: BroadcastChannel) =>
    channel === BroadcastChannel.FCM
        ? config.BROADCAST_FCM_BATCH
        : channel === BroadcastChannel.EMAIL
          ? config.BROADCAST_EMAIL_BATCH
          : config.BROADCAST_INAPP_BATCH;

/** One deliver job per `batchSize` pending deliveries, as a recipient-id range. */
async function enqueueDeliveries(broadcast: Broadcast): Promise<number> {
    const q = getQueue();
    if (!q) throw new Error("Broadcast queue is not configured");
    let jobs = 0;
    for (const channel of broadcast.channels) {
        // uuid text order equals uuid order, which is what BETWEEN compares.
        const ranges: { fromId: string; toId: string }[] = await AppDataSource.query(
            `SELECT MIN(id::text) AS "fromId", MAX(id::text) AS "toId"
             FROM (
                 SELECT r.id, (ROW_NUMBER() OVER (ORDER BY r.id) - 1) / $3 AS bucket
                 FROM "broadcast_recipients" r
                 JOIN "broadcast_deliveries" d ON d."broadcastRecipientId" = r.id AND d.channel = $2
                 WHERE r."broadcastId" = $1 AND d.status = 'PENDING'
             ) t
             GROUP BY bucket ORDER BY bucket`,
            [broadcast.id, channel, Math.max(1, batchSize(channel))],
        );
        if (!ranges.length) continue;
        await q.addBulk(
            ranges.map((range) => ({
                name: "deliver",
                data: { broadcastId: broadcast.id, channel, ...range } satisfies DeliverJob,
                opts: {
                    // Same range, same id: a repeated fan-out is deduplicated by BullMQ.
                    jobId: `deliver.${broadcast.id}.${channel}.${range.fromId}`,
                    attempts: config.BROADCAST_RETRY_ATTEMPTS,
                    backoff: { type: "exponential", delay: 10_000 },
                    removeOnComplete: true,
                    removeOnFail: 500,
                },
            })),
        );
        jobs += ranges.length;
    }
    return jobs;
}

// ── Jobs ────────────────────────────────────────────────────────────────────

async function runStart(job: Job<StartJob>): Promise<void> {
    const { broadcastId } = job.data;
    // An UPDATE resolves to [rows, rowCount].
    const [claimed]: [unknown[]] = await AppDataSource.query(
        `UPDATE "broadcasts" SET status = 'PROCESSING', "startedAt" = now(), "updatedAt" = now()
         WHERE id = $1 AND status = 'QUEUED' RETURNING id`,
        [broadcastId],
    );
    const broadcast = await AppDataSource.getRepository(Broadcast).findOneBy({ id: broadcastId });
    // Unscheduled, cancelled or deleted while it waited.
    if (!broadcast || broadcast.status !== BroadcastStatus.PROCESSING) return;

    // A resumed broadcast keeps the audience it resolved the first time;
    // people who joined since are not added halfway through.
    const resolved = claimed.length === 0 && broadcast.totalRecipients > 0;
    if (!resolved) await resolveAudience(broadcast);

    // Stopped while the audience was resolving: the stop found no rows to
    // skip yet, so they are skipped here instead of being sent.
    const current = await AppDataSource.getRepository(Broadcast).findOneBy({ id: broadcastId });
    if (current?.status === BroadcastStatus.CANCELLED) {
        await skipPending(broadcastId);
        return settleIfDone(broadcastId);
    }

    await enqueueDeliveries(broadcast);
    await settleIfDone(broadcastId);
}

/** Marks what has not gone out yet as skipped; claimed rows finish on their own. */
export async function skipPending(broadcastId: string): Promise<void> {
    await AppDataSource.query(
        `UPDATE "broadcast_deliveries" d SET status = 'SKIPPED', "errorMessage" = 'Broadcast stopped', "updatedAt" = now()
         FROM "broadcast_recipients" r
         WHERE d."broadcastRecipientId" = r.id AND r."broadcastId" = $1 AND d.status = 'PENDING'`,
        [broadcastId],
    );
}

async function claim(job: Job<DeliverJob>): Promise<ClaimedRow[]> {
    const { broadcastId, channel, fromId, toId } = job.data;
    // Row locks make this safe against a concurrent claim: the loser re-reads
    // the row, sees it PROCESSING under another job id, and skips it.
    const [rows] = await AppDataSource.query(
        `UPDATE "broadcast_deliveries" d
         SET status = 'PROCESSING', "claimedBy" = $5, "claimedAt" = now(),
             "attemptCount" = d."attemptCount" + 1, "updatedAt" = now()
         FROM "broadcast_recipients" r
         WHERE d."broadcastRecipientId" = r.id
           AND r."broadcastId" = $1 AND d.channel = $2
           AND r.id BETWEEN $3::uuid AND $4::uuid
           AND (d.status = 'PENDING' OR (d.status = 'PROCESSING' AND d."claimedBy" = $5))
         RETURNING d.id, r."recipientType", r."userId", r."vendorId", r.email`,
        [broadcastId, channel, fromId, toId, job.id],
    );
    return rows;
}

async function record(outcomes: Outcome[]): Promise<void> {
    if (!outcomes.length) return;
    await AppDataSource.query(
        `UPDATE "broadcast_deliveries" d
         SET status = v.status::"broadcast_deliveries_status_enum",
             "errorMessage" = v.error,
             "sentAt" = CASE WHEN v.status = 'SENT' THEN now() ELSE d."sentAt" END,
             "failedAt" = CASE WHEN v.status = 'FAILED' THEN now() ELSE d."failedAt" END,
             "claimedBy" = NULL, "updatedAt" = now()
         FROM unnest($1::uuid[], $2::text[], $3::text[]) AS v(id, status, error)
         WHERE d.id = v.id`,
        [outcomes.map((o) => o.id), outcomes.map((o) => o.status), outcomes.map((o) => o.error)],
    );
}

const pushData = (content: BroadcastContent, broadcastId: string): Record<string, string> => ({
    type: "BROADCAST",
    broadcastId,
    actionType: content.actionType || "NONE",
    actionValue: content.actionValue || "",
    url: actionUrl(config.FRONTEND_URL, content.actionType, content.actionValue) ?? "",
});

/** Push: one FCM call for the batch, then an outcome per recipient from its devices. */
async function deliverPush(rows: ClaimedRow[], content: BroadcastContent, broadcastId: string, finalAttempt: boolean) {
    const userIds = rows.filter((r) => r.userId).map((r) => r.userId as number);
    const vendorIds = rows.filter((r) => r.vendorId).map((r) => r.vendorId as number);
    const tokens: { fcmToken: string; userId: number | null; vendorId: number | null }[] = await AppDataSource.query(
        `SELECT "fcmToken", "userId", "vendorId" FROM "device_tokens"
         WHERE "isActive" = true AND ("userId" = ANY($1::int[]) OR "vendorId" = ANY($2::int[]))`,
        [userIds, vendorIds],
    );
    const owned = (row: ClaimedRow) =>
        tokens.filter((t) => (row.userId ? t.userId === row.userId : t.vendorId === row.vendorId)).map((t) => t.fcmToken);

    const result = await sendToTokens([...new Set(tokens.map((t) => t.fcmToken))], {
        title: content.title || "DajuVai",
        body: content.body,
        imageUrl: content.imageUrl || undefined,
        data: pushData(content, broadcastId),
    });
    await deviceTokenService.deactivateTokens(result.invalidTokens);
    const failed = new Set(result.failedTokens);
    const dead = new Set(result.invalidTokens);

    const outcomes: Outcome[] = [];
    let retry = false;
    for (const row of rows) {
        const mine = owned(row);
        if (!mine.length) outcomes.push({ id: row.id, status: "SKIPPED", error: "No registered device" });
        else if (mine.some((token) => !failed.has(token))) outcomes.push({ id: row.id, status: "SENT", error: null });
        else if (mine.every((token) => dead.has(token)))
            outcomes.push({ id: row.id, status: "FAILED", error: "Every registered device has expired" });
        else if (finalAttempt) outcomes.push({ id: row.id, status: "FAILED", error: "Push service did not accept the message" });
        else retry = true; // stays claimed; the retry sends to it again
    }
    return { outcomes, retry };
}

let transporter: Transporter | null = null;
function mailer(): Transporter {
    transporter ??= config.SMTP_HOST
        ? nodemailer.createTransport({
              host: config.SMTP_HOST,
              port: config.SMTP_PORT,
              secure: config.SMTP_SECURE,
              auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
              pool: true,
          })
        : nodemailer.createTransport({
              service: "Gmail",
              auth: { user: config.USER_EMAIL, pass: config.PASS_EMAIL },
              pool: true,
          });
    return transporter;
}

export async function sendBroadcastEmail(
    to: string,
    content: Pick<BroadcastContent, "title" | "subject" | "body" | "imageUrl" | "actionType" | "actionValue">,
    owner: { type: "user" | "vendor"; id: number } | null,
): Promise<void> {
    const appUrl = config.FRONTEND_URL.replace(/\/$/, "");
    const unsubscribeUrl =
        owner && config.JWT_SECRET
            ? `${appUrl}/unsubscribe?t=${signUnsubscribeToken(config.JWT_SECRET, owner.type, owner.id)}`
            : null;
    await mailer().sendMail({
        from: `DajuVai <${config.SMTP_USER || config.USER_EMAIL}>`,
        to,
        subject: content.subject || content.title || "DajuVai",
        text: content.body,
        html: renderBroadcastEmail(
            { title: content.title || content.subject || "DajuVai", ...content },
            { appUrl, unsubscribeUrl },
        ),
        ...(unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` } } : {}),
    });
}

async function deliverEmail(rows: ClaimedRow[], content: BroadcastContent, finalAttempt: boolean) {
    const outcomes: Outcome[] = [];
    let retry = false;
    let next = 0;
    // A small pool: SMTP servers throttle bursts, and one slow send should
    // not hold up the rest of the batch.
    const lane = async () => {
        while (next < rows.length) {
            const row = rows[next++];
            if (!row.email) {
                outcomes.push({ id: row.id, status: "SKIPPED", error: "No email address" });
                continue;
            }
            try {
                await sendBroadcastEmail(row.email, content, {
                    type: row.userId ? "user" : "vendor",
                    id: (row.userId ?? row.vendorId) as number,
                });
                outcomes.push({ id: row.id, status: "SENT", error: null });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (isPermanentEmailError(message) || finalAttempt)
                    outcomes.push({ id: row.id, status: "FAILED", error: message.slice(0, 500) });
                else retry = true;
            }
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, config.BROADCAST_EMAIL_CONCURRENCY) }, lane));
    return { outcomes, retry };
}

/**
 * In-app: the notifications and the SENT marks commit together, so a crash
 * between them cannot leave a recipient with a duplicate on retry.
 */
async function deliverInApp(rows: ClaimedRow[], content: BroadcastContent, broadcastId: string) {
    const inserted: { id: string; createdById: number | null; vendorId: number | null; createdAt: Date }[] =
        await AppDataSource.transaction(async (manager) => {
            const created = await manager.query(
                `INSERT INTO "notifications"
                    ("title", "message", "type", "target", "isRead", "createdById", "vendorId",
                     "imageUrl", "actionType", "actionValue", "broadcastId")
                 SELECT $1::varchar, $2::text, 'GENERAL'::"notifications_type_enum",
                        r."recipientType"::text::"notifications_target_enum", false,
                        r."userId", r."vendorId", $3::varchar, $4::varchar, $5::varchar, $6::uuid
                 FROM unnest($7::uuid[]) AS c(id)
                 JOIN "broadcast_deliveries" d ON d.id = c.id
                 JOIN "broadcast_recipients" r ON r.id = d."broadcastRecipientId"
                 RETURNING id, "createdById", "vendorId", "createdAt"`,
                [
                    content.title || "DajuVai",
                    content.body,
                    content.imageUrl ?? null,
                    content.actionType ?? null,
                    content.actionValue ?? null,
                    broadcastId,
                    rows.map((r) => r.id),
                ],
            );
            await manager.query(
                `UPDATE "broadcast_deliveries" SET status = 'SENT', "sentAt" = now(), "errorMessage" = NULL,
                     "claimedBy" = NULL, "updatedAt" = now()
                 WHERE id = ANY($1::uuid[])`,
                [rows.map((r) => r.id)],
            );
            return created;
        });

    for (const row of inserted) {
        emitNotification(row.createdById ? "user" : "vendor", (row.createdById ?? row.vendorId) as number, {
            id: row.id,
            title: content.title || "DajuVai",
            message: content.body,
            imageUrl: content.imageUrl ?? null,
            actionType: content.actionType ?? null,
            actionValue: content.actionValue ?? null,
            broadcastId,
            createdAt: row.createdAt,
        });
    }
}

async function runDeliver(job: Job<DeliverJob>): Promise<void> {
    const { broadcastId, channel } = job.data;
    const broadcast = await AppDataSource.getRepository(Broadcast).findOneBy({ id: broadcastId });
    if (!broadcast) return;
    if (broadcast.status === BroadcastStatus.CANCELLED) {
        // Normally already skipped by the stop; this catches rows that were
        // still being written when it ran.
        await skipPending(broadcastId);
        return settleIfDone(broadcastId);
    }
    if (broadcast.status !== BroadcastStatus.PROCESSING) return;

    const rows = await claim(job);
    if (!rows.length) return settleIfDone(broadcastId);

    const content = await AppDataSource.getRepository(BroadcastContent).findOneBy({ broadcastId, channel });
    if (!content) {
        await record(rows.map((r) => ({ id: r.id, status: "FAILED", error: "No message for this channel" })));
        return settleIfDone(broadcastId);
    }

    if (config.BROADCAST_DRY_RUN && channel !== BroadcastChannel.IN_APP) {
        await record(rows.map((r) => ({ id: r.id, status: "SKIPPED", error: "Dry run: not sent" })));
        return settleIfDone(broadcastId);
    }

    if (channel === BroadcastChannel.IN_APP) {
        await deliverInApp(rows, content, broadcastId);
        return settleIfDone(broadcastId);
    }

    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const { outcomes, retry } =
        channel === BroadcastChannel.FCM
            ? await deliverPush(rows, content, broadcastId, finalAttempt)
            : await deliverEmail(rows, content, finalAttempt);
    await record(outcomes);
    if (retry) throw new Error(`${channel}: ${rows.length - outcomes.length} deliveries failed temporarily; retrying`);
    await settleIfDone(broadcastId);
}

/**
 * Settles a broadcast once no delivery is pending or claimed. Idempotent, so
 * two jobs finishing together both arriving here is harmless. A cancelled
 * broadcast keeps its status but still gets its final counts.
 */
export async function settleIfDone(broadcastId: string): Promise<void> {
    const [busy] = await AppDataSource.query(
        `SELECT EXISTS (
             SELECT 1 FROM "broadcast_deliveries" d
             JOIN "broadcast_recipients" r ON r.id = d."broadcastRecipientId"
             WHERE r."broadcastId" = $1 AND d.status IN ('PENDING', 'PROCESSING')
         ) AS busy`,
        [broadcastId],
    );
    if (busy?.busy) return;
    const [counts] = await AppDataSource.query(
        `SELECT COUNT(*) FILTER (WHERE d.status = 'SENT')::int AS sent,
                COUNT(*) FILTER (WHERE d.status = 'FAILED')::int AS failed,
                COUNT(*) FILTER (WHERE d.status = 'SKIPPED')::int AS skipped
         FROM "broadcast_deliveries" d
         JOIN "broadcast_recipients" r ON r.id = d."broadcastRecipientId"
         WHERE r."broadcastId" = $1`,
        [broadcastId],
    );
    const final = settledStatus(counts);
    const [, affected] = await AppDataSource.query(
        `UPDATE "broadcasts"
         SET status = CASE WHEN status = 'PROCESSING' THEN $2::"broadcasts_status_enum" ELSE status END,
             "completedAt" = COALESCE("completedAt", now()),
             "sentCount" = $3, "failedCount" = $4, "skippedCount" = $5,
             "totalRecipients" = (SELECT COUNT(*) FROM "broadcast_recipients" WHERE "broadcastId" = $1),
             "updatedAt" = now()
         WHERE id = $1 AND status IN ('PROCESSING', 'CANCELLED')`,
        [broadcastId, final, counts.sent, counts.failed, counts.skipped],
    );
    if (affected) logger.info("Broadcast settled", { broadcastId, status: final, ...counts });
}

/** A job that exhausted its retries: whatever it still holds did not go out. */
async function failClaimed(job: Job<DeliverJob>, error: Error): Promise<void> {
    await AppDataSource.query(
        `UPDATE "broadcast_deliveries" SET status = 'FAILED', "failedAt" = now(), "claimedBy" = NULL,
             "errorMessage" = $2, "updatedAt" = now()
         WHERE "claimedBy" = $1 AND status = 'PROCESSING'`,
        [job.id, error.message.slice(0, 500)],
    );
    await settleIfDone(job.data.broadcastId);
}

async function failStart(job: Job<StartJob>, error: Error): Promise<void> {
    await AppDataSource.query(
        `UPDATE "broadcasts" SET status = 'FAILED', "completedAt" = now(), "updatedAt" = now()
         WHERE id = $1 AND status IN ('QUEUED', 'PROCESSING') AND "totalRecipients" = 0`,
        [job.data.broadcastId],
    );
    logger.error("Broadcast could not start", { broadcastId: job.data.broadcastId, error: error.message });
}

// ── Recovery ────────────────────────────────────────────────────────────────

/**
 * Repairs what a lost Redis or a crash leaves behind:
 * - a QUEUED broadcast whose start job is gone is queued again;
 * - with the queue idle, a PROCESSING broadcast can only be orphaned, so its
 *   stale claims are released and it is resumed.
 * ponytail: "queue idle" is global — a busy queue defers every repair until it
 * drains. Per-broadcast job tracking if that ever delays a real recovery.
 */
export async function sweepBroadcasts(): Promise<void> {
    const q = getQueue();
    if (!q || connection?.status !== "ready") return;
    const repo = AppDataSource.getRepository(Broadcast);

    for (const broadcast of await repo.findBy({ status: BroadcastStatus.QUEUED })) {
        const job = await q.getJob(startJobId(broadcast.id));
        const state = job ? await job.getState() : null;
        if (state && state !== "completed" && state !== "failed" && state !== "unknown") continue;
        if (job) await job.remove().catch(() => undefined);
        await enqueueBroadcastStart(broadcast.id, broadcast.scheduledAt ?? null);
        logger.warn("Re-queued a broadcast whose start job was lost", { broadcastId: broadcast.id });
    }

    const counts = await q.getJobCounts("active", "waiting", "delayed", "prioritized", "paused", "waiting-children");
    if (Object.values(counts).some((n) => n > 0)) return;
    for (const broadcast of await repo.findBy({ status: BroadcastStatus.PROCESSING })) {
        await AppDataSource.query(
            `UPDATE "broadcast_deliveries" d SET status = 'PENDING', "claimedBy" = NULL, "updatedAt" = now()
             FROM "broadcast_recipients" r
             WHERE d."broadcastRecipientId" = r.id AND r."broadcastId" = $1
               AND d.status = 'PROCESSING' AND d."claimedAt" < now() - ($2 || ' minutes')::interval`,
            [broadcast.id, String(STALE_CLAIM_MINUTES)],
        );
        await q.add("start", { broadcastId: broadcast.id } satisfies StartJob, {
            jobId: `resume.${broadcast.id}.${Date.now()}`,
            attempts: config.BROADCAST_RETRY_ATTEMPTS,
            backoff: { type: "exponential", delay: 10_000 },
            removeOnComplete: true,
            removeOnFail: 500,
        });
        logger.warn("Resumed an orphaned broadcast", { broadcastId: broadcast.id });
    }
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export function startBroadcastWorker(): void {
    const redis = getConnection();
    if (!redis) {
        if (config.BROADCAST_ENABLED) logger.warn("BROADCAST_ENABLED is set but REDIS_URL is not; broadcasts cannot send");
        return;
    }
    getQueue();
    worker = new Worker(
        QUEUE_NAME,
        async (job: Job) => (job.name === "deliver" ? runDeliver(job) : runStart(job)),
        { connection: redis, prefix: PREFIX, concurrency: 4 },
    );
    worker.on("failed", (job, error) => {
        if (!job) return;
        logger.warn("Broadcast job failed", { jobId: job.id, attempt: job.attemptsMade, error: error.message });
        if (job.attemptsMade < (job.opts.attempts ?? 1)) return;
        const settle = job.name === "deliver" ? failClaimed(job, error) : failStart(job, error);
        settle.catch((e) => logger.error("Could not record a failed broadcast job", { jobId: job.id, error: String(e) }));
    });
    worker.on("error", (error) => logger.error("Broadcast worker error", { error: error.message }));

    const sweep = () =>
        sweepBroadcasts().catch((error) => logger.error("Broadcast sweep failed", { error: String(error) }));
    redis.once("ready", () => void sweep());
    sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
    sweepTimer.unref();
    logger.info("Broadcast worker started");
}

export async function stopBroadcastWorker(): Promise<void> {
    if (sweepTimer) clearInterval(sweepTimer);
    await worker?.close();
    await queue?.close();
    await connection?.quit().catch(() => undefined);
    worker = null;
    queue = null;
    connection = null;
}
