import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn,
} from "typeorm";

// Schema: migrations 1785900000000 (tables, from the original broadcast
// branch) and 1787700000000 (claims and result counters).

export enum BroadcastStatus {
    DRAFT = "DRAFT",
    // Waiting in the queue — to start now, or at scheduledAt.
    QUEUED = "QUEUED",
    PROCESSING = "PROCESSING",
    COMPLETED = "COMPLETED",
    PARTIALLY_COMPLETED = "PARTIALLY_COMPLETED",
    FAILED = "FAILED",
    CANCELLED = "CANCELLED",
}

export enum BroadcastAudienceType {
    ALL_USERS = "ALL_USERS",
    ALL_VENDORS = "ALL_VENDORS",
    ALL_USERS_AND_VENDORS = "ALL_USERS_AND_VENDORS",
    SELECTED_USERS = "SELECTED_USERS",
    SELECTED_VENDORS = "SELECTED_VENDORS",
}

export enum BroadcastChannel {
    FCM = "FCM",
    EMAIL = "EMAIL",
    IN_APP = "IN_APP",
}

/**
 * What tapping the message opens. Travels to devices as the FCM data keys
 * `actionType`/`actionValue`, and onto in-app notifications as columns.
 * OPEN_ORDER survives for rows written by the original branch; a campaign
 * cannot point every recipient at one order, so new broadcasts may not use it.
 */
export enum BroadcastActionType {
    NONE = "NONE",
    OPEN_PRODUCT = "OPEN_PRODUCT",
    OPEN_ORDER = "OPEN_ORDER",
    OPEN_DEALS = "OPEN_DEALS",
    OPEN_URL = "OPEN_URL",
    OPEN_STORE = "OPEN_STORE",
    OPEN_CATEGORY = "OPEN_CATEGORY",
    OPEN_SUBCATEGORY = "OPEN_SUBCATEGORY",
}

export enum BroadcastRecipientType {
    USER = "USER",
    VENDOR = "VENDOR",
}

export enum BroadcastRecipientStatus {
    PENDING = "PENDING",
    PROCESSING = "PROCESSING",
    COMPLETED = "COMPLETED",
    PARTIALLY_COMPLETED = "PARTIALLY_COMPLETED",
    FAILED = "FAILED",
}

export enum BroadcastDeliveryStatus {
    PENDING = "PENDING",
    // Claimed by the channel job named in `claimedBy`.
    PROCESSING = "PROCESSING",
    SENT = "SENT",
    FAILED = "FAILED",
    SKIPPED = "SKIPPED",
}

@Entity("broadcasts")
@Index(["createdById"])
@Index(["status", "createdAt"])
export class Broadcast {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 200 })
    name: string;

    @Column({ type: "enum", enum: BroadcastStatus, default: BroadcastStatus.DRAFT })
    status: BroadcastStatus;

    @Column({ type: "enum", enum: BroadcastAudienceType })
    audienceType: BroadcastAudienceType;

    @Column({ type: "jsonb" })
    channels: BroadcastChannel[];

    @Column({ type: "jsonb", nullable: true })
    selectedUserIds?: number[] | null;

    @Column({ type: "jsonb", nullable: true })
    selectedVendorIds?: number[] | null;

    @Column({ type: "int" })
    createdById: number;

    @Column({ type: "timestamptz", nullable: true })
    scheduledAt?: Date | null;

    @Column({ type: "timestamptz", nullable: true })
    startedAt?: Date | null;

    @Column({ type: "timestamptz", nullable: true })
    completedAt?: Date | null;

    // Deliveries by outcome, written when the broadcast settles. Live counts
    // come from broadcast_deliveries while it runs.
    @Column({ type: "int", default: 0 })
    totalRecipients: number;

    @Column({ type: "int", default: 0 })
    sentCount: number;

    @Column({ type: "int", default: 0 })
    failedCount: number;

    @Column({ type: "int", default: 0 })
    skippedCount: number;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt: Date;
}

/** The message for one channel of a broadcast. */
@Entity("broadcast_contents")
@Unique("UQ_broadcast_contents_broadcast_channel", ["broadcastId", "channel"])
@Index(["broadcastId"])
export class BroadcastContent {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    broadcastId: string;

    @Column({ type: "enum", enum: BroadcastChannel })
    channel: BroadcastChannel;

    @Column({ type: "varchar", length: 200, nullable: true })
    title?: string | null;

    // Email subject line; the other channels ignore it.
    @Column({ type: "varchar", length: 200, nullable: true })
    subject?: string | null;

    @Column({ type: "text" })
    body: string;

    @Column({ type: "varchar", length: 500, nullable: true })
    imageUrl?: string | null;

    @Column({ type: "varchar", length: 50, nullable: true })
    actionType?: BroadcastActionType | null;

    @Column({ type: "varchar", length: 255, nullable: true })
    actionValue?: string | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt: Date;
}

/** One user or vendor a broadcast resolved to, snapshotted when it started. */
@Entity("broadcast_recipients")
@Index(["broadcastId"])
@Index(["broadcastId", "status"])
export class BroadcastRecipient {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    broadcastId: string;

    @Column({ type: "enum", enum: BroadcastRecipientType })
    recipientType: BroadcastRecipientType;

    @Column({ type: "int", nullable: true })
    userId?: number | null;

    @Column({ type: "int", nullable: true })
    vendorId?: number | null;

    @Column({ type: "varchar", length: 255, nullable: true })
    email?: string | null;

    @Column({ type: "enum", enum: BroadcastRecipientStatus, default: BroadcastRecipientStatus.PENDING })
    status: BroadcastRecipientStatus;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt: Date;
}

/** One recipient on one channel, and how it went. */
@Entity("broadcast_deliveries")
@Unique("UQ_broadcast_deliveries_recipient_channel", ["broadcastRecipientId", "channel"])
@Index(["broadcastRecipientId"])
@Index(["status"])
export class BroadcastDelivery {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    broadcastRecipientId: string;

    @Column({ type: "enum", enum: BroadcastChannel })
    channel: BroadcastChannel;

    @Column({ type: "enum", enum: BroadcastDeliveryStatus, default: BroadcastDeliveryStatus.PENDING })
    status: BroadcastDeliveryStatus;

    @Column({ type: "int", default: 0 })
    attemptCount: number;

    @Column({ type: "text", nullable: true })
    errorMessage?: string | null;

    @Column({ type: "varchar", length: 100, nullable: true })
    claimedBy?: string | null;

    @Column({ type: "timestamptz", nullable: true })
    claimedAt?: Date | null;

    @Column({ type: "timestamptz", nullable: true })
    sentAt?: Date | null;

    @Column({ type: "timestamptz", nullable: true })
    failedAt?: Date | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt: Date;
}
