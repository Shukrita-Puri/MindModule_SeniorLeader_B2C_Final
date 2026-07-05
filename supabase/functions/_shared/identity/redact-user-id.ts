// Shared identity redaction helper for server-side logs.
//
// Goal: preserve the ability to correlate log lines for a single user
// without persisting the raw Auth0 `sub` (or any equivalent user
// identifier) in log storage. The output is:
//   - deterministic  (same input → same output within a process)
//   - non-reversible (32-bit FNV-1a truncation; no key/secret needed)
//   - lightweight    (pure, no imports, safe to call from any function)
//
// The output format is `usr_<8hex>` so it is visually distinct from
// real user ids and easy to grep for across logs. `null`/`undefined`/
// empty inputs render as `usr_none` so callers never leak an empty
// slot that could be confused with a live id.

export function redactUserId(id: string | null | undefined): string {
  if (!id) return "usr_none";
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `usr_${hex}`;
}
