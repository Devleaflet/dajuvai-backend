import { In } from "typeorm";
import AppDataSource from "../config/db.config";
import config from "../config/env.config";
import {
    Broadcast,
    BroadcastActionType,
    BroadcastChannel,
    BroadcastContent,
    BroadcastStatus,
} from "../entities/broadcast.entity";
import { Notification, NotificationTarget, NotificationType } from "../entities/notification.entity";
import { User } from "../entities/user.entity";
import { Vendor } from "../entities/vendor.entity";
import {
    BadRequestError,
    ConflictError,
    NotFoundError,
    ServiceUnavailableError,
} from "../errors";
import {
    USER_AUDIENCE_SQL,
    VENDOR_AUDIENCE_SQL,
    audienceParams,
    broadcastAvailability,
    enqueueBroadcastStart,
    includesUsers,
    includesVendors,
    removeBroadcastStart,
    sendBroadcastEmail,
    settleIfDone,
    skipPending,
} from "../jobs/broadcast.jobs";
import { resolveEntityId } from "../middlewares/slug.middleware";
import { emitNotification } from "../socket/socket";
import { verifyUnsubscribeToken } from "../utils/broadcast.utils";
import { sendToTokens } from "../utils/fcm.utils";
import {
    BroadcastDeliveriesQuery,
    BroadcastListQuery,
    CreateBroadcastInput,
    PreviewBroadcastInput,
} from "../utils/zod_validations/broadcast.zod";
import { deviceTokenService } from "./deviceToken.service";

// How far ahead a broadcast may be scheduled.
const MAX_SCHEDULE_DAYS = 60;
// Names shown for a hand-picked audience; the ids themselves are always complete.
const SELECTED_PREVIEW_LIMIT = 200;

type Message = Pick<
    CreateBroadcastInput,
    "title" | "body" | "emailSubject" | "imageUrl" | "actionType" | "actionValue"
>;

export class BroadcastService {
    private repo = AppDataSource.getRepository(Broadcast);
    private contentRepo = AppDataSource.getRepository(BroadcastContent);

    availability() {
        return broadcastAvailability();
    }

    // ── Reads ──────────────────────────────────────────────────────────────

    async list(query: BroadcastListQuery) {
        const qb = this.repo
            .createQueryBuilder("b")
            .orderBy("b.createdAt", "DESC")
            .skip((query.page - 1) * query.limit)
            .take(query.limit);
        if (query.status) qb.andWhere("b.status = :status", { status: query.status });
        if (query.search) qb.andWhere("b.name ILIKE :search", { search: `%${query.search}%` });
        const [rows, total] = await qb.getManyAndCount();
        const ids = rows.map((row) => row.id);
        const [contents, creators] = await Promise.all([
            ids.length ? this.contentRepo.findBy({ broadcastId: In(ids) }) : [],
            this.creators(rows.map((row) => row.createdById)),
        ]);
        return {
            data: rows.map((row) =>
                this.toView(row, contents.filter((c) => c.broadcastId === row.id), creators),
            ),
            total,
            page: query.page,
            limit: query.limit,
            totalPages: Math.ceil(total / query.limit),
        };
    }

    async get(id: string) {
        const broadcast = await this.find(id);
        const [contents, creators, selectedUsers, selectedVendors, stats] = await Promise.all([
            this.contentRepo.findBy({ broadcastId: id }),
            this.creators([broadcast.createdById]),
            broadcast.selectedUserIds?.length
                ? AppDataSource.getRepository(User).find({
                      where: { id: In(broadcast.selectedUserIds.slice(0, SELECTED_PREVIEW_LIMIT)) },
                      select: { id: true, fullName: true, username: true, email: true },
                  })
                : [],
            broadcast.selectedVendorIds?.length
                ? AppDataSource.getRepository(Vendor).find({
                      where: { id: In(broadcast.selectedVendorIds.slice(0, SELECTED_PREVIEW_LIMIT)) },
                      select: { id: true, businessName: true, email: true },
                  })
                : [],
            this.channelStats(id),
        ]);
        return {
            ...this.toView(broadcast, contents, creators),
            selectedUsers: selectedUsers.map((u) => ({ id: u.id, name: u.fullName || u.username || null, email: u.email ?? null })),
            selectedVendors: selectedVendors.map((v) => ({ id: v.id, name: v.businessName ?? null, email: v.email ?? null })),
            stats,
        };
    }

