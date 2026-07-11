/**
 * Batch B follow-up — privacy: never log raw APNs tokens or their raw
 * prefixes. Log only an irreversible SHA-256 hash prefix, sufficient
 * for correlation across logs but not reversible to the token.
 */
export async function hashTokenPrefix(token: string, prefixChars = 12): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(token);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `sha256:${hex.substring(0, prefixChars)}`;
  } catch {
    // Never fall back to logging the raw token / raw prefix.
    return 'sha256:unavailable';
  }
}
