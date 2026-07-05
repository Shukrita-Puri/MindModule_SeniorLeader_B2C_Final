/**
 * Apple multi-source collapse.
 *
 * Apple EventKit surfaces the SAME logical event once per calendar "source"
 * (personal iCloud + shared iCloud + Google-in-Apple + Exchange, etc.). Each
 * row carries a distinct `<sourceUUID>:...` external_id but an identical
 * `identity_key` (title | start-minute | duration). Left alone that produces
 * the Apple-only `identity_key` collisions that blocked enforcing UNIQUE
 * (user_id, identity_key) on `calendar_events`.
 *
 * This helper collapses those mirrors at write time by grouping on
 * `identity_key` and keeping a deterministic winner (lex-min external_id, so
 * retries are stable). Rows whose `identity_key` is null (missing title /
 * times) are passed through unchanged.
 *
 * NOTE: this DOES NOT replace `mergeCalendarEvents`. Cross-provider
 * Apple↔Google mirrors are still fused at read time by that function using
 * fuzzy title/time/attendee matching a stable string key cannot express.
 *
 * Mirrored to src/utils/rules/apple-source-collapse.ts. KEEP IN SYNC.
 */
export interface CollapseInput {
  external_id: string;
  identity_key: string | null;
  [k: string]: unknown;
}

export function collapseAppleMultiSource<T extends CollapseInput>(rows: T[]): T[] {
  const byIdentity = new Map<string, T>();
  const noIdentity: T[] = [];
  for (const row of rows) {
    if (!row.identity_key) {
      noIdentity.push(row);
      continue;
    }
    const prev = byIdentity.get(row.identity_key);
    if (!prev || row.external_id < prev.external_id) {
      byIdentity.set(row.identity_key, row);
    }
  }
  return [...byIdentity.values(), ...noIdentity];
}