    /** Deliveries by channel and outcome — live while the broadcast runs. */
    private async channelStats(id: string) {
        const rows: { channel: BroadcastChannel; status: string; count: number }[] = await AppDataSource.query(
            `SELECT d.channel, d.status, COUNT(*)::int AS count
             FROM "broadcast_deliveries" d
             JOIN "broadcast_recipients" r ON r.id = d."broadcastRecipientId"
             WHERE r."broadcastId" = $1
             GROUP BY d.channel, d.status`,
            [id],
        );
        const empty = () => ({ PENDING: 0, PROCESSING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 });
        const stats: Record<string, ReturnType<typeof empty>> = {};
        for (const row of rows) {
            stats[row.channel] ??= empty();
            stats[row.channel][row.status as keyof ReturnType<typeof empty>] = row.count;
        }
        return stats;
    }

    async deliveries(id: string, query: BroadcastDeliveriesQuery) {
        await this.find(id);
        const filters: string[] = [`r."broadcastId" = $1`];
        const params: unknown[] = [id];
        if (query.channel) filters.push(`d.channel = $${params.push(query.channel)}`);
        if (query.status) filters.push(`d.status = $${params.push(query.status)}`);
        const where = filters.join(" AND ");
        const from = `FROM "broadcast_deliveries" d
                      JOIN "broadcast_recipients" r ON r.id = d."broadcastRecipientId"
                      LEFT JOIN "user" u ON u.id = r."userId"
                      LEFT JOIN "vendor" v ON v.id = r."vendorId"
                      WHERE ${where}`;
        const [rows, [{ total }]] = await Promise.all([
            AppDataSource.query(
                `SELECT d.id, d.channel, d.status, d."errorMessage", d."attemptCount", d."sentAt", d."failedAt",
                        r."recipientType", r."userId", r."vendorId", r.email,
                        COALESCE(NULLIF(u."fullName", ''), u.username, v."businessName") AS name
                 ${from}
                 ORDER BY r.id, d.channel
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, query.limit, (query.page - 1) * query.limit],
            ),
            AppDataSource.query(`SELECT COUNT(*)::int AS total ${from}`, params),
        ]);
        return { data: rows, total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) };
    }

    /** How many people an audience reaches, per channel. */
    async preview(input: PreviewBroadcastInput) {
        const params = audienceParams(input.audienceType, input.selectedUserIds, input.selectedVendorIds);
        const count = async (sql: string, ownerColumn: "userId" | "vendorId", values: unknown[]) => {
            const [row] = await AppDataSource.query(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE a.email IS NOT NULL AND a."emailOptIn")::int AS email,
                        COUNT(*) FILTER (WHERE EXISTS (
                            SELECT 1 FROM "device_tokens" t WHERE t."isActive" = true AND t."${ownerColumn}" = a.id
                        ))::int AS push
                 FROM (${sql}) a`,
                values,
            );
            return row as { total: number; email: number; push: number };
        };
        const none = { total: 0, email: 0, push: 0 };
        const [users, vendors] = await Promise.all([
            includesUsers(input.audienceType) ? count(USER_AUDIENCE_SQL, "userId", params.users) : none,
            includesVendors(input.audienceType) ? count(VENDOR_AUDIENCE_SQL, "vendorId", params.vendors) : none,
        ]);
        return {
            users: users.total,
            vendors: vendors.total,
            total: users.total + vendors.total,
            reachable: {
                [BroadcastChannel.IN_APP]: users.total + vendors.total,
                [BroadcastChannel.EMAIL]: users.email + vendors.email,
                [BroadcastChannel.FCM]: users.push + vendors.push,
            },
        };
    }

    // ── Drafts ─────────────────────────────────────────────────────────────

    async create(input: CreateBroadcastInput, adminId: number) {
        const message = await this.normalizeAction(input);
        const id = await AppDataSource.transaction(async (manager) => {
            const broadcast = await manager.save(
                manager.create(Broadcast, { ...this.draftFields(input), createdById: adminId, status: BroadcastStatus.DRAFT }),
            );
            await manager.save(this.contentRows(broadcast.id, input.channels, message));
            return broadcast.id;
        });
        return this.get(id);
    }

    async update(id: string, input: CreateBroadcastInput) {
        const message = await this.normalizeAction(input);
        await AppDataSource.transaction(async (manager) => {
            // Locked so a send cannot slip in between the check and the write.
            const broadcast = await manager.findOne(Broadcast, { where: { id }, lock: { mode: "pessimistic_write" } });
            if (!broadcast) throw new NotFoundError("Broadcast");
            if (broadcast.status !== BroadcastStatus.DRAFT)
                throw new ConflictError("Only drafts can be edited. Duplicate this broadcast to reuse it.");
            Object.assign(broadcast, this.draftFields(input));
            await manager.save(broadcast);
            await manager.delete(BroadcastContent, { broadcastId: id });
            await manager.save(this.contentRows(id, input.channels, message));
        });
        return this.get(id);
    }

    async duplicate(id: string, adminId: number) {
        const source = await this.get(id);
        return this.create(
            {
                name: `Copy of ${source.name}`.slice(0, 200),
                audienceType: source.audienceType,
                selectedUserIds: source.selectedUserIds ?? null,
                selectedVendorIds: source.selectedVendorIds ?? null,
                channels: source.channels,
                title: source.title,
                body: source.body,
                emailSubject: source.emailSubject,
                imageUrl: source.imageUrl,
                // Old rows may carry OPEN_ORDER, which a new broadcast cannot use.
                actionType:
                    source.actionType === BroadcastActionType.OPEN_ORDER ? BroadcastActionType.NONE : source.actionType,
                actionValue: source.actionType === BroadcastActionType.OPEN_ORDER ? null : source.actionValue,
            },
            adminId,
        );
    }

    async remove(id: string): Promise<void> {
        await this.find(id);
        const [, affected] = await AppDataSource.query(
            `DELETE FROM "broadcasts" WHERE id = $1 AND status = 'DRAFT'`,
            [id],
        );
        if (!affected) throw new ConflictError("Only drafts can be deleted; sent broadcasts are kept as a record.");
    }

    // ── Sending ────────────────────────────────────────────────────────────

    async send(id: string, scheduledAt: string | null | undefined) {
        const availability = broadcastAvailability();
        if (!availability.canSend) throw new ServiceUnavailableError(availability.reason ?? undefined);

        const broadcast = await this.find(id);
        if (broadcast.status !== BroadcastStatus.DRAFT) throw new ConflictError("This broadcast has already been sent.");

        let runAt: Date | null = null;
        if (scheduledAt) {
            const when = new Date(scheduledAt);
            const now = Date.now();
            // A minute's grace: "now" picked in a form is already slightly past.
            if (when.getTime() < now - 60_000) throw new BadRequestError("That time has already passed.");
            if (when.getTime() > now + MAX_SCHEDULE_DAYS * 86_400_000)
                throw new BadRequestError(`Broadcasts can be scheduled up to ${MAX_SCHEDULE_DAYS} days ahead.`);
            if (when.getTime() > now + 60_000) runAt = when;
        }

        const audience = await this.preview(broadcast);
        if (audience.total === 0) throw new BadRequestError("Nobody in this audience can receive a broadcast.");

        const [, affected] = await AppDataSource.query(
            `UPDATE "broadcasts" SET status = 'QUEUED', "scheduledAt" = $2, "updatedAt" = now()
             WHERE id = $1 AND status = 'DRAFT'`,
            [id, runAt],
        );
        if (!affected) throw new ConflictError("This broadcast has already been sent.");
        try {
            await enqueueBroadcastStart(id, runAt);
        } catch {
            await AppDataSource.query(
                `UPDATE "broadcasts" SET status = 'DRAFT', "scheduledAt" = NULL WHERE id = $1 AND status = 'QUEUED'`,
                [id],
            );
            throw new ServiceUnavailableError("The broadcast queue did not accept this send. Try again shortly.");
        }
        return this.get(id);
    }

    /**
     * Before it starts, a broadcast goes back to being a draft (so a schedule
     * can be changed). Once sending, it stops: what is already out stays out.
     */
    async cancel(id: string) {
        await this.find(id);
        const [, unscheduled] = await AppDataSource.query(
            `UPDATE "broadcasts" SET status = 'DRAFT', "scheduledAt" = NULL, "updatedAt" = now()
             WHERE id = $1 AND status = 'QUEUED'`,
            [id],
        );
        if (unscheduled) {
            await removeBroadcastStart(id);
            return { outcome: "UNSCHEDULED" as const, broadcast: await this.get(id) };
        }

        const [, stopped] = await AppDataSource.query(
            `UPDATE "broadcasts" SET status = 'CANCELLED', "completedAt" = now(), "updatedAt" = now()
             WHERE id = $1 AND status = 'PROCESSING'`,
            [id],
        );
        if (!stopped) throw new ConflictError("This broadcast has already finished.");
        // Claimed deliveries are mid-send; they finish and are counted.
        await skipPending(id);
        await settleIfDone(id);
        return { outcome: "STOPPED" as const, broadcast: await this.get(id) };
    }

    /**
     * Sends the message straight away, bypassing the queue, to one customer or
     * vendor — or, with neither, to the admin asking (email and their devices).
     */
    async test(id: string, target: { userId?: number; vendorId?: number }, admin: User) {
        const broadcast = await this.find(id);
        const contents = await this.contentRepo.findBy({ broadcastId: id });
        const owner = target.vendorId
            ? await AppDataSource.getRepository(Vendor).findOne({
                  where: { id: target.vendorId },
                  select: { id: true, email: true, marketingEmailsEnabled: true },
              })
            : target.userId
              ? await AppDataSource.getRepository(User).findOne({
                    where: { id: target.userId },
                    select: { id: true, email: true, marketingEmailsEnabled: true },
                })
              : null;
        if ((target.userId || target.vendorId) && !owner)
            throw new NotFoundError(target.vendorId ? "Vendor" : "Customer");
        const self = !owner;
        const type: "user" | "vendor" = target.vendorId ? "vendor" : "user";
        const ownerId = owner?.id ?? admin.id;
        const email = owner ? owner.email : admin.email;

        const results: { channel: BroadcastChannel; status: "SENT" | "SKIPPED" | "FAILED"; detail: string | null }[] = [];
        for (const channel of broadcast.channels) {
            const content = contents.find((c) => c.channel === channel);
            if (!content) {
                results.push({ channel, status: "FAILED", detail: "No message for this channel" });
                continue;
            }
            try {
                if (channel === BroadcastChannel.IN_APP) {
                    if (self) {
                        results.push({ channel, status: "SKIPPED", detail: "Admins have no customer inbox; test on a customer or vendor" });
                        continue;
                    }
                    const notification = await AppDataSource.getRepository(Notification).save({
                        title: content.title || "DajuVai",
                        message: content.body,
                        type: NotificationType.GENERAL,
                        target: type === "user" ? NotificationTarget.USER : NotificationTarget.VENDOR,
                        createdById: type === "user" ? ownerId : undefined,
                        vendorId: type === "vendor" ? ownerId : undefined,
                        imageUrl: content.imageUrl ?? null,
                        actionType: content.actionType ?? null,
                        actionValue: content.actionValue ?? null,
                        broadcastId: id,
                        isRead: false,
                    });
                    emitNotification(type, ownerId, { ...notification });
                    results.push({ channel, status: "SENT", detail: null });
                } else if (config.BROADCAST_DRY_RUN) {
                    results.push({ channel, status: "SKIPPED", detail: "Dry run: not sent" });
                } else if (channel === BroadcastChannel.EMAIL) {
                    if (!email) results.push({ channel, status: "SKIPPED", detail: "No email address" });
                    else if (owner && owner.marketingEmailsEnabled === false)
                        results.push({ channel, status: "SKIPPED", detail: "Unsubscribed from campaign email" });
                    else {
                        await sendBroadcastEmail(email, content, self ? null : { type, id: ownerId });
                        results.push({ channel, status: "SENT", detail: email });
                    }
                } else {
                    const tokens =
                        type === "vendor"
                            ? await deviceTokenService.getTokensForVendor(ownerId)
                            : await deviceTokenService.getTokensForUser(ownerId);
                    if (!tokens.length) {
                        results.push({ channel, status: "SKIPPED", detail: "No registered device" });
                        continue;
                    }
                    const result = await sendToTokens(tokens, {
                        title: content.title || "DajuVai",
                        body: content.body,
                        imageUrl: content.imageUrl || undefined,
                        data: {
                            type: "BROADCAST",
                            broadcastId: id,
                            actionType: content.actionType || "NONE",
                            actionValue: content.actionValue || "",
                        },
                    });
                    await deviceTokenService.deactivateTokens(result.invalidTokens);
                    results.push(
                        result.successCount
                            ? { channel, status: "SENT", detail: `${result.successCount} of ${tokens.length} devices` }
                            : { channel, status: "FAILED", detail: "No device accepted the message" },
                    );
                }
            } catch (error) {
                results.push({ channel, status: "FAILED", detail: error instanceof Error ? error.message : String(error) });
            }
        }
        return { results };
    }

    /** One-click opt-out from campaign email. Transactional mail is unaffected. */
    async unsubscribe(token: string) {
        const owner = verifyUnsubscribeToken(config.JWT_SECRET, token);
        if (!owner) throw new BadRequestError("This unsubscribe link is not valid.");
        const [, affected] = await AppDataSource.query(
            `UPDATE ${owner.type === "user" ? `"user"` : `"vendor"`} SET "marketingEmailsEnabled" = false WHERE id = $1`,
            [owner.id],
        );
        if (!affected) throw new NotFoundError("Account");
        return { unsubscribed: true };
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private async find(id: string) {
        const broadcast = await this.repo.findOneBy({ id });
        if (!broadcast) throw new NotFoundError("Broadcast");
        return broadcast;
    }

    private draftFields(input: CreateBroadcastInput) {
        return {
            name: input.name,
            audienceType: input.audienceType,
            channels: input.channels,
            // Kept only for the audience that uses them, so switching audience
            // cannot leave a stale list behind.
            selectedUserIds: input.audienceType === "SELECTED_USERS" ? input.selectedUserIds ?? [] : null,
            selectedVendorIds: input.audienceType === "SELECTED_VENDORS" ? input.selectedVendorIds ?? [] : null,
        };
    }

    private contentRows(broadcastId: string, channels: BroadcastChannel[], message: Message) {
        return channels.map((channel) =>
            this.contentRepo.create({
                broadcastId,
                channel,
                title: message.title,
                subject: channel === BroadcastChannel.EMAIL ? message.emailSubject || message.title : null,
                body: message.body,
                imageUrl: message.imageUrl ?? null,
                actionType: message.actionType,
                actionValue: message.actionType === BroadcastActionType.NONE || message.actionType === BroadcastActionType.OPEN_DEALS
                    ? null
                    : message.actionValue ?? null,
            }),
        );
    }

    /**
     * Product and store actions accept an id or a slug, and are stored as the
     * numeric id: the mobile app and old clients route on ids, and the
     * storefront redirects an id to the current slug.
     */
    private async normalizeAction(input: CreateBroadcastInput): Promise<Message> {
        const tables = {
            [BroadcastActionType.OPEN_PRODUCT]: "products",
            [BroadcastActionType.OPEN_STORE]: "vendor",
            [BroadcastActionType.OPEN_CATEGORY]: "category",
            [BroadcastActionType.OPEN_SUBCATEGORY]: "subcategory",
        } as const;
        const table = tables[input.actionType as keyof typeof tables];
        if (!table) return input;
        const id = await resolveEntityId(table, input.actionValue);
        const exists = id
            ? await AppDataSource.query(`SELECT 1 FROM "${table}" WHERE id = $1`, [id]).then((rows: unknown[]) => rows.length > 0)
            : false;
        if (!exists)
            throw new BadRequestError(
                {
                    products: "No product matches that id or link.",
                    vendor: "No store matches that id or link.",
                    category: "No category matches that id or link.",
                    subcategory: "No subcategory matches that id.",
                }[table],
            );
        return { ...input, actionValue: String(id) };
    }

    private async creators(ids: number[]) {
        const unique = [...new Set(ids)];
        if (!unique.length) return new Map<number, { id: number; name: string | null }>();
        const users = await AppDataSource.getRepository(User).find({
            where: { id: In(unique) },
            select: { id: true, fullName: true, username: true },
        });
        return new Map(users.map((u) => [u.id, { id: u.id, name: u.fullName || u.username || null }]));
    }

    private toView(
        broadcast: Broadcast,
        contents: BroadcastContent[],
        creators: Map<number, { id: number; name: string | null }>,
    ) {
        // Every channel carries the same message; email alone adds a subject.
        const message = contents.find((c) => c.channel !== BroadcastChannel.EMAIL) ?? contents[0];
        const email = contents.find((c) => c.channel === BroadcastChannel.EMAIL);
        return {
            id: broadcast.id,
            name: broadcast.name,
            status: broadcast.status,
            audienceType: broadcast.audienceType,
            channels: broadcast.channels,
            selectedUserIds: broadcast.selectedUserIds ?? null,
            selectedVendorIds: broadcast.selectedVendorIds ?? null,
            title: message?.title ?? email?.subject ?? "",
            body: message?.body ?? "",
            emailSubject: email && email.subject !== (message?.title ?? null) ? email.subject ?? null : null,
            imageUrl: message?.imageUrl ?? null,
            actionType: (message?.actionType as BroadcastActionType | null) ?? BroadcastActionType.NONE,
            actionValue: message?.actionValue ?? null,
            scheduledAt: broadcast.scheduledAt ?? null,
            startedAt: broadcast.startedAt ?? null,
            completedAt: broadcast.completedAt ?? null,
            totalRecipients: broadcast.totalRecipients,
            sentCount: broadcast.sentCount,
            failedCount: broadcast.failedCount,
            skippedCount: broadcast.skippedCount,
            createdBy: creators.get(broadcast.createdById) ?? { id: broadcast.createdById, name: null },
            createdAt: broadcast.createdAt,
            updatedAt: broadcast.updatedAt,
        };
    }
}

export const broadcastService = new BroadcastService();
