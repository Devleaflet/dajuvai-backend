import { Between, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import AppDataSource from "../config/db.config";
import {
    NotificationDispatch,
    DispatchType,
    DispatchStatus,
    DispatchPriority,
} from "../entities/notificationDispatch.entity";
import { Notification, NotificationTarget, NotificationType } from "../entities/notification.entity";
import { deviceTokenService } from "./deviceToken.service";
import { sendToTokens, sendToTopic, PushPayload, PushResult } from "../utils/fcm.utils";
import logger from "../utils/logger";
import {
    SendToUserInput,
    SendToUsersInput,
    SendToTopicInput,
    DispatchQueryInput,
} from "../utils/zod_validations/push.zod";

function determineStatus(successCount: number, failureCount: number): DispatchStatus {
    if (successCount > 0 && failureCount === 0) return DispatchStatus.SENT;
    if (successCount > 0 && failureCount > 0) return DispatchStatus.PARTIAL;
    return DispatchStatus.FAILED;
}

export class PushService {
    private dispatchRepo = AppDataSource.getRepository(NotificationDispatch);
    private notificationRepo = AppDataSource.getRepository(Notification);

    /** Applies a send result to the audit row and retires any dead tokens. */
    private async finalize(
        dispatch: NotificationDispatch,
        result: PushResult,
        totalTargets: number,
    ): Promise<NotificationDispatch> {
        await deviceTokenService.deactivateTokens(result.invalidTokens);

        dispatch.status = determineStatus(result.successCount, result.failureCount);
        dispatch.successCount = result.successCount;
        dispatch.failureCount = result.failureCount;
        dispatch.totalTargets = totalTargets;
        dispatch.firebaseMessageIds = result.messageIds;
        dispatch.sentAt = new Date();

        if (dispatch.status === DispatchStatus.PARTIAL) {
            logger.warn("[FCM] partial send", {
                dispatchId: dispatch.id,
                success: result.successCount,
                failure: result.failureCount,
            });
        } else {
            logger.info("[FCM] dispatch complete", {
                dispatchId: dispatch.id,
                status: dispatch.status,
                success: result.successCount,
                failure: result.failureCount,
            });
        }

        return this.dispatchRepo.save(dispatch);
    }

    private async markFailed(
        dispatch: NotificationDispatch,
        reason: string,
    ): Promise<NotificationDispatch> {
        dispatch.status = DispatchStatus.FAILED;
        dispatch.errorDetails = reason;
        return this.dispatchRepo.save(dispatch);
    }

    private toPayload(input: {
        title: string;
        body: string;
        data?: Record<string, string>;
        imageUrl?: string;
        priority: DispatchPriority;
    }): PushPayload {
        return {
            title: input.title,
            body: input.body,
            data: input.data,
            imageUrl: input.imageUrl,
            priority: input.priority,
        };
    }

    /** Push to every active device of one user, plus a row in their in-app feed. */
    async sendToUser(input: SendToUserInput, adminUserId: number): Promise<NotificationDispatch> {
        const dispatch = await this.dispatchRepo.save(
            this.dispatchRepo.create({
                type: DispatchType.SINGLE,
                title: input.title,
                body: input.body,
                imageUrl: input.imageUrl,
                data: input.data,
                priority: input.priority,
                targetUserId: input.userId,
                status: DispatchStatus.PENDING,
                sentBy: adminUserId,
            }),
        );

        // Write the feed row BEFORE checking for devices: the in-app feed is the
        // durable record, and a user with no registered phone must still see the
        // message next time they open the app. Gating this on tokens meant the
        // message vanished entirely for them.
        await this.notificationRepo.save(
            this.notificationRepo.create({
                title: input.title,
                message: input.body,
                type: NotificationType.GENERAL,
                target: NotificationTarget.USER,
                createdById: input.userId,
            }),
        );

        const tokens = await deviceTokenService.getTokensForUser(input.userId);
        if (!tokens.length) {
            logger.warn("[FCM] no active devices for user", { userId: input.userId });
            return this.markFailed(dispatch, "No active devices found for this user");
        }

        const result = await sendToTokens(tokens, this.toPayload(input));
        return this.finalize(dispatch, result, tokens.length);
    }

    /** Push to every active device across many users. */
    async sendToUsers(input: SendToUsersInput, adminUserId: number): Promise<NotificationDispatch> {
        const userIds = [...new Set(input.userIds)];

        const dispatch = await this.dispatchRepo.save(
            this.dispatchRepo.create({
                type: DispatchType.MULTICAST,
                title: input.title,
                body: input.body,
                imageUrl: input.imageUrl,
                data: input.data,
                priority: input.priority,
                targetUserIds: userIds,
                status: DispatchStatus.PENDING,
                sentBy: adminUserId,
            }),
        );

        // Feed rows first, for every targeted user — see sendToUser.
        await this.notificationRepo.save(
            userIds.map((userId) =>
                this.notificationRepo.create({
                    title: input.title,
                    message: input.body,
                    type: NotificationType.GENERAL,
                    target: NotificationTarget.USER,
                    createdById: userId,
                }),
            ),
        );

        const tokens = await deviceTokenService.getTokensForUsers(userIds);
        if (!tokens.length) {
            logger.warn("[FCM] no active devices for user set", { count: userIds.length });
            return this.markFailed(dispatch, "No active devices found for these users");
        }

        const result = await sendToTokens(tokens, this.toPayload(input));
        return this.finalize(dispatch, result, tokens.length);
    }

    /**
     * Broadcast to a Firebase topic. FCM owns the fan-out, so there is no
     * per-device count and no invalid tokens to reap — successCount 1 means one
     * accepted dispatch, not one delivery.
     */
    async sendToTopic(input: SendToTopicInput, adminUserId: number): Promise<NotificationDispatch> {
        const dispatch = await this.dispatchRepo.save(
            this.dispatchRepo.create({
                type: DispatchType.TOPIC,
                title: input.title,
                body: input.body,
                imageUrl: input.imageUrl,
                data: input.data,
                priority: input.priority,
                targetTopic: input.topic,
                status: DispatchStatus.PENDING,
                sentBy: adminUserId,
            }),
        );

        try {
            const messageId = await sendToTopic(input.topic, this.toPayload(input));
            dispatch.status = DispatchStatus.SENT;
            dispatch.successCount = 1;
            dispatch.firebaseMessageIds = [messageId];
            dispatch.sentAt = new Date();
            logger.info("[FCM] topic dispatch sent", { topic: input.topic, messageId });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            dispatch.status = DispatchStatus.FAILED;
            dispatch.failureCount = 1;
            dispatch.errorDetails = message;
            logger.error("[FCM] topic dispatch failed", { topic: input.topic, error: message });
        }

        return this.dispatchRepo.save(dispatch);
    }

    async getHistory(query: DispatchQueryInput) {
        const { page, limit } = query;

        const where: Record<string, unknown> = {};
        if (query.status) where.status = query.status;
        if (query.type) where.type = query.type;
        if (query.targetUserId) where.targetUserId = query.targetUserId;
        if (query.sentBy) where.sentBy = query.sentBy;

        if (query.startDate && query.endDate) {
            where.createdAt = Between(new Date(query.startDate), new Date(query.endDate));
        } else if (query.startDate) {
            where.createdAt = MoreThanOrEqual(new Date(query.startDate));
        } else if (query.endDate) {
            where.createdAt = LessThanOrEqual(new Date(query.endDate));
        }

        const [data, total] = await this.dispatchRepo.findAndCount({
            where,
            order: { createdAt: "DESC" },
            skip: (page - 1) * limit,
            take: limit,
        });

        return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async getStats() {
        const devices = await deviceTokenService.getStats();

        const byStatus = await this.dispatchRepo
            .createQueryBuilder("d")
            .select("d.status", "status")
            .addSelect("COUNT(*)", "count")
            .groupBy("d.status")
            .getRawMany<{ status: DispatchStatus; count: string }>();

        const byType = await this.dispatchRepo
            .createQueryBuilder("d")
            .select("d.type", "type")
            .addSelect("COUNT(*)", "count")
            .groupBy("d.type")
            .getRawMany<{ type: DispatchType; count: string }>();

        const totals = await this.dispatchRepo
            .createQueryBuilder("d")
            .select("COALESCE(SUM(d.successCount), 0)", "success")
            .addSelect("COALESCE(SUM(d.failureCount), 0)", "failure")
            .getRawOne<{ success: string; failure: string }>();

        const success = Number(totals?.success ?? 0);
        const failure = Number(totals?.failure ?? 0);
        const attempted = success + failure;

        return {
            devices,
            dispatches: {
                total: byStatus.reduce((sum, row) => sum + Number(row.count), 0),
                byStatus: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.count)])),
                byType: Object.fromEntries(byType.map((r) => [r.type, Number(r.count)])),
            },
            delivery: {
                success,
                failure,
                // Topic sends are excluded from these counts by construction —
                // FCM never reports their per-device outcome.
                successRate: attempted ? Number(((success / attempted) * 100).toFixed(2)) : 0,
            },
        };
    }
}

export const pushService = new PushService();
