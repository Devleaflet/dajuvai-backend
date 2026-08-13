export const DELIVERY_RETRY_DELAYS_MINUTES = [1, 5, 30, 120, 720] as const;

export function buildDeliveryIdempotencyKey(input: {
  eventType: string;
  recipientType: string;
  recipientId: number;
  channel: string;
  subjectId: string;
}): string {
  return `${input.eventType}:${input.recipientType}:${input.recipientId}:${input.channel}:${input.subjectId}`;
}

export function getNextDeliveryAttempt(
  attemptCount: number,
  now: Date = new Date(),
): Date | null {
  const delayMinutes = DELIVERY_RETRY_DELAYS_MINUTES[attemptCount - 1];
  if (delayMinutes === undefined) return null;
  return new Date(now.getTime() + delayMinutes * 60 * 1000);
}
