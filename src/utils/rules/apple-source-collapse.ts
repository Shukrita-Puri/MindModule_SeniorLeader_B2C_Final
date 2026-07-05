/**
 * Apple multi-source collapse (frontend mirror).
 * Canonical helper lives in supabase/functions/_shared/rules/apple-source-collapse.ts.
 * KEEP IN SYNC.
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