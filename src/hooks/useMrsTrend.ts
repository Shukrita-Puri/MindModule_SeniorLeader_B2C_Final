import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/services/authTokenService';
import { DEV_MODE } from '@/config/devMode';

export interface MrsHistoryPoint {
  date: string; // YYYY-MM-DD
  score: number;
}

export interface MrsTrendData {
  history: MrsHistoryPoint[];
  delta: number | null;
  deltaLabel: string | null; // e.g. "+6 vs last week", "−4 vs yesterday"
  caption: string;            // human progression line
  comparison: 'week' | 'yesterday' | 'month' | 'sixmonth' | 'none';
  insufficient: boolean;      // <2 prior points
  baseline: number | null;    // 30-day mean (excluding today) — user's normal
  baselineRange: { low: number; high: number } | null; // ±1 std band
  trajectoryCaption: string;  // 6-month trajectory blurb
  rangeDays: number;
}

const dayMs = 24 * 60 * 60 * 1000;

function captionFor(delta: number | null, comparison: MrsTrendData['comparison']): string {
  if (delta === null) return 'Building your trend history';
  if (comparison === 'yesterday') {
    if (delta >= 4) return 'Stronger than yesterday';
    if (delta <= -4) return 'Lower than yesterday';
    return 'Stable since yesterday';
  }
  if (delta >= 5) return 'Upward trend this week';
  if (delta <= -5) return 'Slight dip from your recent baseline';
  return 'Stable over the past 7 days';
}

export function useMrsTrend(
  currentScore: number | null | undefined,
  rangeDays: 7 | 30 | 180 = 7,
) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<MrsTrendData>({
    queryKey: ['mrs-trend', userId, currentScore, rangeDays],
    enabled: true,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let rows: Array<{ score_date: string; score: number }> = [];
      try {
        const token = DEV_MODE ? null : await getAuthToken();
        const { data, error } = await supabase.functions.invoke('mental-fitness-scores', {
          body: { action: 'GET_SCORES', days: Math.max(rangeDays, 180) },
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!error && Array.isArray(data?.data)) {
          rows = data.data as Array<{ score_date: string; score: number }>;
        }
      } catch {
        // graceful fallback below
      }

      // Normalize ascending by date, dedupe by date keeping last value.
      const byDate = new Map<string, number>();
      for (const r of rows) {
        if (r?.score_date && typeof r.score === 'number') byDate.set(r.score_date, r.score);
      }
      const sorted = Array.from(byDate.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, score]) => ({ date, score }));

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const windowPoints: MrsHistoryPoint[] = [];
      for (let i = rangeDays - 1; i >= 0; i--) {
        const d = new Date(today.getTime() - i * dayMs);
        const iso = d.toISOString().slice(0, 10);
        const existing = byDate.get(iso);
        if (existing !== undefined) {
          windowPoints.push({ date: iso, score: existing });
        } else if (i === 0 && typeof currentScore === 'number') {
          windowPoints.push({ date: iso, score: currentScore });
        } else {
          windowPoints.push({ date: iso, score: NaN });
        }
      }

      // Compute delta. Prefer current score for today.
      const todayIso = today.toISOString().slice(0, 10);
      const todayScore =
        typeof currentScore === 'number'
          ? currentScore
          : byDate.get(todayIso) ?? sorted[sorted.length - 1]?.score ?? null;

      const priors = sorted.filter((p) => p.date !== todayIso);
      const last7Prior = priors.filter((p) => {
        const dt = new Date(p.date).getTime();
        return dt >= today.getTime() - 7 * dayMs && dt < today.getTime();
      });

      let delta: number | null = null;
      let comparison: MrsTrendData['comparison'] = 'none';
      let deltaLabel: string | null = null;

      // Pick comparison window based on selected range
      const compareWindowDays = rangeDays === 180 ? 30 : rangeDays === 30 ? 30 : 7;
      const compareWindow = priors.filter((p) => {
        const dt = new Date(p.date).getTime();
        return dt >= today.getTime() - compareWindowDays * dayMs && dt < today.getTime();
      });

      if (todayScore !== null && compareWindow.length >= 3) {
        const mean = compareWindow.reduce((s, p) => s + p.score, 0) / compareWindow.length;
        delta = Math.round(todayScore - mean);
        comparison = rangeDays === 180 ? 'sixmonth' : rangeDays === 30 ? 'month' : 'week';
        const periodLabel =
          rangeDays === 180 ? 'recent baseline' : rangeDays === 30 ? 'last month' : 'last week';
        deltaLabel = `${delta >= 0 ? '+' : '−'}${Math.abs(delta)} vs ${periodLabel}`;
      } else if (todayScore !== null && last7Prior.length >= 3) {
        const mean = last7Prior.reduce((s, p) => s + p.score, 0) / last7Prior.length;
        delta = Math.round(todayScore - mean);
        comparison = 'week';
        deltaLabel = `${delta >= 0 ? '+' : '−'}${Math.abs(delta)} vs last week`;
      } else if (todayScore !== null && priors.length >= 1) {
        const prev = priors[priors.length - 1];
        delta = Math.round(todayScore - prev.score);
        comparison = 'yesterday';
        deltaLabel = `${delta >= 0 ? '+' : '−'}${Math.abs(delta)} vs ${prev.date === new Date(today.getTime() - dayMs).toISOString().slice(0, 10) ? 'yesterday' : 'previous'}`;
      }

      const insufficient = priors.length < 2;
      const caption = captionFor(insufficient ? null : delta, comparison);

      // Baseline: 30-day mean (excluding today) + std band → "your normal"
      const last30Prior = priors.filter((p) => {
        const dt = new Date(p.date).getTime();
        return dt >= today.getTime() - 30 * dayMs && dt < today.getTime();
      });
      let baseline: number | null = null;
      let baselineRange: { low: number; high: number } | null = null;
      if (last30Prior.length >= 3) {
        const mean = last30Prior.reduce((s, p) => s + p.score, 0) / last30Prior.length;
        const variance =
          last30Prior.reduce((s, p) => s + (p.score - mean) ** 2, 0) / last30Prior.length;
        const std = Math.max(3, Math.sqrt(variance));
        baseline = Math.round(mean);
        baselineRange = {
          low: Math.max(0, Math.round(mean - std)),
          high: Math.min(100, Math.round(mean + std)),
        };
      }

      // 6-month trajectory caption
      const sixMonthPriors = priors.filter((p) => {
        const dt = new Date(p.date).getTime();
        return dt >= today.getTime() - 180 * dayMs;
      });
      let trajectoryCaption = 'Building your 6-month trajectory';
      if (sixMonthPriors.length >= 14) {
        const half = Math.floor(sixMonthPriors.length / 2);
        const earlyMean =
          sixMonthPriors.slice(0, half).reduce((s, p) => s + p.score, 0) / half;
        const lateMean =
          sixMonthPriors.slice(half).reduce((s, p) => s + p.score, 0) /
          (sixMonthPriors.length - half);
        const diff = lateMean - earlyMean;
        if (diff >= 4) trajectoryCaption = 'Trending upward over 6 months';
        else if (diff <= -4) trajectoryCaption = 'Trending down over 6 months';
        else trajectoryCaption = 'Holding steady over 6 months';
      }

      return {
        history: windowPoints,
        delta: insufficient ? null : delta,
        deltaLabel: insufficient ? null : deltaLabel,
        caption,
        comparison,
        insufficient,
        baseline,
        baselineRange,
        trajectoryCaption,
        rangeDays,
      };
    },
  });
}