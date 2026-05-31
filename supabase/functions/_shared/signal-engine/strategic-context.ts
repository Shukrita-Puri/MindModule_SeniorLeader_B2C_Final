// MRS v2 — Strategic context resolver.
//
// Reads profiles.pressure_profile / protection_goals / user_archetype and
// returns a null-safe object. Cached for 24h per user_id (in-process; safe
// for edge-function instance lifecycle).
//
// Strategic context never changes the numeric readiness score — it only
// flows into the brief LLM prompt and into plan protocol selection.

import type { StrategicContext } from './types.ts';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { value: StrategicContext; expires: number }>();

type AnySupabase = {
  from: (table: string) => any;
};

export async function resolveStrategicContext(
  db: AnySupabase,
  userId: string,
): Promise<StrategicContext> {
  const hit = cache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.value;

  const empty: StrategicContext = {
    pressure_profile: null,
    protection_goals: null,
    user_archetype: null,
  };

  try {
    const { data, error } = await db
      .from('profiles')
      .select('pressure_profile, protection_goals, user_archetype')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) {
      cache.set(userId, { value: empty, expires: Date.now() + CACHE_TTL_MS });
      return empty;
    }

    const value: StrategicContext = {
      pressure_profile: normalizeArray(data.pressure_profile),
      protection_goals: normalizeArray(data.protection_goals),
      user_archetype: typeof data.user_archetype === 'string' ? data.user_archetype : null,
    };
    cache.set(userId, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  } catch {
    return empty;
  }
}

function normalizeArray(v: unknown): string[] | null {
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v.length ? v : null;
  return null;
}

/** For tests / manual invalidation. */
export function clearStrategicContextCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}