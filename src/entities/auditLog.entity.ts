import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export enum AuditActorType { ADMIN = "ADMIN", STAFF = "STAFF", VENDOR = "VENDOR", USER = "USER", RIDER = "RIDER", SYSTEM = "SYSTEM" }

@Entity("audit_logs")
@Index(["createdAt"])
@Index(["module", "action", "createdAt"])
@Index(["actorType", "actorId", "createdAt"])
@Index(["entityType", "entityId", "createdAt"])
export class AuditLog {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ length: 40 }) module: string;
  @Column({ length: 80 }) action: string;
  @Column({ length: 80 }) entityType: string;
  @Column({ length: 100, nullable: true }) entityId: string | null;
  @Column({ type: "enum", enum: AuditActorType }) actorType: AuditActorType;
  @Column({ nullable: true }) actorId: number | null;
  // Legacy compatibility column. New logs store only actor type and ID.
  @Column({ length: 160, nullable: true }) actorLabel: string | null;
  @Column({ type: "text" }) summary: string;
  @Column({ type: "jsonb", nullable: true }) before: Record<string, unknown> | null;
  @Column({ type: "jsonb", nullable: true }) after: Record<string, unknown> | null;
  @Column({ length: 100, nullable: true }) requestId: string | null;
  @Column({ length: 64, nullable: true }) ipAddress: string | null;
  @Column({ length: 255, nullable: true }) userAgent: string | null;
  @CreateDateColumn({ type: "timestamptz" }) createdAt: Date;
}
