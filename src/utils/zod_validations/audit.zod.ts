import { z } from "zod";
import { AuditActorType } from "../../entities/auditLog.entity";

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(10).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  module: z.string().trim().max(40).optional(),
  actorType: z.nativeEnum(AuditActorType).optional(),
  entityType: z.string().trim().max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine(({ from, to }) => !from || !to || from <= to, {
  message: "from must be before to",
  path: ["to"],
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
