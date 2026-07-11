/**
 * Batch B follow-up — privacy helper for edge functions.
 *
 * Returns an irreversible SHA-256 hex prefix suitable for correlating
 * a device token across logs without leaking any recoverable material.
 * The raw token and the raw first-12-chars prefix must never be logged.
 */
export async function hashTokenPrefix(token: string, prefixChars = 12): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(token);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `sha256:${hex.substring(0, prefixChars)}`;
  } catch {
    return "sha256:unavailable";
  }
}
