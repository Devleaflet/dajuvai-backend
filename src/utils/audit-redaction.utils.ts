const secretKey = /password|token|secret|cookie|authorization|verification|reset.*code|otp|fcm|card|bank.*account|account.*number/i;

export function redactAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !secretKey.test(key))
    .map(([key, child]) => [key, redactAuditValue(child)]));
}
