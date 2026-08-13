export const VENDOR_DELETION_GRACE_DAYS = 30;

export function getVendorDeletionDeadline(requestedAt: Date): Date {
  return new Date(
    requestedAt.getTime() + VENDOR_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
  );
}

export function isVendorDeletionGracePeriodActive(
  requestedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!requestedAt) return false;
  return now.getTime() < getVendorDeletionDeadline(requestedAt).getTime();
}
