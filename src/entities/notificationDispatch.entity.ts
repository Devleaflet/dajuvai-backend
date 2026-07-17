import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from "typeorm";

export enum DispatchType {
    SINGLE = "single",
    MULTICAST = "multicast",
    TOPIC = "topic",
}

export enum DispatchPriority {
    HIGH = "high",
    NORMAL = "normal",
}

export enum DispatchStatus {
    PENDING = "pending",
    SENT = "sent",
    PARTIAL = "partial",
    FAILED = "failed",
}

/**
 * Audit log of admin-triggered push sends: who sent what, to whom, and how it
 * landed. Distinct from `notifications` — that is the per-recipient in-app feed
 * with isRead; this is one row per dispatch attempt.
 */
@Entity("notification_dispatches")
@Index(["createdAt"])
export class NotificationDispatch {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "enum", enum: DispatchType })
    type: DispatchType;

    @Column({ type: "varchar", length: 255 })
    title: string;

    @Column({ type: "text" })
    body: string;

    @Column({ type: "varchar", length: 500, nullable: true })
    imageUrl?: string;

    @Column({ type: "jsonb", nullable: true })
    data?: Record<string, string>;

    // Populated for SINGLE.
    @Index()
    @Column({ type: "int", nullable: true })
    targetUserId?: number;

    @Column({ type: "int", nullable: true })
    targetVendorId?: number;

    // Populated for MULTICAST.
    @Column({ type: "jsonb", nullable: true })
    targetUserIds?: number[];

    // Populated for TOPIC.
    @Column({ type: "varchar", length: 100, nullable: true })
    targetTopic?: string;

    @Column({ type: "enum", enum: DispatchPriority, default: DispatchPriority.HIGH })
    priority: DispatchPriority;

    @Index()
    @Column({ type: "enum", enum: DispatchStatus, default: DispatchStatus.PENDING })
    status: DispatchStatus;

    @Column({ type: "int", default: 0 })
    successCount: number;

    @Column({ type: "int", default: 0 })
    failureCount: number;

    // Number of device tokens targeted. Always 0 for TOPIC — FCM fans out
    // server-side and never reports the subscriber count back.
    @Column({ type: "int", default: 0 })
    totalTargets: number;

    @Column({ type: "jsonb", nullable: true })
    firebaseMessageIds?: string[];

    @Column({ type: "text", nullable: true })
    errorDetails?: string;

    // Admin User.id that triggered this send.
    @Index()
    @Column({ type: "int" })
    sentBy: number;

    @Column({ type: "timestamptz", nullable: true })
    sentAt?: Date;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt: Date;
}
