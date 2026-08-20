import { LessThanOrEqual, IsNull } from "typeorm";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import AppDataSource from "../config/db.config";
import { AuthProvider, User, UserRole } from "../entities/user.entity";
import { Address } from "../entities/address.entity";
import { Cart } from "../entities/cart.entity";
import { Wishlist } from "../entities/wishlist.entity";
import { DeviceToken } from "../entities/deviceToken.entity";
import { APIError } from "../utils/ApiError.utils";
import { AuditActorType } from "../entities/auditLog.entity";
import { auditService } from "./audit.service";
import {
    getUserDeletionDeadline,
    isUserDeletionGracePeriodActive,
} from "./user-account-deletion.policy";

const userRepository = AppDataSource.getRepository(User);
const addressRepository = AppDataSource.getRepository(Address);
const cartRepository = AppDataSource.getRepository(Cart);
const wishlistRepository = AppDataSource.getRepository(Wishlist);
const deviceTokenRepository = AppDataSource.getRepository(DeviceToken);

/**
 * Mirrors the vendor self-deletion flow for customer accounts:
 * request -> 30-day grace period -> anonymizing finalization.
 *
 * - Email/password accounts must re-enter their password to request deletion.
 * - Google OAuth accounts are already strongly authenticated by their active
 *   session, so no password is required (they have none).
 * - During the grace period the user can reactivate by logging in again.
 * - Finalization keeps the user row (orders reference it) but scrubs PII so
 *   the record can no longer identify a real person.
 */
export class UserDeletionService {
    async findUserForSignup(email: string): Promise<User | null> {
        const user = await userRepository.findOne({ where: { email } });
        if (
            user?.deletionScheduledFor &&
            user.deletionScheduledFor <= new Date() &&
            !user.deletionFinalizedAt
        ) {
            await this.finalizeUserDeletion(user.id);
            return null;
        }
        return user;
    }

    async requestAccountDeletion(
        id: number,
        email: string,
        password?: string,
    ): Promise<Date> {
        const user = await userRepository.findOne({ where: { id } });
        if (!user || user.deletionFinalizedAt) {
            throw new APIError(404, "User not found");
        }
        if (user.role !== UserRole.USER) {
            throw new APIError(
                403,
                "Staff and admin accounts cannot be self-deleted from the customer portal",
            );
        }
        if (user.email.toLowerCase() !== email.trim().toLowerCase()) {
            throw new APIError(400, "Email does not match this account", "INVALID_EMAIL");
        }

        // Email/password accounts must prove possession of the password.
        // OAuth accounts have no password — the authenticated session
        // (JWT verified by authMiddleware) is the proof of identity.
        if (user.provider === AuthProvider.LOCAL) {
            if (!password || !user.password || !(await bcrypt.compare(password, user.password))) {
                throw new APIError(400, "Current password is incorrect", "INVALID_CURRENT_PASSWORD");
            }
        }

        // Idempotent: a pending request simply reports its deadline.
        if (user.deletionScheduledFor && !user.deletionFinalizedAt) {
            return user.deletionScheduledFor;
        }

        const requestedAt = new Date();
        const scheduledFor = getUserDeletionDeadline(requestedAt);

        await userRepository.manager.transaction(async (manager) => {
            const currentUser = await manager.findOne(User, { where: { id } });
            if (!currentUser) throw new APIError(404, "User not found");

            currentUser.deletionRequestedAt = requestedAt;
            currentUser.deletionScheduledFor = scheduledFor;
            currentUser.deletionFinalizedAt = null;
            await manager.save(currentUser);

            await auditService.record(
                {
                    module: "ACCOUNT",
                    action: "DELETION_REQUESTED",
                    entityType: "User",
                    entityId: id,
                    actor: {
                        type: AuditActorType.USER,
                        id,
                    },
                    summary: "User requested account deletion",
                    after: { deletionScheduledFor: scheduledFor.toISOString() },
                },
                manager,
            );
        });

        return scheduledFor;
    }

    /**
     * Reactivation for email/password accounts: valid credentials during the
     * grace period restore the account.
     */
    async reactivateUser(email: string, password: string): Promise<User> {
        const user = await userRepository.findOne({
            where: { email: email.trim().toLowerCase() },
        });
        if (!user || !user.deletionRequestedAt || user.deletionFinalizedAt) {
            throw new APIError(401, "Invalid credentials");
        }
        if (user.provider !== AuthProvider.LOCAL) {
            throw new APIError(
                403,
                "This account was created with Google. Please log in using Google to reactivate it.",
            );
        }
        if (!user.password || !(await bcrypt.compare(password, user.password))) {
            throw new APIError(401, "Invalid credentials");
        }
        if (!isUserDeletionGracePeriodActive(user.deletionRequestedAt)) {
            await this.finalizeUserDeletion(user.id);
            throw new APIError(410, "Account deletion grace period has expired");
        }

        await this.clearDeletionState(user.id, "User reactivated account via login");
        return (await userRepository.findOne({
            where: { email: email.trim().toLowerCase() },
        }))!;
    }

