export type DeliveryAttemptResult<T> =
  | { status: "sent"; value: T; attempts: number }
  | { status: "skipped" | "failed"; attempts: number; error: string };

const retryDelaysMs = [100, 500] as const;

const permanentErrorPatterns = [
  /no active device token/i,
  /firebase is not configured/i,
  /smtp is not configured/i,
  /recipient email is unavailable/i,
  /invalid-registration-token/i,
  /registration-token-not-registered/i,
  /all device tokens are invalid/i,
  /invalid recipient/i,
];

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const isPermanentDeliveryError = (message: string): boolean =>
  permanentErrorPatterns.some((pattern) => pattern.test(message));

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * Makes at most three direct provider attempts. Permanent recipient/config
 * conditions stop immediately; callers can log failed results without ever
 * propagating them into the business request.
 */
export async function deliverWithRetry<T>(
  operation: () => Promise<T>,
): Promise<DeliveryAttemptResult<T>> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return { status: "sent", value: await operation(), attempts: attempt };
    } catch (error) {
      const message = errorMessage(error);
      if (isPermanentDeliveryError(message)) {
        return { status: "skipped", attempts: attempt, error: message };
      }
      if (attempt === 3) {
        return { status: "failed", attempts: attempt, error: message };
      }
      await delay(retryDelaysMs[attempt - 1]);
    }
  }
  throw new Error("Unreachable delivery retry state");
}
