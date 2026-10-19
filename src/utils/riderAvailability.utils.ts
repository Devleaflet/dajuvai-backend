import { EntityManager } from "typeorm";
import { AssignmentStatus } from "../entities/deliveryAssignment.entity";

/** Assignments a rider is still carrying. Every other status is finished. */
export const ACTIVE_ASSIGNMENT_STATUSES = [
    AssignmentStatus.ASSIGNED,
    AssignmentStatus.PICKED_UP,
];

/**
 * Recomputes `Rider.onDelivery` from the rider's open assignments.
 *
 * The flag used to be toggled — true on assign, false on any delivery,
 * failure or reassignment — which was wrong as soon as a rider carried more
 * than one order: finishing the first marked them available while they were
 * still out with the rest, and reassigning an old order freed a rider who had
 * since taken another. Deriving it cannot drift.
 */
export async function syncRiderAvailability(
    manager: EntityManager,
    riderIds: Array<number | null | undefined>,
): Promise<void> {
    const ids = [...new Set(riderIds.filter((id): id is number => typeof id === "number"))];
    if (ids.length === 0) return;

    await manager.query(
        `UPDATE "riders" r
         SET "onDelivery" = EXISTS (
             SELECT 1 FROM "delivery_assignments" da
             WHERE da."riderId" = r.id AND da."assignmentStatus" = ANY($2)
         )
         WHERE r.id = ANY($1)`,
        [ids, ACTIVE_ASSIGNMENT_STATUSES],
    );
}