    /**
     * Reactivation for OAuth accounts: a successful Google sign-in during the
     * grace period is itself strong proof of identity, so the account is
     * restored automatically.
     */
    async reactivateOAuthUser(id: number): Promise<void> {
        const user = await userRepository.findOne({ where: { id } });
        if (!user || !user.deletionRequestedAt || user.deletionFinalizedAt) return;
        if (!isUserDeletionGracePeriodActive(user.deletionRequestedAt)) return;
        await this.clearDeletionState(id, "User reactivated account via OAuth login");
    }

    private async clearDeletionState(id: number, summary: string): Promise<void> {
        await userRepository.manager.transaction(async (manager) => {
            const currentUser = await manager.findOne(User, { where: { id } });
            if (!currentUser) throw new APIError(404, "User not found");

            currentUser.deletionRequestedAt = null;
            currentUser.deletionScheduledFor = null;
            currentUser.deletionFinalizedAt = null;
            await manager.save(currentUser);

            await auditService.record(
                {
                    module: "ACCOUNT",
                    action: "REACTIVATED",
                    entityType: "User",
                    entityId: id,
                    actor: {
                        type: AuditActorType.USER,
                        id,
                    },
                    summary,
                },
                manager,
            );
        });
    }

    /**
     * Anonymizing finalization. The row is kept because orders, reviews and
     * status history reference it, but every field that could identify the
     * person is scrubbed or replaced with non-recoverable values.
     */
    async finalizeUserDeletion(id: number): Promise<void> {
        await userRepository.manager.transaction(async (manager) => {
            const user = await manager.findOne(User, { where: { id } });
            if (!user || user.deletionFinalizedAt) return;

            // Scrub personal data on the account row itself.
            user.email = `deleted-user-${user.id}-${Date.now()}@deleted.invalid`;
            user.password = await bcrypt.hash(randomUUID(), 10);
            user.fullName = "Deleted User";
            user.username = null;
            user.phoneNumber = null;
            user.googleId = null;
            user.facebookId = null;
            user.profilePicture = null;
            user.fcmToken = null;
            user.verificationCode = null;
            user.verificationCodeExpire = null;
            user.resetToken = null;
            user.resetTokenExpire = null;
            user.resendCount = 0;
            user.resendBlockUntil = null;
            user.isVerified = false;
            user.deletionFinalizedAt = new Date();
            await manager.save(user);

            // Address PII (row kept — historical orders snapshot/reference it).
            const address = await manager.findOne(Address, {
                where: { userId: id },
            });
            if (address) {
                address.localAddress = null;
                address.landmark = null;
                address.city = "Deleted";
                address.district = null;
                address.districtId = null;
                address.province = null;
                await manager.save(address);
            }

            // Transient shopping data is removed outright (cart/wishlist
            // items cascade from their parents).
            const carts = await manager.find(Cart, { where: { userId: id } });
            for (const cart of carts) {
                await manager.remove(cart);
            }
            const wishlists = await manager.find(Wishlist, {
                where: { userId: id },
            });
            for (const wishlist of wishlists) {
                await manager.remove(wishlist);
            }
            await manager.delete(DeviceToken, { userId: id });

            await auditService.record(
                {
                    module: "ACCOUNT",
                    action: "DELETION_FINALIZED",
                    entityType: "User",
                    entityId: id,
                    actor: {
                        type: AuditActorType.SYSTEM,
                    },
                    summary: "User account deletion finalized; PII anonymized",
                },
                manager,
            );
        });
    }

    /**
     * Batch sweep for the hourly cron: finalizes every account whose grace
     * period has elapsed.
     */
    async finalizeExpiredUserDeletions(now: Date = new Date()): Promise<void> {
        const expiredUsers = await userRepository.find({
            where: {
                deletionScheduledFor: LessThanOrEqual(now),
                deletionFinalizedAt: IsNull(),
            },
        });
        for (const user of expiredUsers) {
            await this.finalizeUserDeletion(user.id);
        }
    }
}
