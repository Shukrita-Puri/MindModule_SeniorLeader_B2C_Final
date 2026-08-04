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

    // Fallback: if profiles fields are still null, try onboarding_v8_responses
    let fallbackArchetype: string | null = null;
    let fallbackPressure: string[] | null = null;
    let fallbackGoals: string[] | null = null;

    if (!data.user_archetype || !data.pressure_profile || !data.protection_goals) {
      try {
        const { data: v8 } = await db
          .from('onboarding_v8_responses')
          .select('cos_profile, freetext_context, goals, stakes_chips')
          .eq('user_id', userId)
          .maybeSingle();
        if (v8) {
          fallbackArchetype = (v8.cos_profile as any)?.provisional_archetype?.name ?? null;
          const depletionPattern = (v8.cos_profile as any)?.cognitive_load_map?.primary_depletion_pattern;
          if (depletionPattern) fallbackPressure = [depletionPattern];
          else if (Array.isArray(v8.stakes_chips) && v8.stakes_chips.length) fallbackPressure = v8.stakes_chips;
          if (Array.isArray(v8.goals) && v8.goals.length) fallbackGoals = v8.goals;
        }
      } catch {
        // Non-critical fallback — silently ignore
      }
    }

    const value: StrategicContext = {
      pressure_profile: normalizeArray(data.pressure_profile) ?? fallbackPressure,
      protection_goals: normalizeArray(data.protection_goals) ?? fallbackGoals,
      user_archetype: (typeof data.user_archetype === 'string' ? data.user_archetype : null) ?? fallbackArchetype,
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