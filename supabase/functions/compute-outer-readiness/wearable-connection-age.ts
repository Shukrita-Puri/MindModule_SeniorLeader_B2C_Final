export function safeDaysSince(
  value: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((nowMs - timestamp) / 86_400_000));
}

export function deriveWearableDaysConnected(input: {
  connectedAt?: string | null;
  fallbackConnectedAt?: string | null;
  isConnected: boolean;
  nowMs?: number;
}): number | null {
  if (!input.isConnected) return null;
  return safeDaysSince(
    input.connectedAt ?? input.fallbackConnectedAt ?? null,
    input.nowMs,
  );
}
