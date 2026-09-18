import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
} from "typeorm";

/** Whose token it was. Users and vendors are separate entities with separate ids. */
export enum TokenSubjectType {
    USER = "USER",
    VENDOR = "VENDOR",
}

/**
 * A token that must no longer be accepted, even though it has not expired.
 *
 * A JWT is valid because it verifies, not because we still want it to work.
 * That is fine for a fifteen-minute token and dangerous for the admin's, which
 * is signed for seven days. This table is the "no" list: `authMiddleware` looks
 * up the token's `jti` and refuses a match.
 *
 * Only revoked tokens are stored, so it stays small — a row per logout, not a
 * row per login — and `expiresAt` lets the cleanup cron drop rows once the
 * token they name could not have been used anyway.
 */
@Entity("revoked_tokens")
@Index(["jti"], { unique: true })
@Index(["expiresAt"])
@Index(["subjectType", "subjectId"])
export class RevokedToken {
    @PrimaryGeneratedColumn()
    id: number;

    /** The token's own `jti` claim. */
    @Column({ type: "varchar", length: 64 })
    jti: string;

    @Column({ type: "varchar", length: 16 })
    subjectType: string;

    @Column({ type: "int" })
    subjectId: number;

    /** `logout`, `password_change`, `admin_revoke` — for the audit trail. */
    @Column({ type: "varchar", length: 64, nullable: true })
    reason: string | null;

    /** When the token expires on its own; the row is prunable after this. */
    @Column({ type: "timestamp" })
    expiresAt: Date;

    @CreateDateColumn({ type: "timestamp" })
    revokedAt: Date;
}
