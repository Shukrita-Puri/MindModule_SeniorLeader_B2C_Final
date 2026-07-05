// Client-side twin of `supabase/functions/_shared/identity/redact-user-id.ts`.
// Kept intentionally separate (no shared module across web + edge) so this
// module has zero runtime dependencies and is safe to call from any hook.
//
// Same contract:
//   - deterministic
//   - non-reversible (FNV-1a 32-bit truncation)
//   - shape: `usr_<8hex>` (or `usr_none` for empty inputs)

export function redactUserId(id: string | null | undefined): string {
  if (!id) return 'usr_none';
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `usr_${hex}`;
}
