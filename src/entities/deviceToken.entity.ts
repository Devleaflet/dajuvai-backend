import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
    Check,
} from "typeorm";
import { User } from "./user.entity";
import { Vendor } from "./vendor.entity";

export enum DevicePlatform {
    ANDROID = "android",
    IOS = "ios",
    WEB = "web",
}

/**
 * One row per physical device. Replaces the single `fcmToken` column on
 * User/Vendor, which could only ever hold one device — logging in on a second
 * phone silently killed push on the first.
 */
@Entity("device_tokens")
// Declared here as well as in the migration so `migration:generate` knows the
// constraint exists — without it, TypeORM sees an unknown constraint and emits
// a DROP for it in the next generated migration.
@Check(
    "CHK_device_tokens_one_owner",
    `("userId" IS NOT NULL AND "vendorId" IS NULL) OR ("userId" IS NULL AND "vendorId" IS NOT NULL)`,
)
@Index(["userId", "isActive"])
@Index(["vendorId", "isActive"])
@Index(["userId", "deviceId"])
@Index(["vendorId", "deviceId"])
export class DeviceToken {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    // Exactly one of userId / vendorId is set — enforced by a DB CHECK constraint.
    @ManyToOne(() => User, { nullable: true, onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user?: User;

    @Column({ type: "int", nullable: true })
    userId?: number;

    @ManyToOne(() => Vendor, { nullable: true, onDelete: "CASCADE" })
    @JoinColumn({ name: "vendorId" })
    vendor?: Vendor;

    @Column({ type: "int", nullable: true })
    vendorId?: number;

    @Index({ unique: true })
    @Column({ type: "text" })
    fcmToken: string;

    @Column({ type: "enum", enum: DevicePlatform })
    platform: DevicePlatform;

    // Client-supplied install/hardware id. Identifies the device across token refreshes.
    @Column({ type: "varchar", length: 255 })
    deviceId: string;

    @Column({ type: "varchar", length: 20, nullable: true })
    appVersion?: string;

    @Column({ type: "varchar", length: 100, nullable: true })
    deviceModel?: string;

    @Column({ type: "varchar", length: 50, nullable: true })
    osVersion?: string;

    // Set false when FCM rejects the token, or when it goes stale (see cronjob.utils).
    @Index()
    @Column({ type: "boolean", default: true })
    isActive: boolean;

    @Column({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
    lastSeenAt: Date;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt: Date;
}
