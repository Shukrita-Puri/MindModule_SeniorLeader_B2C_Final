import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { fetchMrsDailySeries } from '@/services/mrsDailySeries';

export interface MrsHistoryPoint {
  date: string; // YYYY-MM-DD (bucket start)
  score: number; // NaN when the bucket has no measured data
  label?: string;
}

export type MrsRangeDays = 30 | 180 | 365;

export interface MrsTrendData {
  history: MrsHistoryPoint[];
  delta: number | null;
  deltaLabel: string | null;
  caption: string;
  comparison: 'week' | 'yesterday' | 'month' | 'sixmonth' | 'year' | 'none';
  insufficient: boolean;
  baseline: number | null;
  baselineRange: { low: number; high: number } | null;
  trajectoryCaption: string;
  rangeDays: MrsRangeDays;
  /** Mean of measured buckets in the selected range (nulls excluded). */
  average: number | null;
  /** e.g. "20 Jul – 19 Aug 2026" */
  rangeLabel: string;
}

const dayMs = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

const shortDate = (d: Date, withYear = false) =>
  d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });

function captionFor(delta: number | null, comparison: MrsTrendData['comparison']): string {
  if (delta === null) return 'Building your trend history';
  if (comparison === 'yesterday') {
    if (delta >= 4) return 'Stronger than yesterday';
    if (delta <= -4) return 'Lower than yesterday';
    return 'Stable since yesterday';
  }
  if (delta >= 5) return 'Upward trend';
  if (delta <= -5) return 'Slight dip from your recent baseline';
  return 'Stable against your recent baseline';
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function useMrsTrend(
  currentScore: number | null | undefined,
  rangeDays: MrsRangeDays = 30,
) {
  const { user } = useAuth();
  const userId = DEV_MODE ? DEV_USER.id : user?.id ?? null;

  return useQuery<MrsTrendData>({
    queryKey: ['mrs-trend', userId, currentScore, rangeDays],
    enabled: true,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const rangeStart = new Date(today.getTime() - (rangeDays - 1) * dayMs);
      const todayIso = iso(today);

      // One source of truth: same daily values that colour the weekly dots.
      const { byDate } = await fetchMrsDailySeries(userId, iso(rangeStart), todayIso);
      if (typeof currentScore === 'number') byDate[todayIso] = currentScore;

      // ---- Bucketing -------------------------------------------------
      // 1M -> daily, 6M -> weekly, 1Y -> monthly
      const history: MrsHistoryPoint[] = [];
      const valueFor = (from: Date, to: Date): number | null => {
        const vals: number[] = [];
        for (let t = from.getTime(); t <= to.getTime(); t += dayMs) {
          const v = byDate[iso(new Date(t))];
          if (typeof v === 'number' && Number.isFinite(v)) vals.push(v);
        }
        return mean(vals);
      };

      if (rangeDays === 30) {
        for (let i = rangeDays - 1; i >= 0; i--) {
          const d = new Date(today.getTime() - i * dayMs);
          const v = byDate[iso(d)];
          history.push({
            date: iso(d),
            score: typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : NaN,
            label: shortDate(d),
          });
        }
      } else if (rangeDays === 180) {
        for (let w = 25; w >= 0; w--) {
          const end = new Date(today.getTime() - w * 7 * dayMs);
          const start = new Date(end.getTime() - 6 * dayMs);
          const v = valueFor(start, end);
          history.push({
            date: iso(start),
            score: v === null ? NaN : Math.round(v),
            label: shortDate(start),
          });
        }
      } else {
        for (let m = 11; m >= 0; m--) {
          const start = new Date(today.getFullYear(), today.getMonth() - m, 1);
          const end = new Date(today.getFullYear(), today.getMonth() - m + 1, 0);
          const v = valueFor(start, end > today ? today : end);
          history.push({
            date: iso(start),
            score: v === null ? NaN : Math.round(v),
            label: start.toLocaleDateString('en-GB', { month: 'short' }),
          });
        }
      }

      const measured = history.filter((p) => Number.isFinite(p.score));
      const average = measured.length ? Math.round(mean(measured.map((p) => p.score))!) : null;

      const seriesStart =
        rangeDays === 365
          ? new Date(today.getFullYear(), today.getMonth() - 11, 1)
          : rangeDays === 180
            ? new Date(today.getTime() - 25 * 7 * dayMs - 6 * dayMs)
            : rangeStart;
      const rangeLabel = `${shortDate(seriesStart)} – ${shortDate(today, true)}`;

      // ---- Delta / captions (daily values, unchanged semantics) -------
      const sorted = Object.entries(byDate)
        .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, score]) => ({ date, score }));

      const todayScore =
        typeof currentScore === 'number'
          ? currentScore
          : byDate[todayIso] ?? sorted[sorted.length - 1]?.score ?? null;

      const priors = sorted.filter((p) => p.date !== todayIso);
      const inWindow = (days: number) =>
        priors.filter((p) => {
          const dt = new Date(p.date).getTime();
          return dt >= today.getTime() - days * dayMs && dt < today.getTime();
        });

      let delta: number | null = null;
      let comparison: MrsTrendData['comparison'] = 'none';
      let deltaLabel: string | null = null;

      const compareWindowDays = rangeDays === 30 ? 7 : 30;
      const compareWindow = inWindow(compareWindowDays);
      const last7Prior = inWindow(7);

      if (todayScore !== null && compareWindow.length >= 3) {
        const m = mean(compareWindow.map((p) => p.score))!;
        delta = Math.round(todayScore - m);
        comparison = rangeDays === 30 ? 'week' : rangeDays === 180 ? 'sixmonth' : 'year';
        const periodLabel = rangeDays === 30 ? 'last week' : 'recent baseline';
        deltaLabel = `${delta >= 0 ? '+' : '−'}${Math.abs(delta)} vs ${periodLabel}`;
      } else if (todayScore !== null && last7Prior.length >= 3) {
        const m = mean(last7Prior.map((p) => p.score))!;
        delta = Math.round(todayScore - m);
        comparison = 'week';
        deltaLabel = `${delta >= 0 ? '+' : '−'}${Math.abs(delta)} vs last week`;
      } else if (todayScore !== null && priors.length >= 1) {
        const prev = priors[priors.length - 1];
        delta = Math.round(todayScore - prev.score);
        comparison = 'yesterday';
        deltaLabel = `${delta >= 0 ? '+' : '−'}${Math.abs(delta)} vs previous`;
      }

      const insufficient = priors.length < 2;
      const caption = captionFor(insufficient ? null : delta, comparison);

      const last30Prior = inWindow(30);
      let baseline: number | null = null;
      let baselineRange: { low: number; high: number } | null = null;
      if (last30Prior.length >= 3) {
        const m = mean(last30Prior.map((p) => p.score))!;
        const variance =
          last30Prior.reduce((s, p) => s + (p.score - m) ** 2, 0) / last30Prior.length;
        const std = Math.max(3, Math.sqrt(variance));
        baseline = Math.round(m);
        baselineRange = {
          low: Math.max(0, Math.round(m - std)),
          high: Math.min(100, Math.round(m + std)),
        };
      }

      const sixMonthPriors = priors.filter(
        (p) => new Date(p.date).getTime() >= today.getTime() - 180 * dayMs,
      );
      let trajectoryCaption = 'Building your 6-month trajectory';
      if (sixMonthPriors.length >= 14) {
        const half = Math.floor(sixMonthPriors.length / 2);
        const earlyMean = mean(sixMonthPriors.slice(0, half).map((p) => p.score))!;
        const lateMean = mean(sixMonthPriors.slice(half).map((p) => p.score))!;
        const diff = lateMean - earlyMean;
        if (diff >= 4) trajectoryCaption = 'Trending upward over 6 months';
        else if (diff <= -4) trajectoryCaption = 'Trending down over 6 months';
        else trajectoryCaption = 'Holding steady over 6 months';
      }

      return {
        history,
        delta: insufficient ? null : delta,
        deltaLabel: insufficient ? null : deltaLabel,
        caption,
        comparison,
        insufficient,
        baseline,
        baselineRange,
        trajectoryCaption,
        rangeDays,
        average,
        rangeLabel,
      };
    },
  });
}
