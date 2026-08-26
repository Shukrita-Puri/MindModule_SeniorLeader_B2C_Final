import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE } from '@/config/devMode';
import { getAuthToken } from '@/services/authTokenService';

/**
 * Canonical daily Mental Readiness series shared by BOTH the weekly streak dots
 * and the trend chart on Insights.
 *
 * Value for a date, in priority order:
 *   1. mean of every brief snapshot score recorded for that local date
 *   2. the day's check-in composite (0–100, pressure inverted)
 *   3. no value — a real gap, never invented
 */
export interface MrsDailySeries {
  /** date (YYYY-MM-DD) -> 0–100 value */
  byDate: Record<string, number>;
  /** dates whose value came from a brief snapshot (vs a check-in only) */
  briefDates: Set<string>;
}

type CheckinRow = {
  checkin_date?: string | null;
  clarity_level?: number | null;
  emotion_level?: number | null;
  pressure_level?: number | null;
  regulation_level?: number | null;
};

/** Local composite mirroring energyStateEngine.overallBalance. */
export function checkinComposite(c: CheckinRow): number | null {
  const toPct = (v: number | null | undefined) =>
    typeof v === 'number' ? ((v - 1) / 4) * 100 : null;
  const pressureInverted =
    typeof c.pressure_level === 'number' ? ((5 - c.pressure_level) / 4) * 100 : null;
  const parts = [
    toPct(c.clarity_level),
    toPct(c.emotion_level),
    pressureInverted,
    toPct(c.regulation_level),
  ].filter((v): v is number => typeof v === 'number');
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

/**
 * Thrown when the auth token is not yet available (native iOS keychain
 * hydration) or the edge function rejects the call. Callers MUST let this
 * bubble so React Query can retry — swallowing it produces permanently empty
 * dots/charts on cold app start.
 */
export class MrsSeriesAuthError extends Error {
  constructor(message = 'auth not ready') {
    super(message);
    this.name = 'MrsSeriesAuthError';
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (DEV_MODE) {
    const anon = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (anon) headers['Authorization'] = `Bearer ${anon}`;
  } else {
    const token = await getAuthToken();
    if (!token) throw new MrsSeriesAuthError('missing auth token for brief-history');
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}


const dayMs = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * brief-history caps `limit` at 100 rows per call, so long ranges are paged
 * backwards by shrinking `endDate` to the day before the oldest row returned.
 */
async function fetchBriefScores(
  startDate: string,
  endDate: string,
): Promise<Record<string, number[]>> {
  const out: Record<string, number[]> = {};
  try {
    const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID;
    if (!projectId) return out;
    const base = `https://${projectId}.supabase.co/functions/v1/brief-history`;
    const headers = await authHeaders();

    let cursorEnd = endDate;
    for (let page = 0; page < 8; page++) {
      if (cursorEnd < startDate) break;
      const url = `${base}?startDate=${startDate}&endDate=${cursorEnd}&limit=100`;
      const res = await fetch(url, { headers });
      if (res.status === 401 || res.status === 403) {
        throw new MrsSeriesAuthError(`brief-history ${res.status}`);
      }
      if (!res.ok) break;

      const json = await res.json();
      const rows: Array<{ local_date?: string; score?: number | null }> = json?.briefs || [];
      if (rows.length === 0) break;

      let oldest = cursorEnd;
      for (const r of rows) {
        if (!r?.local_date) continue;
        if (r.local_date < oldest) oldest = r.local_date;
        if (typeof r.score === 'number' && Number.isFinite(r.score)) {
          (out[r.local_date] ||= []).push(r.score);
        }
      }
      if (rows.length < 100) break;
      // step one day before the oldest row we just consumed
      cursorEnd = iso(new Date(new Date(`${oldest}T00:00:00Z`).getTime() - dayMs));
    }
  } catch (err) {
    console.error('[mrsDailySeries] brief-history fetch failed:', err);
  }
  return out;
}

async function fetchCheckinScores(
  userId: string | null | undefined,
  startDate: string,
  endDate: string,
): Promise<Record<string, number>> {
  const buckets: Record<string, number[]> = {};
  try {
    let rows: CheckinRow[] = [];
    if (DEV_MODE) {
      if (!userId) return {};
      const { data } = await supabase
        .from('daily_checkins')
        .select('checkin_date, clarity_level, emotion_level, pressure_level, regulation_level')
        .eq('user_id', userId)
        .gte('checkin_date', startDate)
        .lte('checkin_date', endDate);
      rows = data || [];
    } else {
      const token = await getAuthToken();
      if (!token) return {};
      const { data } = await supabase.functions.invoke('daily-checkins', {
        headers: { Authorization: `Bearer ${token}` },
        body: { action: 'GET_MONTHLY_LEVELS', startDate, endDate },
      });
      rows = data?.data || [];
    }
    for (const r of rows) {
      const d = r?.checkin_date;
      if (!d) continue;
      const c = checkinComposite(r);
      if (c === null) continue;
      (buckets[d] ||= []).push(c);
    }
  } catch (err) {
    console.error('[mrsDailySeries] check-in fetch failed:', err);
  }
  const out: Record<string, number> = {};
  for (const [d, vals] of Object.entries(buckets)) {
    out[d] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return out;
}

export async function fetchMrsDailySeries(
  userId: string | null | undefined,
  startDate: string,
  endDate: string,
): Promise<MrsDailySeries> {
  const [briefs, checkins] = await Promise.all([
    fetchBriefScores(startDate, endDate),
    fetchCheckinScores(userId, startDate, endDate),
  ]);

  const byDate: Record<string, number> = {};
  const briefDates = new Set<string>();
  for (const [d, vals] of Object.entries(briefs)) {
    if (vals.length === 0) continue;
    byDate[d] = vals.reduce((a, b) => a + b, 0) / vals.length;
    briefDates.add(d);
  }
  for (const [d, v] of Object.entries(checkins)) {
    if (byDate[d] === undefined) byDate[d] = v;
  }
  return { byDate, briefDates };
}
