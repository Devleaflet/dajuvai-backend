export const USER_DELETION_GRACE_DAYS = 30;

export enum UserDeletionStatus {
  ACTIVE = "ACTIVE",
  PENDING_DELETION = "PENDING_DELETION",
  DELETED = "DELETED",
}

export function getUserDeletionStatus(user: {
  deletionScheduledFor?: Date | null;
  deletionFinalizedAt?: Date | null;
}): UserDeletionStatus {
  if (user.deletionFinalizedAt) return UserDeletionStatus.DELETED;
  if (user.deletionScheduledFor) return UserDeletionStatus.PENDING_DELETION;
  return UserDeletionStatus.ACTIVE;
}

export function getUserDeletionDeadline(requestedAt: Date): Date {
  return new Date(
    requestedAt.getTime() + USER_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
  );
}

export function isUserDeletionGracePeriodActive(
  requestedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!requestedAt) return false;
  return now.getTime() < getUserDeletionDeadline(requestedAt).getTime();
}
