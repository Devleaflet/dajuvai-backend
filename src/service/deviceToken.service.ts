import { In, LessThan } from "typeorm";
import AppDataSource from "../config/db.config";
import { DeviceToken, DevicePlatform } from "../entities/deviceToken.entity";
import { maskToken } from "../utils/fcm.utils";
import logger from "../utils/logger";

export type OwnerType = "user" | "vendor";

export interface RegisterDeviceInput {
    fcmToken: string;
    deviceId: string;
    platform: DevicePlatform;
    appVersion?: string;
    deviceModel?: string;
    osVersion?: string;
}

// Tokens not refreshed in this long are treated as abandoned.
const STALE_TOKEN_DAYS = 60;

export class DeviceTokenService {
    private repo = AppDataSource.getRepository(DeviceToken);

    private ownerWhere(ownerType: OwnerType, ownerId: number) {
        return ownerType === "user" ? { userId: ownerId } : { vendorId: ownerId };
    }

    /**
     * Upserts a device for an account, keyed on (owner, deviceId) so a token
     * refresh updates the existing row rather than piling up duplicates.
     */
    async registerOrUpdate(
        ownerType: OwnerType,
        ownerId: number,
        input: RegisterDeviceInput,
    ): Promise<DeviceToken> {
        const owner = this.ownerWhere(ownerType, ownerId);

        // FCM issues one token per app install, so a token belongs to exactly one
        // device row. Any OTHER row holding it is stale — the handset was handed
        // to another account, or the client changed its deviceId.
        //
        // These rows must be DELETED, not just deactivated: fcmToken is UNIQUE
        // across the table regardless of isActive, so a deactivated row still
        // occupies the token and collides with the insert below. Deactivating
        // here is what made user-A-logs-out/user-B-logs-in return a 500.
        //
        // Note this deliberately ignores isActive — an inactive row collides just
        // as hard as an active one.
        const holders = await this.repo.find({ where: { fcmToken: input.fcmToken } });
        const staleIds = holders
            .filter((row) => {
                const sameOwner =
                    ownerType === "user" ? row.userId === ownerId : row.vendorId === ownerId;
                return !(sameOwner && row.deviceId === input.deviceId);
            })
            .map((row) => row.id);

        if (staleIds.length) {
            await this.repo.delete(staleIds);
            logger.warn("[FCM] token reassigned — removed stale device rows", {
                token: maskToken(input.fcmToken),
                removed: staleIds.length,
            });
        }

        const existing = await this.repo.findOne({
            where: { ...owner, deviceId: input.deviceId },
        });

        if (existing) {
            Object.assign(existing, input, { isActive: true, lastSeenAt: new Date() });
            const saved = await this.repo.save(existing);
            logger.info("[FCM] device token updated", {
                ownerType,
                ownerId,
                platform: input.platform,
            });
            return saved;
        }

        const created = this.repo.create({
            ...owner,
            ...input,
            isActive: true,
            lastSeenAt: new Date(),
        });
        const saved = await this.repo.save(created);
        logger.info("[FCM] device token registered", {
            ownerType,
            ownerId,
            platform: input.platform,
        });
        return saved;
    }

    /** Called when FCM reports a token as dead. */
    async deactivateTokens(tokens: string[]): Promise<void> {
        if (!tokens.length) return;
        await this.repo.update({ fcmToken: In(tokens) }, { isActive: false });
        logger.info("[FCM] deactivated invalid tokens", {
            count: tokens.length,
            sample: tokens.slice(0, 3).map(maskToken),
        });
    }

    /** Logout of one device. */
    async deactivateDevice(ownerType: OwnerType, ownerId: number, deviceId: string): Promise<boolean> {
        const result = await this.repo.update(
            { ...this.ownerWhere(ownerType, ownerId), deviceId },
            { isActive: false },
        );
        return (result.affected ?? 0) > 0;
    }

    /** Logout everywhere. */
    async deactivateAll(ownerType: OwnerType, ownerId: number): Promise<void> {
        const result = await this.repo.update(this.ownerWhere(ownerType, ownerId), {
            isActive: false,
        });
        logger.info("[FCM] deactivated all device tokens", {
            ownerType,
            ownerId,
            count: result.affected ?? 0,
        });
    }

    private async tokensWhere(where: object): Promise<string[]> {
        const rows = await this.repo.find({
            where: { ...where, isActive: true },
            select: { fcmToken: true }, // lean select — these lists get large
        });
        return [...new Set(rows.map((r) => r.fcmToken))];
    }

    async getTokensForUser(userId: number): Promise<string[]> {
        return this.tokensWhere({ userId });
    }

    async getTokensForUsers(userIds: number[]): Promise<string[]> {
        if (!userIds.length) return [];
        return this.tokensWhere({ userId: In(userIds) });
    }

    async getTokensForVendor(vendorId: number): Promise<string[]> {
        return this.tokensWhere({ vendorId });
    }

    async getTokensForVendors(vendorIds: number[]): Promise<string[]> {
        if (!vendorIds.length) return [];
        return this.tokensWhere({ vendorId: In(vendorIds) });
    }

    /** Deactivates abandoned tokens so send batches stay small. Driven by cron. */
    async cleanupStaleTokens(): Promise<number> {
        const cutoff = new Date(Date.now() - STALE_TOKEN_DAYS * 24 * 60 * 60 * 1000);
        const result = await this.repo.update(
            { isActive: true, lastSeenAt: LessThan(cutoff) },
            { isActive: false },
        );
        const count = result.affected ?? 0;
        logger.info("[FCM] stale token cleanup complete", { deactivated: count, cutoff });
        return count;
    }

    async getStats(): Promise<Record<string, number>> {
        const rows = await this.repo
            .createQueryBuilder("dt")
            .select("dt.platform", "platform")
            .addSelect("COUNT(*)", "count")
            .where("dt.isActive = true")
            .groupBy("dt.platform")
            .getRawMany<{ platform: DevicePlatform; count: string }>();

        const stats: Record<string, number> = { android: 0, ios: 0, web: 0, total: 0 };
        for (const row of rows) {
            const count = Number(row.count);
            stats[row.platform] = count;
            stats.total += count;
        }
        return stats;
    }

}

export const deviceTokenService = new DeviceTokenService();
