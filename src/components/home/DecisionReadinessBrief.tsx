/**
 * PerformanceReadinessBrief – unified card replacing TodayStateCard + StrategicIntentionCard
 * Variant A only: interpretation chips with tap-to-flip number reveal.
 * 
 * Signal Pill Contract (from PERFORMANCE_READINESS_BRIEF_LOGIC.md §7):
 *   Priority: 1.Calendar → 2.HRV → 3.Sleep → 4.RHR → 5.Mind Sharpness → 6.Clarity & Confidence
 *   Every pill has: front (analysis) + back (evidence)
 *   All states render (green/amber/red) — not only threshold-breakers
 *   Mind Sharpness pill: Stage 1 outcome (Focused/Steady/Scattered/Drained/Depleted)
 *   Clarity & Confidence pill: Stage 2 C×C matrix (analysis front, raw scores back)
 *   Patterns are inlined on relevant pills — no separate pattern chip
 *   No raw numbers on front of any pill — front is always analysis
 *   No icon on pills — hint text is sufficient affordance
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOuterReadiness } from '@/hooks/useOuterReadiness';
import { cn } from '@/lib/utils';
import { ChevronDown, Brain, BatteryMedium, ShieldCheck, CalendarDays, Clock, CalendarPlus, type LucideIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// ─── TYPES ───
interface SignalChip {
  id: string;
  label: string;        // Interpretation text (front)
  backLabel?: string;    // Number text (back)
  color: 'red' | 'amber' | 'green' | 'neutral';
  qualifier?: string;    // e.g. "· unusual for you"
}

// ─── HELPERS ───
// Self-declared label maps (mirror /check-in-detail sliders)
const SHARPNESS_LABELS = ['Depleted', 'Dull', 'Stable', 'Acute', 'Peak'];
const CLARITY_LABELS   = ['Clouded', 'Obscured', 'Neutral', 'Lucid', 'Crystal'];
const CONFIDENCE_LABELS = ['Reactive', 'Uncertain', 'Poised', 'Certain', 'Unshakable'];
const fmtScored = (label: string, score: number) => `${label} [score ${score}/5]`;
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const getTierColor = (tier: string): string => {
  switch (tier) {
    case 'depleted': return 'text-[hsl(var(--state-depleted))]';
    case 'managing': return 'text-[hsl(var(--saffron))]';
    case 'strong':
    case 'peak': return 'text-[hsl(var(--kairos))]';
    default: return 'text-muted-foreground';
  }
};

const getTierLabel = (tier: string): string => {
  switch (tier) {
    case 'depleted': return 'LOW RESERVE';
    case 'managing': return 'MODERATE';
    case 'strong': return 'STRONG';
    case 'peak': return 'PEAK';
    default: return 'NOT ASSESSED';
  }
};

const getTimeLabel = (): string => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 18) return 'Afternoon';
  return 'Evening';
};

const getDateLabel = (): string => {
  const d = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
};

const chipBgColor = (color: SignalChip['color']) => {
  switch (color) {
    case 'red': return 'bg-gradient-to-r from-red-200 to-red-100 text-red-700 shadow-[0_2px_8px_rgba(239,68,68,0.10)] border-0';
    case 'amber': return 'bg-gradient-to-r from-amber-200 to-amber-100 text-amber-700 shadow-[0_2px_8px_rgba(245,158,11,0.10)] border-0';
    case 'green': return 'bg-gradient-to-r from-emerald-200 to-emerald-100 text-emerald-700 shadow-[0_2px_8px_rgba(16,185,129,0.10)] border-0';
    default: return 'bg-muted/40 text-muted-foreground/70 border-border/20';
  }
};

// Calendar load pill color based on load level
const calendarLoadPillStyle = (load: string) => {
  switch (load) {
    case 'high': return 'bg-gradient-to-r from-red-200 to-red-100 text-red-700 shadow-[0_2px_8px_rgba(239,68,68,0.08)] border-0';
    case 'medium': return 'bg-gradient-to-r from-amber-200 to-amber-100 text-amber-700 shadow-[0_2px_8px_rgba(245,158,11,0.08)] border-0';
    default: return 'bg-gradient-to-r from-emerald-200 to-emerald-100 text-emerald-700 shadow-[0_2px_8px_rgba(16,185,129,0.08)] border-0';
  }
};

// Event pill style — light taupe gradient
const eventPillStyle = 'bg-gradient-to-r from-[hsl(var(--taupe)/.15)] to-[hsl(var(--taupe)/.08)] text-foreground/80 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-[hsl(var(--taupe)/.20)]';

// (Lean on / Watch for pill styles removed — now rendered as plain text)

// Map leanOnSource keys to human-readable source labels
const getSourceLabel = (source: string | undefined): string => {
  if (!source) return '';
  switch (source) {
    case 'llm-v4': return '';
    case 'coach-insights-recent':
    case 'coach-insights-grace': return 'From coach';
    case 'cc-modifier':
    case 'cc-modifier-with-context': return 'From Mental Energy';
    case 'coach-partial-strength':
    case 'coach-partial-growth': return 'Coach + archetype';
    case 'archetype-tier': return 'From archetype';
    case 'tier-fallback': return 'From readiness';
    case 'dow-pattern': return 'From pattern';
    case 'hrv-correlation': return 'From data';
    case 'score-trajectory': return 'From pattern';
    default: return '';
  }
};

// Parse signal · source pair format from LLM v4
interface SignalSourcePair {
  signal: string;
  source: string;
}

function parseSignalSourcePairs(text: string): SignalSourcePair[] | null {
  const lines = text.split('\n').filter(l => l.trim());
  const pairs: SignalSourcePair[] = [];
  for (const line of lines) {
    const sepIdx = line.lastIndexOf(' · ');
    if (sepIdx > 0) {
      let signal = line.substring(0, sepIdx).trim();
      const source = line.substring(sepIdx + 3).trim();
      // Enforce max 5 words on signal — 2-4 word Chief of Staff signals + buffer
      const words = signal.split(/\s+/);
      if (words.length > 5) signal = words.slice(0, 5).join(' ');
      pairs.push({ signal, source });
    } else if (line.length > 40) {
      // Prose guard: truncate long lines without separator
      const words = line.trim().split(/\s+/).slice(0, 8).join(' ');
      pairs.push({ signal: words, source: 'System' });
    } else if (line.trim()) {
      pairs.push({ signal: line.trim(), source: 'System' });
    }
  }
  return pairs.length > 0 ? pairs : null;
}

// ─── WEARABLE TIER ───
type WearableTier = 'none' | 'absolute' | 'partial' | 'full';

function getWearableTier(outerBrief: any): WearableTier {
  // Use wearableStatus as the canonical source (not legacy hasWearable)
  const ws = outerBrief?.wearableStatus;
  if (!ws?.isConnected || (!ws?.hasTodayData && !ws?.hasRecentData)) return 'none';
  const days = outerBrief?.wearableDaysConnected ?? 0;
  const hasHistorical = outerBrief?.hasHistoricalData ?? false;
  if (days >= 7 || hasHistorical) return 'full';
  if (days >= 3) return 'partial';
  if (days >= 1) return 'absolute';
  return 'none';
}

// ─── FORMAT HELPERS ───
function fmtSleepDur(mins: number): string {
  const hrs = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${hrs}h ${m}m` : `${hrs}h`;
}

function devSign(d: number): string {
  return d >= 0 ? `+${d}%` : `${d}%`;
}

// ─── DOC-ALIGNED CHIP BUILDER ───
// Follows §7 of PERFORMANCE_READINESS_BRIEF_LOGIC.md
// Priority: HRV → Sleep → RHR → Mind (unified) → inline patterns on each
// Every metric renders at all states (green/amber/red), not only when thresholds crossed
// Patterns are appended as qualifiers on the relevant pill — no separate pattern chip
function buildSignalChips(
  outerBrief: any,
  checkInCountTotal: number,
): SignalChip[] {
  const chips: SignalChip[] = [];
  const checkInOutcome = outerBrief?.checkInOutcome as string | null;
  const hasCheckIn = !!checkInOutcome;
  const tier = getWearableTier(outerBrief);
  const wearableDataSource = outerBrief?.wearableDataSource ?? null;
  const isAppleHealth = wearableDataSource === 'apple-healthkit';
  const wearableDays = outerBrief?.wearableDaysConnected ?? 0;

  // Debug: log wearable data availability
  console.log('[buildSignalChips] wearable debug:', {
    tier, wearableStatus: outerBrief?.wearableStatus, wearableDataSource,
    hrvValue: outerBrief?.hrvValue, sleepDuration: outerBrief?.sleepDuration,
    rhrValue: outerBrief?.rhrValue, sleepScore: outerBrief?.sleepScore,
  });

  if (!hasCheckIn) {
    const promptChips: SignalChip[] = [{ id: 'no-checkin', label: 'Check in to unlock your state', color: 'neutral' }];
    if (tier === 'none') {
      promptChips.push({ id: 'wearable-prompt', label: 'Connect wearable', color: 'neutral' });
    }
    return promptChips;
  }

  // ── Pattern data (used inline) ──
  const wearableTrend = outerBrief?.wearableTrend7d as string | null;
  const hrvCorrelation = outerBrief?.hrvEventCorrelation as string | null;
  const scoreTrajectory = outerBrief?.scoreTrajectory7d as string | null;
  const consecLowConf = outerBrief?.consecutiveLowConfidence ?? 0;
  const consecLowClarity = outerBrief?.consecutiveLowClarity ?? 0;
  const typicalDOW = outerBrief?.typicalDOWScore as number | null;
  const score = outerBrief?.innerReadinessScore ?? null;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayName = dayNames[new Date().getDay()];

  // Track which pattern has been used so we don't double up
  let wearablePatternUsed = false;

  // ── Qualifier helpers ──
  const tierSuffix = tier === 'absolute' ? ' · establishing baseline' : tier === 'partial' ? ' · early reading' : '';

  const getLongQualifier = (isWorst10?: boolean, isBest7d?: boolean): string => {
    if (tier !== 'full') return '';
    if (isAppleHealth && wearableDays < 14) return '';
    if (checkInCountTotal < 7) return '';
    if (isWorst10) return checkInCountTotal >= 15 ? ' · unusual for you' : ' · unusual this week';
    if (isBest7d) return ' · best this week';
    return '';
  };

  // ── Baselines ──
  const hrvBaseline = outerBrief?.hrvBaseline;
  const sleepBaseline = outerBrief?.sleepBaseline;
  const rhrBaseline = outerBrief?.rhrBaseline;

  // ────────────────────────────────────────
  // §7.1  HEART PILL — merged HRV + RHR
  // Front: analysis word from worst-of state
  // Back: combined raw metrics with baselines
  // ────────────────────────────────────────
  const hrvVal = outerBrief?.hrvValue as number | null;
  const hrvDev = outerBrief?.hrvDeviation as number | null;
  const rhrVal = outerBrief?.rhrValue as number | null;
  const rhrDev = outerBrief?.rhrDeviation as number | null;

  if (hrvVal != null || rhrVal != null) {
    // Derive individual tiers
    type HTier = 'red' | 'amber' | 'green';
    let hrvTier: HTier = 'green';
    if (hrvVal != null) {
      if (hrvDev != null) {
        if (hrvDev < -15) hrvTier = 'red';
        else if (hrvDev < -5) hrvTier = 'amber';
      } else {
        if (hrvVal < 20) hrvTier = 'red';
        else if (hrvVal < 40) hrvTier = 'amber';
      }
    }
    let rhrTier: HTier = 'green';
    if (rhrVal != null) {
      if (rhrDev != null) {
        if (rhrDev > 20) rhrTier = 'red';
        else if (rhrDev > 10) rhrTier = 'amber';
      } else {
        if (rhrVal > 90) rhrTier = 'red';
        else if (rhrVal > 80) rhrTier = 'amber';
      }
    }

    // Worst-of determines front label
    const worstTier: HTier = hrvTier === 'red' || rhrTier === 'red' ? 'red'
      : hrvTier === 'amber' || rhrTier === 'amber' ? 'amber' : 'green';

    let frontLabel: string;
    if (worstTier === 'red' && rhrTier === 'red') {
      frontLabel = 'Heart elevated';
    } else if (worstTier === 'red') {
      frontLabel = 'Heart strained';
    } else if (worstTier === 'amber' && hrvDev != null && hrvDev < -5) {
      frontLabel = 'Heart dipped';
    } else if (worstTier === 'amber') {
      frontLabel = 'Heart elevated';
    } else if (wearableTrend === 'improving') {
      frontLabel = 'Heart recovering';
    } else {
      frontLabel = 'Heart steady';
    }

    // Inline wearable pattern
    if (wearableTrend === 'declining' && !wearablePatternUsed) {
      frontLabel += ' · trend declining';
      wearablePatternUsed = true;
    } else if (wearableTrend === 'improving' && !wearablePatternUsed) {
      frontLabel += ' · trend improving';
      wearablePatternUsed = true;
    } else if (hrvCorrelation && !wearablePatternUsed) {
      frontLabel += ' · pattern detected';
      wearablePatternUsed = true;
    }

    const qualifier = tierSuffix;
    const color: SignalChip['color'] = worstTier;

    // Back label: combined raw metrics
    const parts: string[] = [];
    if (hrvVal != null) {
      let hrvPart = `HRV ${hrvVal}ms`;
      if (hrvDev != null && hrvBaseline) hrvPart += ` · ${devSign(hrvDev)} vs ${hrvBaseline}ms`;
      parts.push(hrvPart);
    }
    if (rhrVal != null) {
      let rhrPart = `RHR ${rhrVal}bpm`;
      if (rhrDev != null && rhrBaseline) rhrPart += ` · ${devSign(rhrDev)} vs ${rhrBaseline}bpm`;
      parts.push(rhrPart);
    }
    let backLabel = parts.join(' · ');
    if ((tier === 'absolute' || tier === 'partial') && !hrvBaseline && !rhrBaseline) {
      backLabel += ' · baseline building';
    }

    chips.push({ id: 'heart', label: frontLabel, backLabel, color, qualifier });
  }

  // ────────────────────────────────────────
  // §7.1  SLEEP PILL — analysis-only front, raw on back
  // ────────────────────────────────────────
  const sleepDur = outerBrief?.sleepDuration as number | null;
  const sleepScore = outerBrief?.sleepScore as number | null;
  const sleepDev = outerBrief?.sleepDeviation as number | null;

  if (sleepDur != null || sleepScore != null) {
    let frontLabel: string;
    let color: SignalChip['color'];
    const qualifier = tierSuffix;

    if (sleepDur != null && sleepDur < 360) {
      frontLabel = 'Short sleep';
      color = 'red';
    } else if (sleepScore != null && sleepScore < 60) {
      frontLabel = 'Poor sleep';
      color = 'red';
    } else if (sleepDev != null) {
      if (sleepDev < -15) {
        frontLabel = 'Sleep below baseline';
        color = 'red';
      } else if (sleepDev < -5) {
        frontLabel = 'Sleep slightly short';
        color = 'amber';
      } else if (sleepDev > 10) {
        frontLabel = 'Solid sleep';
        color = 'green';
      } else {
        frontLabel = 'Well-rested body';
        color = 'green';
      }
    } else if (sleepScore != null) {
      if (sleepScore < 70) { frontLabel = 'Fair sleep'; color = 'amber'; }
      else { frontLabel = 'Solid sleep'; color = 'green'; }
    } else if (sleepDur != null) {
      if (sleepDur < 420) { frontLabel = 'Sleep slightly short'; color = 'amber'; }
      else { frontLabel = 'Well-rested body'; color = 'green'; }
    } else {
      frontLabel = 'Sleep data';
      color = 'neutral';
    }

    // Inline wearable/score pattern on sleep if heart didn't use it
    if (scoreTrajectory === 'declining' && !wearablePatternUsed) {
      frontLabel += ' · score declining';
      wearablePatternUsed = true;
    } else if (scoreTrajectory === 'improving' && !wearablePatternUsed) {
      frontLabel += ' · score improving';
      wearablePatternUsed = true;
    }

    // Back label: raw metrics
    const backParts: string[] = [];
    if (sleepScore != null) backParts.push(`Sleep score ${sleepScore}`);
    if (sleepDur != null) {
      let durPart = fmtSleepDur(sleepDur);
      if (sleepDev != null && sleepBaseline) {
        durPart += ` · ${devSign(sleepDev)} vs ${fmtSleepDur(sleepBaseline)} baseline`;
      }
      backParts.push(durPart);
    }

    chips.push({ id: 'sleep', label: frontLabel, backLabel: backParts.join(' · ') || undefined, color, qualifier });
  }

  // ────────────────────────────────────────
  // §7.1  MIND SHARPNESS PILL — Stage 1 (Mental Energy outcome only)
  // Front: Focused / Steady / Scattered / Drained / Depleted
  // Back: Mental Energy: {outcome}
  // ────────────────────────────────────────
  const clarity = outerBrief?.clarityLevel as number | null;
  const confidence = outerBrief?.confidenceLevel as number | null;
  const outcome = checkInOutcome;

  // Outcome tier mapping
  const outcomeTier = (o: string | null): 'red' | 'amber' | 'green' | null => {
    if (!o) return null;
    if (['overwhelmed', 'drained'].includes(o)) return 'red';
    if (['scattered', 'anxious', 'frustrated'].includes(o)) return 'amber';
    if (['focused', 'steady', 'energised', 'calm'].includes(o)) return 'green';
    return 'amber';
  };

  // Map outcome to C-suite appropriate front label
  const outcomeToLabel = (o: string): string => {
    switch (o) {
      case 'focused': return 'Mind focused';
      case 'steady': return 'Mind steady';
      case 'scattered': return 'Mind scattered';
      case 'drained': return 'Mind drained';
      case 'overwhelmed': return 'Mind depleted';
      case 'energised': return 'Mind energised';
      case 'calm': return 'Mind calm';
      case 'anxious': return 'Mind anxious';
      case 'frustrated': return 'Mind frustrated';
      default: return 'Mind ' + o;
    }
  };

  if (outcome) {
    const oColor = outcomeTier(outcome) ?? 'green';
    chips.push({
      id: 'mind-sharpness',
      label: outcomeToLabel(outcome),
      backLabel: `Mental Energy: ${outcome}`,
      color: oColor,
    });
  }

  // ────────────────────────────────────────
  // §7.1  CLARITY & CONFIDENCE PILL — Stage 2 (C×C matrix)
  // Front: analysis words (High clarity, Sharp confidence, etc.)
  // Back: Clarity {x}/5 · Confidence {y}/5
  // ────────────────────────────────────────
  const ccTier = (c: number | null, co: number | null): 'red' | 'amber' | 'green' | null => {
    if (c == null && co == null) return null;
    if ((c != null && c <= 2) && (co != null && co <= 2)) return 'red';
    if ((c != null && c <= 2) || (co != null && co <= 2)) return 'amber';
    if ((c != null && c >= 4) && (co != null && co >= 4)) return 'green';
    return 'green';
  };

  if (clarity != null || confidence != null) {
    let ccFrontLabel: string;

    if (clarity != null && confidence != null) {
      if (clarity >= 4 && confidence >= 4) ccFrontLabel = 'High clarity · sharp confidence';
      else if (clarity >= 4 && confidence <= 2) ccFrontLabel = 'Clear but cautious';
      else if (clarity <= 2 && confidence >= 4) ccFrontLabel = 'Confident but foggy';
      else if (clarity <= 2 && confidence <= 2) ccFrontLabel = 'Low clarity · low confidence';
      else if (clarity >= 4) ccFrontLabel = 'High clarity';
      else if (clarity <= 2) ccFrontLabel = 'Low clarity';
      else if (confidence >= 4) ccFrontLabel = 'Sharp confidence';
      else if (confidence <= 2) ccFrontLabel = 'Low confidence';
      else ccFrontLabel = 'Moderate mind';
    } else if (clarity != null) {
      ccFrontLabel = clarity >= 4 ? 'High clarity' : clarity <= 2 ? 'Low clarity' : 'Moderate clarity';
    } else {
      ccFrontLabel = confidence! >= 4 ? 'Sharp confidence' : confidence! <= 2 ? 'Low confidence' : 'Moderate confidence';
    }

    // Inline pattern: consecutive low days
    let ccQualifier = '';
    if (consecLowConf >= 3) {
      const ordinal = consecLowConf === 3 ? '3rd' : `${consecLowConf}th`;
      ccQualifier = `${ordinal} day low confidence`;
    } else if (consecLowClarity >= 3) {
      const ordinal = consecLowClarity === 3 ? '3rd' : `${consecLowClarity}th`;
      ccQualifier = `${ordinal} day low clarity`;
    } else if (typicalDOW != null && score != null && score < typicalDOW - 10) {
      ccQualifier = `below ${todayName} levels`;
    } else if (typicalDOW != null && score != null && score > typicalDOW + 10) {
      ccQualifier = `above ${todayName} levels`;
    }

    const ccColor = ccTier(clarity, confidence) ?? 'green';
    const backParts: string[] = [];
    if (clarity != null) backParts.push(`Clarity ${clarity}/5`);
    if (confidence != null) backParts.push(`Confidence ${confidence}/5`);

    chips.push({
      id: 'clarity-confidence',
      label: ccFrontLabel,
      backLabel: backParts.join(' · '),
      color: ccColor,
      qualifier: ccQualifier || undefined,
    });
  }

  // ── Wearable fallback chips AFTER signal pills to preserve Mind/CC visibility ──
  const ws = outerBrief?.wearableStatus;
  if (!ws?.isConnected) {
    chips.push({ id: 'wearable-prompt', label: 'Connect wearable for full intelligence', color: 'neutral' });
  } else if (ws?.hasTodayData) {
    // Heart + Sleep pills already rendered above — no fallback needed
  } else if (ws?.hasRecentData) {
    chips.push({ id: 'wearable-recent', label: 'Based on recent data', color: 'neutral', qualifier: ws.sourceRowDate ? `Last sync: ${ws.sourceRowDate}` : undefined });
  } else if (ws?.isStale) {
    chips.push({ id: 'wearable-stale', label: 'Update wearable', color: 'neutral', qualifier: ws.sourceRowDate ? `Last sync: ${ws.sourceRowDate}` : undefined });
  } else {
    chips.push({ id: 'wearable-syncing', label: 'Waiting for wearable data', color: 'neutral' });
  }

  // Cap at 6 visible chips — signal pills (Heart, Sleep, Mind, CC) have priority over fallback
  return chips.slice(0, 6);
}

// ─── EXECUTIVE PILLS (3-capsule signal redesign) ───
type PillState = 'green' | 'amber' | 'red' | 'neutral';
type LineKind = 'wearable' | 'self';
interface PillLine { text: string; qualifier?: string; kind: LineKind }
interface ExecutivePill {
  id: 'cognitive' | 'physiological' | 'emotional';
  headline: string;
  signalWord: string;
  state: PillState;
  Icon: typeof Brain;
  topLines: PillLine[];      // wearable rows (top of glass box)
  bottomLines: PillLine[];   // self-declared rows (bottom of glass box)
  topEmptyText?: string;
  bottomEmptyText?: string;
}

const worstOf = (states: PillState[]): PillState => {
  if (states.includes('red')) return 'red';
  if (states.includes('amber')) return 'amber';
  if (states.includes('green')) return 'green';
  return 'neutral';
};

// ─── SIGNAL PILL REALIGNMENT v2 ───
// Severity-aware tier composition with strong-red override + median fallback.
// Inputs are weighted contributions, not flat tiers, so a single mild amber
// cannot dominate a pillar.
type ContribTier = 'red' | 'amber' | 'green' | 'neutral';
type Severity = 'strong' | 'mild' | 'normal';
interface PillarContrib { tier: ContribTier; severity?: Severity; weight?: number }

// Median-of-tiers fallback (treats neutral as missing). Ties break upward toward worse.
const medianTier = (contribs: PillarContrib[]): PillState => {
  const order: Record<Exclude<ContribTier, 'neutral'>, number> = { green: 0, amber: 1, red: 2 };
  const vals = contribs
    .filter(c => c.tier !== 'neutral')
    .map(c => order[c.tier as Exclude<ContribTier, 'neutral'>]);
  if (vals.length === 0) return 'neutral';
  vals.sort((a, b) => a - b);
  // Upper-median: bias toward the more concerning signal on ties
  const med = vals[Math.ceil((vals.length - 1) / 2)];
  return med === 2 ? 'red' : med === 1 ? 'amber' : 'green';
};

// Compose pillar state: strong-red on any input forces RED; otherwise median.
const composePillar = (contribs: PillarContrib[]): PillState => {
  const hasStrongRed = contribs.some(c => c.tier === 'red' && c.severity === 'strong');
  if (hasStrongRed) return 'red';
  return medianTier(contribs);
};

function buildExecutivePills(outerBrief: any): ExecutivePill[] | null {
  const checkInOutcome = outerBrief?.checkInOutcome as string | null;
  if (!checkInOutcome) return null;

  const tier = getWearableTier(outerBrief);
  const wearableConnected = !!outerBrief?.wearableStatus?.isConnected;
  const wearableTrend = outerBrief?.wearableTrend7d as string | null;
  const scoreTrajectory = outerBrief?.scoreTrajectory7d as string | null;

  // Raw signals
  const hrvVal = outerBrief?.hrvValue as number | null;
  const hrvDev = outerBrief?.hrvDeviation as number | null;
  const hrvBaseline = outerBrief?.hrvBaseline as number | null;
  const rhrVal = outerBrief?.rhrValue as number | null;
  const rhrDev = outerBrief?.rhrDeviation as number | null;
  const rhrBaseline = outerBrief?.rhrBaseline as number | null;
  const sleepDur = outerBrief?.sleepDuration as number | null;
  const sleepScore = outerBrief?.sleepScore as number | null;
  const sleepDev = outerBrief?.sleepDeviation as number | null;
  const sleepBaseline = outerBrief?.sleepBaseline as number | null;
  const clarity = outerBrief?.clarityLevel as number | null;
  const confidence = outerBrief?.confidenceLevel as number | null;
  const sharpness = outerBrief?.mentalSharpnessLevel as number | null;
  const consecLowConf = outerBrief?.consecutiveLowConfidence ?? 0;
  const consecLowClarity = outerBrief?.consecutiveLowClarity ?? 0;

  // ── HRV contribution — Cognitive (primary, standard thresholds) ──
  const hrvCognitiveContrib = (): PillarContrib => {
    if (hrvVal == null) return { tier: 'neutral' };
    if (hrvDev != null) {
      if (hrvDev <= -20) return { tier: 'red', severity: 'strong' };
      if (hrvDev < -15) return { tier: 'red', severity: 'mild' };
      if (hrvDev < -8) return { tier: 'amber' };
      return { tier: 'green' };
    }
    if (hrvVal < 20) return { tier: 'red', severity: 'mild' };
    if (hrvVal < 40) return { tier: 'amber' };
    return { tier: 'green' };
  };

  // ── HRV contribution — Resilience (secondary, stricter thresholds) ──
  const hrvResilienceContrib = (): PillarContrib => {
    if (hrvVal == null) return { tier: 'neutral' };
    if (hrvDev != null) {
      if (hrvDev <= -25) return { tier: 'red', severity: 'strong' };
      if (hrvDev < -20) return { tier: 'red', severity: 'mild' };
      if (hrvDev < -15) return { tier: 'amber' };
      return { tier: 'green' };
    }
    if (hrvVal < 18) return { tier: 'red', severity: 'mild' };
    if (hrvVal < 35) return { tier: 'amber' };
    return { tier: 'green' };
  };

  // ── Sleep contribution (Physiology) ──
  const sleepContrib = (): PillarContrib => {
    if (sleepDur == null && sleepScore == null) return { tier: 'neutral' };
    // Hard floor: < 5h is always strong RED
    if (sleepDur != null && sleepDur < 300) return { tier: 'red', severity: 'strong' };
    if (sleepDur != null && sleepDur < 360) return { tier: 'red', severity: 'mild' };
    if (sleepScore != null && sleepScore < 60) return { tier: 'red', severity: 'mild' };
    if (sleepDev != null && sleepDev < -15) return { tier: 'red', severity: 'mild' };
    if (sleepDev != null && sleepDev < -8) return { tier: 'amber' };
    if (sleepScore != null && sleepScore < 70) return { tier: 'amber' };
    if (sleepDur != null && sleepDur < 420) return { tier: 'amber' };
    return { tier: 'green' };
  };

  // ── RHR contribution (Physiology) ──
  const rhrContrib = (): PillarContrib => {
    if (rhrVal == null) return { tier: 'neutral' };
    if (rhrDev != null) {
      if (rhrDev > 20) return { tier: 'red', severity: 'strong' };
      if (rhrDev > 10) return { tier: 'amber' };
      return { tier: 'green' };
    }
    if (rhrVal > 90) return { tier: 'red', severity: 'mild' };
    if (rhrVal > 80) return { tier: 'amber' };
    return { tier: 'green' };
  };

  // ── HR-elevated proxy (Physiology, sympathetic dominance) ──
  // No dedicated heart_rate column yet; proxy from significant RHR elevation.
  const hrElevatedContrib = (): PillarContrib => {
    if (rhrDev == null) return { tier: 'neutral' };
    if (rhrDev > 25) return { tier: 'red', severity: 'mild' };
    if (rhrDev > 15) return { tier: 'amber' };
    return { tier: 'green' };
  };

  // ── Slider contribs ──
  const sharpnessContrib = (): PillarContrib => {
    if (sharpness == null) return { tier: 'neutral' };
    if (sharpness === 1) return { tier: 'red', severity: 'strong' };
    if (sharpness === 2) return { tier: 'red', severity: 'mild' };
    if (sharpness === 3) return { tier: 'amber' };
    return { tier: 'green' };
  };
  const clarityContrib = (): PillarContrib => {
    if (clarity == null) return { tier: 'neutral' };
    if (clarity <= 1) return { tier: 'red', severity: 'mild' };
    if (clarity <= 2) return { tier: 'red', severity: 'mild' };
    if (clarity === 3) return { tier: 'amber' };
    return { tier: 'green' };
  };
  const confidenceContrib = (): PillarContrib => {
    if (confidence == null) return { tier: 'neutral' };
    if (confidence === 1) return { tier: 'red', severity: 'strong' };
    if (confidence === 2) return { tier: 'red', severity: 'mild' };
    if (confidence === 3) return { tier: 'amber' };
    return { tier: 'green' };
  };

  // ── Outcome routing — each outcome contributes to exactly ONE pillar ──
  const COGNITIVE_OUTCOMES = new Set(['scattered', 'focused']);
  const RESILIENCE_OUTCOMES = new Set(['overwhelmed', 'drained', 'steady', 'anxious', 'frustrated', 'calm', 'energised']);
  const cognitiveOutcomeContrib = (): PillarContrib => {
    if (!COGNITIVE_OUTCOMES.has(checkInOutcome) && checkInOutcome !== 'thriving') return { tier: 'neutral' };
    if (checkInOutcome === 'scattered') return { tier: 'red', severity: 'mild' };
    if (checkInOutcome === 'focused' || checkInOutcome === 'thriving') return { tier: 'green' };
    return { tier: 'neutral' };
  };
  const resilienceOutcomeContrib = (): PillarContrib => {
    if (!RESILIENCE_OUTCOMES.has(checkInOutcome) && checkInOutcome !== 'thriving') return { tier: 'neutral' };
    if (checkInOutcome === 'overwhelmed') return { tier: 'red', severity: 'strong' };
    if (checkInOutcome === 'drained') return { tier: 'red', severity: 'mild' };
    if (checkInOutcome === 'anxious' || checkInOutcome === 'frustrated') return { tier: 'amber' };
    if (checkInOutcome === 'steady' || checkInOutcome === 'calm' || checkInOutcome === 'energised' || checkInOutcome === 'thriving') return { tier: 'green' };
    return { tier: 'neutral' };
  };

  // ── COGNITIVE PILLAR ──
  // Inputs: HRV (primary) + Sharpness + Clarity + cognitive outcome
  const cogContribs: PillarContrib[] = [
    hrvCognitiveContrib(),
    sharpnessContrib(),
    clarityContrib(),
    cognitiveOutcomeContrib(),
  ];
  let cogState = composePillar(cogContribs);

  // ── Wearable Authority on Cognitive ──
  // MASKED_HIGH: HRV red + self-reports green/amber → cap at AMBER minimum
  // RECOVERY_UNDERWAY: HRV green + self-reports red → cap at AMBER (don't show fully red)
  const hrvCog = hrvCognitiveContrib();
  const selfContribs = [sharpnessContrib(), clarityContrib(), cognitiveOutcomeContrib()].filter(c => c.tier !== 'neutral');
  const selfWorst = selfContribs.length > 0
    ? (selfContribs.some(c => c.tier === 'red') ? 'red' : selfContribs.some(c => c.tier === 'amber') ? 'amber' : 'green')
    : 'neutral';
  let cogAuthorityFlag: 'masked-high' | 'recovery-underway' | null = null;
  if (hrvCog.tier === 'red' && (selfWorst === 'green' || selfWorst === 'amber')) {
    // Masked: system sees what user doesn't
    if (cogState === 'green') cogState = 'amber';
    cogAuthorityFlag = 'masked-high';
  } else if (hrvCog.tier === 'green' && selfWorst === 'red') {
    // Recovering: don't fully alarm
    if (cogState === 'red') cogState = 'amber';
    cogAuthorityFlag = 'recovery-underway';
  }

  // ── PHYSIOLOGY PILLAR ── pure body, no self-report, no outcome
  const physState = composePillar([sleepContrib(), rhrContrib(), hrElevatedContrib()]);

  // ── RESILIENCE PILLAR ──
  const emoState = composePillar([
    hrvResilienceContrib(),
    confidenceContrib(),
    resilienceOutcomeContrib(),
  ]);

  // ── Signal-word maps ──
  const cognitiveWord = (s: PillState): string => {
    if (s === 'red') return 'STRAINED';
    if (s === 'amber') return cogAuthorityFlag === 'masked-high' ? 'MASKED LOAD' : cogAuthorityFlag === 'recovery-underway' ? 'RECOVERING' : 'HIGH LOAD';
    if (s === 'green') return wearableTrend === 'improving' ? 'CALM' : 'STEADY';
    return 'BUILDING';
  };
  const physWord = (s: PillState): string => {
    if (s === 'red') return 'DEPLETED';
    if (s === 'amber') return 'FADING';
    if (s === 'green') return 'RESTED';
    return 'BUILDING';
  };
  const emoWord = (s: PillState): string => {
    if (s === 'red') return 'REACTIVE';
    if (s === 'amber') return 'STRAINED';
    if (s === 'green') return 'STEADY';
    return 'BUILDING';
  };

  // ── COGNITIVE display lines ──
  const cogTop: PillLine[] = [];
  if (hrvVal != null) {
    let q = '';
    if (hrvDev != null && hrvBaseline) q = `${devSign(hrvDev)} vs ${hrvBaseline}ms baseline`;
    if (wearableTrend === 'declining') q = q ? `${q} · trend declining` : 'trend declining';
    else if (wearableTrend === 'improving') q = q ? `${q} · trend improving` : 'trend improving';
    if (cogAuthorityFlag === 'masked-high') q = q ? `${q} · system signal ahead of felt state` : 'system signal ahead of felt state';
    cogTop.push({ text: `HRV ${hrvVal}ms`, qualifier: q || undefined, kind: 'wearable' });
  }
  const cogBottom: PillLine[] = [];
  if (sharpness != null && sharpness >= 1 && sharpness <= 5) {
    cogBottom.push({
      text: `Sharpness: ${fmtScored(SHARPNESS_LABELS[sharpness - 1], sharpness)}`,
      qualifier: scoreTrajectory === 'declining' ? 'score trending down' : scoreTrajectory === 'improving' ? 'score trending up' : undefined,
      kind: 'self',
    });
  }
  if (clarity != null && clarity >= 1 && clarity <= 5) {
    const q = consecLowClarity >= 3 ? `${consecLowClarity}th day low clarity` : undefined;
    cogBottom.push({ text: `Clarity: ${fmtScored(CLARITY_LABELS[clarity - 1], clarity)}`, qualifier: q, kind: 'self' });
  }
  if (COGNITIVE_OUTCOMES.has(checkInOutcome)) {
    cogBottom.push({ text: `Mental Energy: ${titleCase(checkInOutcome)}`, kind: 'self' });
  }

  // ── PHYSIOLOGY display lines ── body only
  const physTop: PillLine[] = [];
  if (sleepScore != null || sleepDur != null) {
    const parts: string[] = [];
    if (sleepScore != null) parts.push(`Sleep ${sleepScore}`);
    if (sleepDur != null) parts.push(fmtSleepDur(sleepDur));
    let q = '';
    if (sleepDev != null && sleepBaseline) q = `${devSign(sleepDev)} vs ${fmtSleepDur(sleepBaseline)} baseline`;
    if (scoreTrajectory === 'declining') q = q ? `${q} · trend declining` : 'trend declining';
    physTop.push({ text: parts.join(' · '), qualifier: q || undefined, kind: 'wearable' });
  }
  if (rhrVal != null) {
    let q = '';
    if (rhrDev != null && rhrBaseline) q = `${devSign(rhrDev)} vs ${rhrBaseline}bpm baseline`;
    if (rhrDev != null && rhrDev > 15) q = q ? `${q} · sympathetic dominance` : 'sympathetic dominance';
    physTop.push({ text: `RHR ${rhrVal}bpm`, qualifier: q || undefined, kind: 'wearable' });
  }
  const physBottom: PillLine[] = [];

  // ── RESILIENCE display lines ──
  const emoTop: PillLine[] = [];
  if (hrvVal != null) {
    let q = '';
    if (hrvDev != null && hrvBaseline) q = `${devSign(hrvDev)} vs ${hrvBaseline}ms baseline · buffer signal`;
    else q = 'autonomic buffer';
    emoTop.push({ text: `HRV ${hrvVal}ms`, qualifier: q || undefined, kind: 'wearable' });
  }
  const emoBottom: PillLine[] = [];
  if (confidence != null && confidence >= 1 && confidence <= 5) {
    const q = consecLowConf >= 3 ? `${consecLowConf}th day low confidence` : undefined;
    emoBottom.push({ text: `Confidence: ${fmtScored(CONFIDENCE_LABELS[confidence - 1], confidence)}`, qualifier: q, kind: 'self' });
  }
  if (RESILIENCE_OUTCOMES.has(checkInOutcome)) {
    emoBottom.push({ text: `Mental Energy: ${titleCase(checkInOutcome)}`, kind: 'self' });
  }

  const emptyWearable = !wearableConnected
    ? 'Connect wearable for full reading'
    : tier === 'none' ? 'Waiting for wearable data' : undefined;

  return [
    {
      id: 'cognitive',
      headline: 'COGNITIVE',
      signalWord: cognitiveWord(cogState),
      state: cogState,
      Icon: Brain,
      topLines: cogTop,
      bottomLines: cogBottom,
      topEmptyText: cogTop.length === 0 ? emptyWearable : undefined,
      bottomEmptyText: cogBottom.length === 0 ? 'No cognitive self-report yet' : undefined,
    },
    {
      id: 'physiological',
      headline: 'PHYSIOLOGY',
      signalWord: physWord(physState),
      state: physState,
      Icon: BatteryMedium,
      topLines: physTop,
      bottomLines: physBottom,
      topEmptyText: physTop.length === 0 ? emptyWearable : undefined,
      bottomEmptyText: physTop.length === 0 ? undefined : 'Body signals only',
    },
    {
      id: 'emotional',
      headline: 'RESILIENCE',
      signalWord: emoWord(emoState),
      state: emoState,
      Icon: ShieldCheck,
      topLines: emoTop,
      bottomLines: emoBottom,
      topEmptyText: emoTop.length === 0 ? emptyWearable : undefined,
      bottomEmptyText: emoBottom.length === 0 ? 'No confidence reading yet' : undefined,
    },
  ];
}

// Pill body is neutral (white/taupe) for all states; state color lives in the icon badge only.
const PILL_BODY = 'bg-white/85';
const PILL_SHADOW = 'shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)]';
const PILL_HEADLINE = 'text-muted-foreground';
const PILL_SIGNAL = 'text-foreground';
const PILL_CHEVRON = 'text-muted-foreground';

const PILL_COLORS: Record<PillState, { bg: string; text: string; icon: string; border: string; glow: string; badge: string; badgeRing: string }> = {
  green: {
    bg: PILL_BODY,
    text: PILL_SIGNAL,
    icon: 'text-emerald-600',
    border: 'border-transparent',
    glow: PILL_SHADOW,
    badge: 'bg-emerald-100/80',
    badgeRing: 'ring-1 ring-emerald-200/50',
  },
  amber: {
    bg: PILL_BODY,
    text: PILL_SIGNAL,
    icon: 'text-amber-600',
    border: 'border-transparent',
    glow: PILL_SHADOW,
    badge: 'bg-amber-100/80',
    badgeRing: 'ring-1 ring-amber-200/50',
  },
  red: {
    bg: PILL_BODY,
    text: PILL_SIGNAL,
    icon: 'text-red-600',
    border: 'border-transparent',
    glow: PILL_SHADOW,
    badge: 'bg-red-100/80',
    badgeRing: 'ring-1 ring-red-200/50',
  },
  neutral: {
    bg: PILL_BODY,
    text: PILL_SIGNAL,
    icon: 'text-muted-foreground',
    border: 'border-transparent',
    glow: PILL_SHADOW,
    badge: 'bg-muted/60',
    badgeRing: 'ring-1 ring-border/40',
  },
};

function ExecutivePillCapsule({
  pill,
  expanded,
  onToggle,
}: {
  pill: ExecutivePill;
  expanded: boolean;
  onToggle: () => void;
}) {
  const c = PILL_COLORS[pill.state];
  const Icon = pill.Icon;
  return (
    <div className="flex flex-col w-full">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'group flex items-center gap-3 w-full pl-2 pr-3 py-2 rounded-full transition-all duration-300 active:scale-[0.98]',
          c.bg, c.glow,
          expanded && 'rounded-b-none'
        )}
        aria-expanded={expanded}
      >
        <span
          className={cn(
            'shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full',
            c.badge, c.badgeRing
          )}
        >
          <Icon className={cn('w-[18px] h-[18px]', c.icon)} strokeWidth={2} />
        </span>
        <div className="flex-1 min-w-0 flex flex-col items-start leading-tight">
          <span className={cn('text-[10px] uppercase tracking-[0.12em] font-body', PILL_HEADLINE)}>
            {pill.headline}
          </span>
          <span className={cn('text-sm font-semibold tracking-wide uppercase', PILL_SIGNAL)}>
            {pill.signalWord}
          </span>
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 shrink-0 transition-transform duration-300',
            PILL_CHEVRON,
            expanded && 'rotate-180'
          )}
        />
      </button>

      {/* Glass Box (top = wearable, bottom = self-declared) */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-out',
          expanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="rounded-b-2xl backdrop-blur-md bg-white/55 px-4 py-3">
          {/* Top: wearable */}
          <div className="space-y-1">
            {pill.topLines.length > 0 ? (
              pill.topLines.map((line, i) => (
                <div key={`t-${i}`} className="flex flex-col">
                  <span className="text-sm font-medium text-foreground/85 font-body">{line.text}</span>
                  {line.qualifier && (
                    <span className="text-xs text-muted-foreground/65 font-body italic">{line.qualifier}</span>
                  )}
                </div>
              ))
            ) : (
              <span className="text-xs text-muted-foreground/55 font-body italic">
                {pill.topEmptyText || 'No wearable reading'}
              </span>
            )}
          </div>

          {/* Subtle gradient hairline divider */}
          <div className="my-2 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

          {/* Bottom: self-declared */}
          <div className="space-y-1">
            {pill.bottomLines.length > 0 ? (
              pill.bottomLines.map((line, i) => (
                <div key={`b-${i}`} className="flex flex-col">
                  <span className="text-sm font-medium text-foreground/85 font-body">{line.text}</span>
                  {line.qualifier && (
                    <span className="text-xs text-muted-foreground/65 font-body italic">{line.qualifier}</span>
                  )}
                </div>
              ))
            ) : (
              <span className="text-xs text-muted-foreground/55 font-body italic">
                {pill.bottomEmptyText || 'No self-declared reading'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExecutivePillRow({ pills, inline = false }: { pills: ExecutivePill[]; inline?: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const items = pills.map((pill) => (
    <ExecutivePillCapsule
      key={pill.id}
      pill={pill}
      expanded={expandedId === pill.id}
      onToggle={() => setExpandedId(expandedId === pill.id ? null : pill.id)}
    />
  ));
  if (inline) {
    return <>{items}</>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
      {items}
    </div>
  );
}

// ─── FLIPPABLE CHIP COMPONENT (with 3D flip + 4s auto-reset) ───
function FlippableChip({ chip, onNavigate }: { chip: SignalChip; onNavigate?: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const hasBack = !!chip.backLabel;

  // Auto-reset after 4 seconds (§7.4)
  useEffect(() => {
    if (!flipped) return;
    const timer = setTimeout(() => setFlipped(false), 4000);
    return () => clearTimeout(timer);
  }, [flipped]);

  const handleClick = () => {
    if (onNavigate) {
      onNavigate();
      return;
    }
    if (hasBack) setFlipped(!flipped);
  };

  return (
    <div className="perspective-[400px]" style={{ perspective: '400px' }}>
      <button
        onClick={handleClick}
        className={cn(
          "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-body transition-all duration-500",
          chipBgColor(chip.color),
          (hasBack || onNavigate) && "cursor-pointer active:scale-95",
          !hasBack && !onNavigate && "cursor-default",
          flipped && "animate-[chip-flip_0.5s_ease-in-out]",
        )}
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateX(360deg)' : 'rotateX(0deg)',
          transition: 'transform 0.4s ease-in-out',
        }}
      >
        <span className="whitespace-nowrap">
          {flipped && chip.backLabel ? chip.backLabel : chip.label}
        </span>
      </button>
      {!flipped && chip.qualifier && (
        <p className="text-[11px] text-muted-foreground/50 font-body mt-0.5 pl-1">{chip.qualifier}</p>
      )}
    </div>
  );
}

// ─── LEAN ON / WATCH FOR — plain text: "signal · SOURCE" (uppercase source) ───
function LeanOnPill({ signal, source }: { signal: string; source: string }) {
  return (
    <span className="text-sm font-body text-foreground/80 leading-relaxed">
      {signal}
      {source && (
        <span className="text-muted-foreground/45 ml-1 uppercase tracking-wider text-[11px]">
          · {source}
        </span>
      )}
    </span>
  );
}

// ─── CALENDAR PILL CAPSULE (matches ExecutivePillCapsule visual style, non-collapsible) ───
function CalendarPillCapsule({
  state,
  Icon,
  headline,
  signalWord,
  qualifier,
  onClick,
}: {
  state: PillState;
  Icon: LucideIcon;
  headline: string;
  signalWord: string;
  qualifier?: string;
  onClick?: () => void;
}) {
  const c = PILL_COLORS[state];
  const isInteractive = !!onClick;
  return (
    <div className="flex flex-col w-full">
      <div
        role={isInteractive ? 'button' : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onClick={onClick}
        onKeyDown={isInteractive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
        className={cn(
          'group flex items-center gap-3 w-full pl-2 pr-3 py-2 rounded-full transition-all duration-300',
          c.bg, c.glow,
          isInteractive && 'cursor-pointer active:scale-[0.98]'
        )}
      >
        <span
          className={cn(
            'shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full',
            c.badge, c.badgeRing
          )}
        >
          <Icon className={cn('w-[18px] h-[18px]', c.icon)} strokeWidth={2} />
        </span>
        <div className="flex-1 min-w-0 flex flex-col items-start leading-tight">
          <span className={cn('text-[10px] uppercase tracking-[0.12em] font-body', PILL_HEADLINE)}>
            {headline}
          </span>
          <span className={cn('text-sm font-semibold tracking-wide uppercase truncate max-w-full', PILL_SIGNAL)}>
            {signalWord}
            {qualifier && (
              <span className={cn('ml-1.5 font-semibold tracking-wide normal-case', PILL_HEADLINE)}>
                · {qualifier}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── CALENDAR PILLS (logic preserved verbatim — only presentation changed) ───
function CalendarPills({ outerBrief }: { outerBrief: any }) {
  const hasCalendar = outerBrief?.hasCalendar ?? (outerBrief?.calendarState === 'active');
  const calendarState = outerBrief?.calendarState;
  const nextHS = outerBrief?.nextHighStakesEvent;
  const remainingHS: string[] = outerBrief?.remainingHighStakes ?? [];
  const calLoad = outerBrief?.calendarLoad ?? 'low';
  const loadLabel = calLoad === 'high' ? 'HEAVY' : calLoad === 'medium' ? 'MODERATE' : 'LIGHT';
  const loadState: PillState = calLoad === 'high' ? 'red' : calLoad === 'medium' ? 'amber' : 'green';
  const meetingCount = outerBrief?.meetingCount ?? 0;
  const remainingMeetings = outerBrief?.remainingMeetings ?? meetingCount;
  const meetingLabel = remainingMeetings > 0
    ? `${remainingMeetings} meeting${remainingMeetings !== 1 ? 's' : ''} ahead`
    : meetingCount > 0
      ? `${meetingCount} meeting${meetingCount !== 1 ? 's' : ''} done`
      : '0 meetings';

  // Connect-calendar prompt
  if (!hasCalendar && calendarState === 'not_connected') {
    return (
      <>
        <CalendarPillCapsule
          state="neutral"
          Icon={CalendarPlus}
          headline="CALENDAR"
          signalWord="CONNECT"
          onClick={() => { window.location.href = '/connected-data'; }}
        />
      </>
    );
  }

  if (!hasCalendar || meetingCount === 0) return null;

  // Format event time helper (preserved from original)
  const formatEventTime = (minsUntil: number) => {
    if (minsUntil < 30) return 'now';
    if (minsUntil < 90) return `in ${minsUntil} mins`;
    const eventTime = new Date(Date.now() + minsUntil * 60000);
    const h = eventTime.getHours();
    const m = eventTime.getMinutes();
    return m === 0
      ? `${h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'}`
      : `${h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`;
  };

  const pills: JSX.Element[] = [];

  // Calendar load pill (always present when there are meetings)
  pills.push(
    <CalendarPillCapsule
      key="load"
      state={loadState}
      Icon={CalendarDays}
      headline="CALENDAR"
      signalWord={loadLabel}
      qualifier={meetingLabel}
    />
  );

  // High-stakes event within 90 mins — urgent variant
  if (nextHS?.title && nextHS?.minutesUntil != null && nextHS.minutesUntil <= 90) {
    const timeLabel = formatEventTime(nextHS.minutesUntil);
    pills.push(
      <CalendarPillCapsule
        key="next-up-urgent"
        state="neutral"
        Icon={Clock}
        headline="NEXT UP"
        signalWord={nextHS.title}
        qualifier={timeLabel}
      />
    );
  } else if (remainingHS.length > 0 && nextHS?.title) {
    const timeLabel = nextHS.minutesUntil != null ? formatEventTime(nextHS.minutesUntil) : 'ahead';
    pills.push(
      <CalendarPillCapsule
        key="next-up"
        state="neutral"
        Icon={Clock}
        headline="NEXT UP"
        signalWord={remainingHS[0]}
        qualifier={timeLabel}
      />
    );
  } else if (remainingHS.length > 0) {
    pills.push(
      <CalendarPillCapsule
        key="next-up-fallback"
        state="neutral"
        Icon={Clock}
        headline="NEXT UP"
        signalWord={remainingHS[0]}
        qualifier="ahead"
      />
    );
  }

  return <>{pills}</>;
}

// ─── MAIN COMPONENT ───
const PerformanceReadinessBrief = () => {
  const navigate = useNavigate();
  const [signalsOpen, setSignalsOpen] = useState(false);

  // Single canonical payload — no separate computeEnergyState call
  const { data: outerBrief } = useOuterReadiness();

  // Inner readiness values echoed from the backend
  const score = outerBrief?.innerReadinessScore ?? null;
  const tier = outerBrief?.innerReadinessTier ?? 'default';
  const hasCheckIn = !!outerBrief?.checkInOutcome;
  const checkInCountTotal = outerBrief?.checkInCountTotal ?? 0;

  // Build chips
  const chips = buildSignalChips(outerBrief, checkInCountTotal);

  // Phrase & body — both come from the same source (LLM or deterministic, never mixed)
  const phrase = outerBrief?.phrase || (hasCheckIn ? "Let's make today count." : "Begin with your check-in.");
  const bodyText = outerBrief?.bodyText || (hasCheckIn
    ? null
    : "Check in to activate your personalised intelligence — takes two minutes.");

  // Parse body for bold — supports both **text** markdown and <strong>text</strong> HTML
  const renderBody = (text: string) => {
    const normalized = text.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
    const parts = normalized.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
    );
  };

  // Data sources — use wearableStatus as canonical wearable signal (not legacy hasWearable)
  const ws = outerBrief?.wearableStatus;
  const dataSources: string[] = ['Check-in'];
  if (outerBrief?.hasCalendar || outerBrief?.calendarState === 'active') dataSources.push('calendar');
  if (ws?.isConnected && (ws?.hasTodayData || ws?.hasRecentData || ws?.isStale)) dataSources.push('wearable');
  dataSources.push('coach');

  // Source label for lean on / watch for
  const leanOnSource = outerBrief?.leanOnSource ? getSourceLabel(outerBrief.leanOnSource) : '';
  const watchForSource = outerBrief?.watchForSource ? getSourceLabel(outerBrief.watchForSource) : '';

  return (
    <div className="rounded-xl bg-white/65 backdrop-blur-[20px] shadow-[0_4px_16px_rgba(0,0,0,0.04)] p-4 border-l-2 border-l-taupe/40">

      {/* 1. EYEBROW ROW */}
      <div className="flex items-center justify-between">
        <span className="text-xs tracking-widest uppercase text-muted-foreground/60 font-body">
          Performance Readiness Brief
        </span>
        <span className="text-xs text-muted-foreground/50 font-body">
          {getTimeLabel()} · {getDateLabel()}
        </span>
      </div>

      {/* 2. SCORE ROW */}
      <div className="flex items-baseline gap-2 mt-3">
        {hasCheckIn && score != null ? (
          <>
            <span className={cn("text-[40px] font-medium leading-none", getTierColor(tier))}>
              {score}
            </span>
            <span className="text-[16px] text-muted-foreground/40">/100</span>
            <span className={cn("text-xs uppercase tracking-wider font-medium ml-1", getTierColor(tier))}>
              {getTierLabel(tier)}
            </span>
          </>
        ) : (
          <>
            <span className="text-[40px] font-medium leading-none text-muted-foreground/30">--</span>
            <span className="text-xs uppercase tracking-wider text-muted-foreground/40 ml-2">Not yet assessed</span>
          </>
        )}
      </div>

      {/* 3. CALENDAR PILLS — moved into "Based on your signals" section */}

      {/* 4. PHRASE */}
      <p className="mt-4 text-[17px] italic text-foreground/80" style={{ fontFamily: 'Georgia, serif' }}>
        {phrase}
      </p>

      {/* 5. BODY COPY */}
      {bodyText && (
        <p className="mt-2 text-sm text-muted-foreground/70 font-body leading-relaxed">
          {renderBody(bodyText)}
        </p>
      )}

      {/* 6. SIGNAL SECTION — collapsible, open by default */}
      <Collapsible open={signalsOpen} onOpenChange={setSignalsOpen} className="mt-4">
        <CollapsibleTrigger className="flex items-center gap-1 text-xs uppercase tracking-[0.08em] text-muted-foreground/50 font-body font-medium hover:text-muted-foreground/70 transition-colors cursor-pointer">
          Based on your signals
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", signalsOpen && "rotate-180")} />
        </CollapsibleTrigger>

        <CollapsibleContent>
          {/* 7. EXECUTIVE PILLS + CALENDAR PILLS — unified capsule grid */}
          {(() => {
            const execPills = buildExecutivePills(outerBrief);
            if (execPills) {
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                  <ExecutivePillRow pills={execPills} inline />
                  <CalendarPills outerBrief={outerBrief} />
                </div>
              );
            }
            // Fallback: pre-check-in prompts (Check in / Connect wearable) — preserved
            return (
              <>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {chips.map(chip => {
                    const navMap: Record<string, string> = {
                      'no-checkin': '/daily-check-in',
                      'wearable-prompt': '/connected-data',
                      'wearable-stale': '/connected-data',
                      'calendar-prompt': '/connected-data',
                    };
                    const navTarget = navMap[chip.id];
                    return (
                      <FlippableChip
                        key={chip.id}
                        chip={chip}
                        onNavigate={navTarget ? () => navigate(navTarget) : undefined}
                      />
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                  <CalendarPills outerBrief={outerBrief} />
                </div>
              </>
            );
          })()}
        </CollapsibleContent>
      </Collapsible>

      {/* 9. DIVIDER */}
      <div className="w-full h-px bg-gradient-to-r from-transparent via-[hsl(var(--taupe))]/20 to-transparent my-4" />

      {/* 10. HOW TO SHOW UP — Progressive Disclosure (collapsed by default) */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs uppercase tracking-[0.08em] text-muted-foreground/50 font-body font-medium hover:text-muted-foreground/70 transition-colors cursor-pointer">
          How to show up
          <ChevronDown className="w-3.5 h-3.5 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>

        <CollapsibleContent>
          {/* 11. LEAN ON — plain text, no pill */}
          {outerBrief?.leanOn && (() => {
            const pairs = parseSignalSourcePairs(outerBrief.leanOn);
            return (
              <div className="flex items-baseline gap-2 mt-3">
                <span className="shrink-0 text-xs font-medium text-muted-foreground/50 uppercase tracking-wider">
                  Lean on
                </span>
                <span className="text-sm font-body text-foreground/80 leading-relaxed">
                  {pairs ? (
                    pairs.map((pair, idx) => (
                      <span key={`lean-${idx}`}>
                        {idx > 0 && <span className="mx-1 text-muted-foreground/30">·</span>}
                        {pair.signal}
                        {pair.source && (
                          <span className="text-muted-foreground/45 ml-1 uppercase tracking-wider text-[11px]">· {pair.source}</span>
                        )}
                      </span>
                    ))
                  ) : (
                    <>
                      {outerBrief.leanOn}
                      {leanOnSource && <span className="text-muted-foreground/45 ml-1 uppercase tracking-wider text-[11px]">· {leanOnSource}</span>}
                    </>
                  )}
                </span>
              </div>
            );
          })()}

          {/* 12. WATCH FOR — plain text, no pill */}
          {outerBrief?.watchFor && (() => {
            const pairs = parseSignalSourcePairs(outerBrief.watchFor);
            return (
              <div className="flex items-baseline gap-2 mt-2">
                <span className="shrink-0 text-xs font-medium text-muted-foreground/50 uppercase tracking-wider">
                  Watch for
                </span>
                <span className="text-sm font-body text-foreground/80 leading-relaxed">
                  {pairs ? (
                    pairs.map((pair, idx) => (
                      <span key={`watch-${idx}`}>
                        {idx > 0 && <span className="mx-1 text-muted-foreground/30">·</span>}
                        {pair.signal}
                        {pair.source && (
                          <span className="text-muted-foreground/45 ml-1 uppercase tracking-wider text-[11px]">· {pair.source}</span>
                        )}
                      </span>
                    ))
                  ) : (
                    <>
                      {outerBrief.watchFor}
                      {watchForSource && <span className="text-muted-foreground/45 ml-1 uppercase tracking-wider text-[11px]">· {watchForSource}</span>}
                    </>
                  )}
                </span>
              </div>
            );
          })()}

        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default PerformanceReadinessBrief;
