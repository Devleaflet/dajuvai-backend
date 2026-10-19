import { Brackets, EntityManager, In } from "typeorm";
import AppDataSource from "../config/db.config";
import { AuditActorType, AuditLog } from "../entities/auditLog.entity";
import { redactAuditValue } from "../utils/audit-redaction.utils";
import { User } from "../entities/user.entity";
import { Vendor } from "../entities/vendor.entity";

export type AuditActor = { type: AuditActorType; id?: number | null };
export type AuditInput = { module: string; action: string; entityType: string; entityId?: string | number | null; actor: AuditActor; summary: string; before?: Record<string, unknown> | null; after?: Record<string, unknown> | null; requestId?: string | null; ipAddress?: string | null; userAgent?: string | null };
export type AuditListQuery = {
  page: number;
  limit: number;
  search?: string;
  module?: string;
  actorType?: AuditActorType;
  entityType?: string;
  from?: Date;
  to?: Date;
};

export type AuditActorDetails = {
  id: number | null;
  type: AuditActorType;
  name: string | null;
  email: string | null;
  phoneNumber: string | null;
  displayName: string;
};

type AuditLogWithActor = AuditLog & { actor: AuditActorDetails };

export class AuditService {
  async record(input: AuditInput, manager?: EntityManager): Promise<AuditLog> {
    const entityManager = manager ?? AppDataSource.manager;
    const repository = entityManager.getRepository(AuditLog);
    return repository.save(repository.create({
      ...input,
      entityId: input.entityId == null ? null : String(input.entityId),
      actorType: input.actor.type,
      actorId: input.actor.id ?? null,
      // Actor identity is normalized. Resolve current safe profile data only when logs are read.
      actorLabel: null,
      before: (redactAuditValue(input.before) as Record<string, unknown>) ?? null,
      after: (redactAuditValue(input.after) as Record<string, unknown>) ?? null,
      requestId: input.requestId?.slice(0, 100) ?? null,
      ipAddress: input.ipAddress?.slice(0, 64) ?? null,
      userAgent: input.userAgent?.slice(0, 255) ?? null,
    }));
  }

  private async findActorMatches(search: string) {
    const pattern = `%${search}%`;
    const [users, vendors] = await Promise.all([
      AppDataSource.getRepository(User)
        .createQueryBuilder("user")
        .select("user.id", "id")
        .where(new Brackets((where) => {
          where.where("user.fullName ILIKE :pattern", { pattern })
            .orWhere("user.username ILIKE :pattern", { pattern })
            .orWhere("user.email ILIKE :pattern", { pattern })
            .orWhere("user.phoneNumber ILIKE :pattern", { pattern });
        }))
        .getRawMany<{ id: number }>(),
      AppDataSource.getRepository(Vendor)
        .createQueryBuilder("vendor")
        .select("vendor.id", "id")
        .where(new Brackets((where) => {
          where.where("vendor.businessName ILIKE :pattern", { pattern })
            .orWhere("vendor.email ILIKE :pattern", { pattern })
            .orWhere("vendor.phoneNumber ILIKE :pattern", { pattern });
        }))
        .getRawMany<{ id: number }>(),
    ]);

    return {
      userIds: users.map(({ id }) => Number(id)).filter(Number.isInteger),
      vendorIds: vendors.map(({ id }) => Number(id)).filter(Number.isInteger),
    };
  }

  private async resolveActors(logs: AuditLog[]): Promise<AuditLogWithActor[]> {
    const userActorTypes = [AuditActorType.ADMIN, AuditActorType.STAFF, AuditActorType.USER, AuditActorType.RIDER];
    const userIds = [...new Set(logs
      .filter((log) => log.actorId != null && userActorTypes.includes(log.actorType))
      .map((log) => log.actorId as number))];
    const vendorIds = [...new Set(logs
      .filter((log) => log.actorId != null && log.actorType === AuditActorType.VENDOR)
      .map((log) => log.actorId as number))];

    const [users, vendors] = await Promise.all([
      userIds.length
        ? AppDataSource.getRepository(User).find({
          where: { id: In(userIds) },
          select: { id: true, fullName: true, username: true, email: true, phoneNumber: true },
        })
        : [],
      vendorIds.length
        ? AppDataSource.getRepository(Vendor).find({
          where: { id: In(vendorIds) },
          select: { id: true, businessName: true, email: true, phoneNumber: true },
        })
        : [],
    ]);
    const usersById = new Map<number, User>((users as User[]).map((user): [number, User] => [user.id, user]));
    const vendorsById = new Map<number, Vendor>((vendors as Vendor[]).map((vendor): [number, Vendor] => [vendor.id, vendor]));

    return logs.map((log) => {
      if (log.actorType === AuditActorType.SYSTEM) {
        return { ...log, actor: { id: null, type: AuditActorType.SYSTEM, name: "System", email: null, phoneNumber: null, displayName: "System (SYSTEM)" } };
      }

      const user = log.actorId == null ? undefined : usersById.get(log.actorId);
      const vendor = log.actorId == null ? undefined : vendorsById.get(log.actorId);
      const name = vendor?.businessName?.trim()
        || user?.fullName?.trim()
        || user?.username?.trim()
        || user?.email?.trim()
        || vendor?.email?.trim()
        || "Deleted account";
      const email = vendor?.email ?? user?.email ?? null;
      const phoneNumber = vendor?.phoneNumber ?? user?.phoneNumber ?? null;

      return {
        ...log,
        actor: {
          id: log.actorId,
          type: log.actorType,
          name,
          email,
          phoneNumber,
          displayName: `${name} (${log.actorType})`,
        },
      };
    });
  }

  async list(query: AuditListQuery) {
    const builder = AppDataSource.getRepository(AuditLog)
      .createQueryBuilder("audit")
      .orderBy("audit.createdAt", "DESC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.module) builder.andWhere("audit.module = :module", { module: query.module });
    if (query.actorType) builder.andWhere("audit.actorType = :actorType", { actorType: query.actorType });
    if (query.entityType) builder.andWhere("audit.entityType = :entityType", { entityType: query.entityType });
    if (query.from) builder.andWhere("audit.createdAt >= :from", { from: query.from });
    if (query.to) builder.andWhere("audit.createdAt <= :to", { to: query.to });
    if (query.search) {
      const search = query.search.trim();
      const { userIds, vendorIds } = await this.findActorMatches(search);
      const userActorTypes = [AuditActorType.ADMIN, AuditActorType.STAFF, AuditActorType.USER, AuditActorType.RIDER];
      builder.andWhere(new Brackets((where) => {
        where.where("audit.summary ILIKE :search", { search: `%${search}%` })
          .orWhere("audit.action ILIKE :search", { search: `%${search}%` })
          .orWhere("audit.module ILIKE :search", { search: `%${search}%` })
          .orWhere("audit.entityType ILIKE :search", { search: `%${search}%` })
          .orWhere("audit.entityId ILIKE :search", { search: `%${search}%` });
        if (userIds.length) {
          where.orWhere("audit.actorType IN (:...userActorTypes) AND audit.actorId IN (:...userIds)", {
            userActorTypes,
            userIds,
          });
        }
        if (vendorIds.length) {
          where.orWhere("audit.actorType = :vendorActorType AND audit.actorId IN (:...vendorIds)", {
            vendorActorType: AuditActorType.VENDOR,
            vendorIds,
          });
        }
      }));
    }

    const [data, total] = await builder.getManyAndCount();
    return { data: await this.resolveActors(data), total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) };
  }
}
export const auditService = new AuditService();
