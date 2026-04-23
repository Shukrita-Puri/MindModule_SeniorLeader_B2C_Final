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
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useOuterReadiness } from '@/hooks/useOuterReadiness';
import { useAuth } from '@/hooks/useAuth';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { cn } from '@/lib/utils';
import { ChevronDown, Brain, BatteryMedium, ShieldCheck, CalendarDays, Clock, CalendarPlus, Info, type LucideIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ThumbsUp, ThumbsDown, Equal, Check, ArrowRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import FeedbackCapture, { type FeedbackRating } from '@/components/feedback/FeedbackCapture';
import { submitBriefFeedback } from '@/utils/relevanceFeedback';
import { Button } from '@/components/ui/button';
import EngravedLoader from '@/components/ui/engraved-loader';

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
// ─── SIGNAL PILL v6.2 — Hardware Veto + Three Modes ───
// Replaces median-of-tiers with `finalTier = MAX(hardwareFloor, outcomeFloor, weightedAverage)`.
// Honest under missing data: fewer signals reduce certainty, never "promote" a green.
type ContribTier = 'red' | 'amber' | 'green' | 'neutral';
type Severity = 'strong' | 'mild' | 'normal';
type PillarMode = 'full' | 'wearable' | 'checkin' | 'unknown';
interface PillarContrib {
  tier: ContribTier;
  severity?: Severity;
  weight?: number;         // base weight (0..1) — defaults to 1 when omitted
  veto?: PillState;        // if set, raises floor (e.g. drained → amber, HRV -25% → red)
  source?: 'hardware' | 'outcome' | 'self';  // defaults to 'self' when omitted
}

const TIER_RANK: Record<PillState, number> = { neutral: -1, green: 0, amber: 1, red: 2 };
const RANK_TIER: PillState[] = ['green', 'amber', 'red'];
const stateMax = (a: PillState, b: PillState): PillState => {
  if (a === 'neutral') return b;
  if (b === 'neutral') return a;
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
};

// Weighted average across present contributions (renormalizes weights when signals missing).
const weightedAverageTier = (contribs: PillarContrib[]): PillState => {
  const present = contribs.filter(c => c.tier !== 'neutral');
  if (present.length === 0) return 'neutral';
  const totalWeight = present.reduce((s, c) => s + (c.weight ?? 1), 0) || 1;
  const score = present.reduce((s, c) => {
    const v = c.tier === 'red' ? 2 : c.tier === 'amber' ? 1 : 0;
    return s + v * ((c.weight ?? 1) / totalWeight);
  }, 0);
  if (score >= 1.34) return 'red';
  if (score >= 0.67) return 'amber';
  return 'green';
};

interface PillarComputation {
  tier: PillState;
  hardwareFloor: PillState;
  outcomeFloor: PillState;
  weighted: PillState;
  presentSignals: number;
  expectedSignals: number;
}

// Hardware Veto + Outcome Veto + Weighted Average compose into final tier.
const computePillar = (contribs: PillarContrib[]): PillarComputation => {
  // Hardware floor: any strong-red hardware veto, OR any non-neutral hardware veto
  const hardwareFloor = contribs
    .filter(c => c.source === 'hardware' && c.veto)
    .reduce<PillState>((acc, c) => stateMax(acc, c.veto!), 'neutral');
  const outcomeFloor = contribs
    .filter(c => c.source === 'outcome' && c.veto)
    .reduce<PillState>((acc, c) => stateMax(acc, c.veto!), 'neutral');
  const weighted = weightedAverageTier(contribs);
  const tier = stateMax(stateMax(hardwareFloor, outcomeFloor), weighted);
  return {
    tier,
    hardwareFloor,
    outcomeFloor,
    weighted,
    presentSignals: contribs.filter(c => c.tier !== 'neutral').length,
    expectedSignals: contribs.length,
  };
};

// Legacy alias — kept so any unrelated callers continue to work but routed through new engine.
const composePillar = (contribs: PillarContrib[]): PillState => computePillar(contribs).tier;

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
  // Prefer real heart_rate deviation when present; fall back to RHR-derived proxy.
  const hrVal = outerBrief?.hrValue as number | null;
  const hrDev = outerBrief?.hrDeviation as number | null;
  const hrBaseline = outerBrief?.hrBaseline as number | null;
  const hrElevatedContrib = (): PillarContrib => {
    if (hrVal != null && hrDev != null) {
      if (hrDev > 20) return { tier: 'red', severity: 'mild' };
      if (hrDev > 10) return { tier: 'amber' };
      return { tier: 'green' };
    }
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

  // ── COGNITIVE PILLAR (v6.2 Hardware Veto) ──
  // Weights: HRV 0.5 (hardware veto at -20% dev), Sharpness 0.3 (veto AMBER ≤2),
  // Clarity 0.2 (veto AMBER ≤2). Outcome routed as 'self' but no veto.
  const hrvCogRaw = hrvCognitiveContrib();
  const sharpRaw = sharpnessContrib();
  const clarityRaw = clarityContrib();
  const cogOutcomeRaw = cognitiveOutcomeContrib();
  const cogContribs: PillarContrib[] = [
    {
      ...hrvCogRaw,
      weight: 0.5,
      source: 'hardware',
      // Hardware veto: HRV dev ≤ -20% locks pillar RED
      veto: hrvCogRaw.tier === 'red' && hrvCogRaw.severity === 'strong' ? 'red' : undefined,
    },
    {
      ...sharpRaw,
      weight: 0.3,
      source: 'self',
      veto: (sharpness != null && sharpness <= 2) ? 'amber' : undefined,
    },
    {
      ...clarityRaw,
      weight: 0.2,
      source: 'self',
      veto: (clarity != null && clarity <= 2) ? 'amber' : undefined,
    },
    { ...cogOutcomeRaw, weight: 0.2, source: 'self' },
  ];
  const cogComp = computePillar(cogContribs);
  let cogState = cogComp.tier;

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
  // Hardware-only. Sleep weight 0.5 (veto RED <5h, AMBER <6.5h or <70 score),
  // RHR 0.25, HR-elevated proxy 0.25.
  const sleepRaw = sleepContrib();
  const rhrRaw = rhrContrib();
  const hrElevatedRaw = hrElevatedContrib();
  const sleepKnown = (sleepDur != null) || (sleepScore != null);
  const sleepVeto: PillState | undefined =
    (sleepDur != null && sleepDur < 300) ? 'red'
    : (sleepDur != null && sleepDur < 390) ? 'amber'
    : (sleepScore != null && sleepScore < 70) ? 'amber'
    : undefined;
  const rhrVeto: PillState | undefined =
    (rhrDev != null && rhrDev > 20) ? 'red'
    : (rhrDev != null && rhrDev > 10) ? 'amber'
    : undefined;
  const physContribs: PillarContrib[] = [
    { ...sleepRaw, weight: 0.5, source: 'hardware', veto: sleepVeto },
    { ...rhrRaw, weight: 0.25, source: 'hardware', veto: rhrVeto },
    { ...hrElevatedRaw, weight: 0.25, source: 'hardware' },
  ];
  // When sleep is missing (e.g. older Apple Watches that don't track sleep),
  // re-weight to RHR 0.6 / HR-elevated 0.4 so we can still produce a confident
  // read from the heart signals alone instead of always capping at AMBER.
  const physContribsForScoring: PillarContrib[] = sleepKnown
    ? physContribs
    : [
        { ...rhrRaw, weight: 0.6, source: 'hardware', veto: rhrVeto },
        { ...hrElevatedRaw, weight: 0.4, source: 'hardware' },
      ];
  const physComp = computePillar(physContribsForScoring);
  let physState = physComp.tier;
  // Sleep-missing fallback gating: only allow GREEN when both heart signals
  // are clearly calm (RHR within +5% of baseline AND HR-elevated proxy green).
  if (!sleepKnown && physState === 'green') {
    const rhrCalm = (rhrDev != null && rhrDev <= 5) || (rhrVal != null && rhrVal <= 70);
    const hrCalm = hrElevatedRaw.tier === 'green' || hrElevatedRaw.tier === 'neutral';
    if (!(rhrCalm && hrCalm)) physState = 'amber';
  }
  // Mode-3 (no hardware at all) — physiology becomes UNKNOWN
  const physHasAnySignal = physComp.presentSignals > 0;
  if (!physHasAnySignal) physState = 'neutral';

  // ── RESILIENCE PILLAR ──
  // Mental Energy (outcome) 0.5 with HARD veto (drained→AMBER, overwhelmed→RED).
  // HRV (strict band) 0.3. Confidence 0.2 modifier only.
  const hrvResRaw = hrvResilienceContrib();
  const confRaw = confidenceContrib();
  const emoOutcomeRaw = resilienceOutcomeContrib();
  const emoOutcomeVeto: PillState | undefined =
    checkInOutcome === 'overwhelmed' ? 'red'
    : checkInOutcome === 'drained' ? 'amber'
    : undefined;
  const hrvResVeto: PillState | undefined =
    (hrvDev != null && hrvDev <= -25) ? 'amber'
    : undefined;
  const emoContribs: PillarContrib[] = [
    { ...emoOutcomeRaw, weight: 0.5, source: 'outcome', veto: emoOutcomeVeto },
    { ...hrvResRaw, weight: 0.3, source: 'hardware', veto: hrvResVeto },
    { ...confRaw, weight: 0.2, source: 'self' },
  ];
  const emoComp = computePillar(emoContribs);
  const emoState = emoComp.tier;

  // ── Divergence flags (used in qualifiers + bubbled to outerBrief.divergence) ──
  const cognitiveMasked = cogAuthorityFlag === 'masked-high';
  const resilienceFeltAhead = (checkInOutcome === 'drained' || checkInOutcome === 'overwhelmed')
    && (confidence != null && confidence >= 4);

  // ── Signal-word maps ──
  const cognitiveWord = (s: PillState): string => {
    // CEO-grade taxonomy — every label names a *pattern*, not a feeling.
    // Pillar name ("DECISION EDGE") never repeats inside the label.
    if (s === 'red') {
      // Body sees strain the mind hasn't registered yet.
      if (cogAuthorityFlag === 'masked-high') return 'HIDDEN DRAG';
      return 'RUNNING ON FUMES';
    }
    if (s === 'amber') {
      if (cogAuthorityFlag === 'masked-high') return 'HIDDEN DRAG';
      if (cogAuthorityFlag === 'recovery-underway') return 'TURNING THE CORNER';
      // High-functioning strain — body is paying a cost but cognition is still top-quality.
      const sharpStrong = sharpness != null && sharpness >= 4;
      const clarityStrong = clarity != null && clarity >= 4;
      const energyOk = checkInOutcome !== 'drained' && checkInOutcome !== 'overwhelmed';
      const realStrain = hrvDev != null && hrvDev <= -5 && hrvDev >= -20;
      if (sharpStrong && clarityStrong && energyOk && realStrain) return 'PEAK DEBT';
      return 'NARROW BAND';
    }
    if (s === 'green') return wearableTrend === 'improving' ? 'GAINING GROUND' : 'CLEAR HEAD';
    return 'NO READ';
  };
  const physWord = (s: PillState): string => {
    if (s === 'neutral') return 'NO READ';
    if (s === 'red') {
      // Sustained 2+ day deficit — pattern across days the user can't feel.
      if (wearableTrend === 'declining') return 'OVERDRAWN';
      return 'DRAWING DOWN';
    }
    if (s === 'amber') return 'BUFFER THIN';
    // green
    const sleepGood = (sleepScore != null && sleepScore >= 70) || (sleepDur != null && sleepDur >= 390);
    const rhrGood = (rhrDev != null && rhrDev <= 5) || (rhrVal != null && rhrVal <= 70);
    const hrCalm = (rhrDev == null || rhrDev <= 15);
    if (sleepKnown && sleepGood && rhrGood && hrCalm) return 'FULLY STOCKED';
    if (!sleepKnown && rhrGood) return 'BODY STEADY';
    return 'PARTIAL READ';
  };
  const emoWord = (s: PillState): string => {
    if (s === 'red') {
      // Pride masking depletion — drained but self-confidence high.
      if (resilienceFeltAhead) return 'RUNNING ON GRIT';
      return 'TANK EMPTY';
    }
    if (s === 'amber') return 'PULLING WEIGHT';
    if (s === 'green') return wearableTrend === 'improving' ? 'FULL THROTTLE' : 'HOLDING UP';
    return 'NO READ';
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
    // v6.2: only apply trend qualifier when sharpness itself is low (≤2). The overall
    // scoreTrajectory7d was misleading users into thinking sharpness was declining
    // when in fact it was their overall readiness trend. Honest > harmonised.
    const sharpQualifier = (sharpness <= 2)
      ? `${sharpness}/5 — limited bandwidth`
      : undefined;
    cogBottom.push({
      text: `Sharpness: ${fmtScored(SHARPNESS_LABELS[sharpness - 1], sharpness)}`,
      qualifier: sharpQualifier,
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
  // Sleep line — always present so the user sees Sleep · RHR · HR side by side.
  // When neither score nor duration is available, render an explicit "not synced" line
  // (kind=self so it doesn't claim wearable authority) instead of silently dropping it.
  if (sleepScore != null || sleepDur != null) {
    const parts: string[] = [];
    if (sleepScore != null) parts.push(`Sleep ${sleepScore}`);
    if (sleepDur != null) parts.push(fmtSleepDur(sleepDur));
    let q = '';
    if (sleepDev != null && sleepBaseline) q = `${devSign(sleepDev)} vs ${fmtSleepDur(sleepBaseline)} baseline`;
    if (scoreTrajectory === 'declining') q = q ? `${q} · trend declining` : 'trend declining';
    physTop.push({ text: parts.join(' · '), qualifier: q || undefined, kind: 'wearable' });
  } else {
    physTop.push({
      text: 'Sleep — not synced',
      qualifier: wearableConnected ? 'no sleep data today' : 'connect a wearable',
      kind: 'self',
    });
  }
  if (rhrVal != null) {
    let q = '';
    if (rhrDev != null && rhrBaseline) q = `${devSign(rhrDev)} vs ${rhrBaseline}bpm baseline`;
    if (rhrDev != null && rhrDev > 15) q = q ? `${q} · sympathetic dominance` : 'sympathetic dominance';
    physTop.push({ text: `RHR ${rhrVal}bpm`, qualifier: q || undefined, kind: 'wearable' });
  }
  // HR line — prefer real heart_rate (avg bpm) when present; otherwise use the
  // RHR-deviation proxy and label it as estimated. Per §7.2, HR is a distinct
  // Physiology input alongside Sleep and RHR.
  if (hrVal != null) {
    const tier = hrDev == null
      ? 'calm'
      : hrDev > 20 ? 'elevated' : hrDev > 10 ? 'rising' : 'calm';
    const stateNote = tier === 'calm'
      ? 'autonomic state stable'
      : tier === 'rising'
        ? 'sympathetic activation building'
        : 'sustained sympathetic dominance';
    const baselinePart = (hrDev != null && hrBaseline)
      ? `${devSign(hrDev)} vs ${hrBaseline}bpm baseline · ${tier} · ${stateNote}`
      : `${tier} · ${stateNote}`;
    physTop.push({ text: `HR ${hrVal}bpm`, qualifier: baselinePart, kind: 'wearable' });
  } else if (rhrDev != null) {
    const hrTier = rhrDev > 25 ? 'elevated' : rhrDev > 15 ? 'rising' : 'calm';
    const hrText = hrTier === 'calm' ? 'HR — calm' : hrTier === 'rising' ? 'HR — rising' : 'HR — elevated';
    const hrStateQ = hrTier === 'calm'
      ? 'autonomic state stable'
      : hrTier === 'rising'
      ? 'sympathetic activation building'
      : 'sustained sympathetic dominance';
    physTop.push({ text: hrText, qualifier: `estimated · ${hrStateQ}`, kind: 'wearable' });
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
    let q: string | undefined;
    if (resilienceFeltAhead) q = 'felt ahead of system — confidence high, mental energy depleted';
    else if (consecLowConf >= 3) q = `${consecLowConf}th day low confidence`;
    emoBottom.push({ text: `Confidence: ${fmtScored(CONFIDENCE_LABELS[confidence - 1], confidence)}`, qualifier: q, kind: 'self' });
  }
  if (RESILIENCE_OUTCOMES.has(checkInOutcome)) {
    const meQualifier = (checkInOutcome === 'drained' || checkInOutcome === 'overwhelmed')
      ? 'truth layer — overrides wearable'
      : undefined;
    emoBottom.push({ text: `Mental Energy: ${titleCase(checkInOutcome)}`, qualifier: meQualifier, kind: 'self' });
  }

  const emptyWearable = !wearableConnected
    ? 'Connect wearable for full reading'
    : tier === 'none' ? 'Waiting for wearable data' : undefined;

  // Physiology Mode-3 explicit text — never guess from mood
  // When sleep is missing but heart signals are healthy, communicate that we
  // read the body via heart signals (older Apple Watches don't track sleep).
  const sleepMissingHeartCalm = !sleepKnown && (
    ((rhrDev != null && rhrDev <= 5) || (rhrVal != null && rhrVal <= 70))
    && (hrElevatedRaw.tier === 'green' || hrElevatedRaw.tier === 'neutral')
  );
  const physEmpty = !physHasAnySignal
    ? (wearableConnected ? 'Body data not synced today' : 'No body data — connect a wearable')
    : (!sleepKnown
        ? (sleepMissingHeartCalm
            ? 'Sleep not tracked · reading body via heart signals'
            : 'Sleep not captured · partial physiology read')
        : undefined);

  return [
    {
      id: 'cognitive',
      headline: 'DECISION READINESS',
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
      headline: 'PHYSICAL RESERVES',
      signalWord: physWord(physState),
      state: physState,
      Icon: BatteryMedium,
      topLines: physTop,
      bottomLines: physBottom,
      topEmptyText: physTop.length === 0 ? (physEmpty ?? emptyWearable) : undefined,
      bottomEmptyText: physTop.length === 0
        ? undefined
        : (physEmpty ?? 'Body signals only'),
    },
    {
      id: 'emotional',
      headline: 'RESILIENCE CAPACITY',
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
  // Plain-language glossary per pillar — what we measure and what high/low signals.
  // Includes clinical definitions of wearable metrics (HRV, RHR, Sleep score) so
  // CEOs unfamiliar with the acronyms understand exactly what's being read.
  const glossary: Record<ExecutivePill['id'], { short: string; clinical?: string }> = {
    cognitive: {
      short:
        'Mental sharpness & clarity — how crisp your thinking is. Higher = sharper decisions; lower = foggier judgement.',
      clinical:
        'Drawn from your self-rated sharpness, clarity and any check-in outcome (Focused / Scattered / Drained). No wearable input — this pillar is what you tell us about your mind.',
    },
    physiological: {
      short:
        'Your body’s recovery reserves, read from your wearable. Higher reserves = recovered; lower reserves = strained.',
      clinical:
        'HRV (Heart-Rate Variability) — beat-to-beat variation in ms; higher = better autonomic recovery, lower = stress or under-recovery.\nRHR (Resting Heart Rate) — beats per minute at rest; lower trend = recovered, elevated vs. your baseline = strain or illness.\nSleep score — 0–100 composite of duration, depth and continuity from your wearable; higher = more restorative sleep, lower = under-slept or fragmented.',
    },
    emotional: {
      short:
        'Your capacity to absorb pressure — mood, confidence and physiological steadiness combined. Higher = composed under load; lower = depleted or stretched thin.',
      clinical:
        'Blends your self-rated confidence and check-in outcome (Calm / Steady / Overwhelmed) with HRV as a stress-tolerance read. Low HRV alongside high confidence often signals running on grit.',
    },
  };
  const glossaryEntry = glossary[pill.id];
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
          {/* Glossary one-liner — plain-language definition for non-specialists */}
          {glossaryText && (
            <div className="flex items-start gap-1.5 mb-2 pb-2 border-b border-white/30">
              <Info className="w-3 h-3 mt-[3px] shrink-0 text-muted-foreground/60" strokeWidth={2} />
              <p className="text-[11px] leading-snug text-muted-foreground/75 font-body italic">
                {glossaryText}
              </p>
            </div>
          )}
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
interface PerformanceReadinessBriefProps {
  onCtaReadyChange?: (ready: boolean) => void;
}

const PerformanceReadinessBrief = ({ onCtaReadyChange }: PerformanceReadinessBriefProps = {}) => {
  const navigate = useNavigate();
  const [signalsOpen, setSignalsOpen] = useState(false);

  // Single canonical payload — no separate computeEnergyState call
  const { data: outerBrief, isLoading: outerBriefLoading } = useOuterReadiness();

  // Eager cache peek: if React Query already has data for this user/period at
  // mount time, this is a *revisit* — skip the scripted narration loader and
  // the 5s CTA delay entirely so the brief renders instantly.
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [hadCacheAtMount] = useState(() => {
    try {
      const effectiveUserId = DEV_MODE ? DEV_USER.id : user?.id;
      if (!effectiveUserId) return false;
      const hour = new Date().getHours();
      const period = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
      const cached = queryClient.getQueryData(['outer-readiness', effectiveUserId, period]);
      return !!cached;
    } catch {
      return false;
    }
  });

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

  // ── Script-gated first-load loader ──
  // The brief stays hidden until BOTH (a) the data has arrived AND (b) the
  // scripted "mixture" narration has played every step in order. This
  // prevents content from popping in mid-script. The loader card stays
  // mounted on its final step until data lands. Only applies on a true cold
  // load (no cached brief yet). Empty/error states (no loading + no data)
  // fall through to the main render so they aren't gated.
  const [briefScriptDone, setBriefScriptDone] = useState(hadCacheAtMount);
  const showLoader =
    (outerBriefLoading && !outerBrief) ||
    (!!outerBrief && !briefScriptDone);

  const briefId = (outerBrief as any)?.briefId ?? null;

  // ── Brief → Plan handoff CTA reveal ──
  // The CTA stays hidden until the loader has finished AND the brief has been
  // visible for 5 seconds, so the user has time to read it before being
  // invited to the next page. Submitting feedback short-circuits the wait.
  const [showCta, setShowCta] = useState(hadCacheAtMount);
  useEffect(() => {
    // Revisit (cache hit at mount): CTA already revealed, skip the 5s delay.
    if (hadCacheAtMount) return;
    // Always reset on mount or when loader is (re)showing — never carry a
    // stale "true" from a previous render cycle into a fresh loader run.
    if (showLoader || !phrase) {
      setShowCta(false);
      return;
    }
    setShowCta(false);
    const t = setTimeout(() => setShowCta(true), 5000);
    return () => clearTimeout(t);
  }, [showLoader, phrase, hadCacheAtMount]);
  useEffect(() => {
    onCtaReadyChange?.(showCta);
  }, [showCta, onCtaReadyChange]);

  if (showLoader) {
    return (
      <div className="rounded-xl bg-white/65 backdrop-blur-[20px] shadow-[0_4px_16px_rgba(0,0,0,0.04)] p-4 border-l-2 border-l-taupe/40">
        <div className="flex items-center justify-between">
          <span className="text-xs tracking-widest uppercase text-muted-foreground/60 font-body">
            Performance Readiness Brief
          </span>
          <span className="text-xs text-muted-foreground/50 font-body">
            Preparing
          </span>
        </div>
        <EngravedLoader
          steps={[
            "Reading your signals…",
            "Assessing your day's demands…",
            "Mapping patterns & context…",
            "Drafting your brief…",
          ]}
          onAllStepsComplete={() => setBriefScriptDone(true)}
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white/65 backdrop-blur-[20px] shadow-[0_4px_16px_rgba(0,0,0,0.04)] p-4 border-l-2 border-l-taupe/40 animate-fade-in">

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

      {/* 13. INLINE FEEDBACK ROW — non-intrusive, one chance per day */}
      <BriefFeedbackRow
        briefId={briefId}
        tier={(outerBrief as any)?.innerReadinessTier ?? null}
        score={(outerBrief as any)?.innerReadinessScore ?? null}
        onFeedbackSubmitted={() => setShowCta(true)}
      />
    </div>
  );
};

export default PerformanceReadinessBrief;

// ─── BRIEF FEEDBACK ROW ───
// Non-intrusive inline feedback at the bottom of the Performance Readiness Brief.
// States: idle (thumbs row) → capturing (textarea + submit/skip) → submitted (✓ noted)
// Persists submitted state per-brief via localStorage key `prb-feedback-{briefId}`.
// When a new brief is generated (different briefId), the row resets automatically
// so the user gets a fresh chance to rate each genuinely new brief — but plain
// refreshes (which return the same snapshot id) keep the "noted" state.
const BRIEF_FEEDBACK_ICONS: Array<{ value: FeedbackRating; Icon: typeof ThumbsUp; label: string }> = [
  { value: 'up', Icon: ThumbsUp, label: 'Useful' },
  { value: 'neutral', Icon: Equal, label: 'Neutral' },
  { value: 'down', Icon: ThumbsDown, label: 'Off' },
];

interface BriefFeedbackRowProps {
  briefId?: string | null;
  tier?: string | null;
  score?: number | null;
  onFeedbackSubmitted?: () => void;
}

const BriefFeedbackRow = ({ briefId, tier, score, onFeedbackSubmitted }: BriefFeedbackRowProps) => {
  // Prefer per-brief key so feedback resets when a genuinely new brief is generated.
  // Fall back to a date+window key for the brief moment before briefId is available
  // (very rare — the snapshot id is included in the very first edge response).
  const dateKey = new Date().toISOString().slice(0, 10);
  const hour = new Date().getHours();
  const windowKey = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const storageKey = briefId
    ? `prb-feedback-${briefId}`
    : `prb-feedback-${dateKey}-${windowKey}`;

  const [mode, setMode] = useState<'idle' | 'capturing' | 'submitted'>(() => {
    if (typeof window === 'undefined') return 'idle';
    return window.localStorage.getItem(storageKey) ? 'submitted' : 'idle';
  });

  // When briefId changes (a genuinely new brief was generated), re-evaluate
  // submitted state from storage so the thumbs row re-appears.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setMode(window.localStorage.getItem(storageKey) ? 'submitted' : 'idle');
  }, [storageKey]);

  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePick = (value: FeedbackRating) => {
    setRating(value);
    setFeedback('');
    setMode('capturing');
  };

  const handleSubmit = async () => {
    if (!rating) return;
    setIsSubmitting(true);
    // Fire-and-forget; flip UI immediately for executive feel
    submitBriefFeedback(
      rating,
      feedback.trim() || undefined,
      briefId ?? undefined,
      { tier: tier ?? undefined, score: typeof score === 'number' ? score : undefined },
    ).catch(() => {
      /* errors logged inside helper */
    });
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ rating, at: Date.now() }));
    } catch {
      /* ignore quota / privacy mode errors */
    }
    setMode('submitted');
    setIsSubmitting(false);
    onFeedbackSubmitted?.();
  };

  const handleCancel = () => {
    setRating(null);
    setFeedback('');
    setMode('idle');
  };

  if (mode === 'submitted') {
    return (
      <div className="mt-4 pt-3 w-full flex items-center justify-end gap-1.5 text-[11px] font-body text-muted-foreground/60 animate-in fade-in duration-300">
        <Check className="w-3 h-3" strokeWidth={2.25} />
        <span>Feedback noted</span>
      </div>
    );
  }

  if (mode === 'capturing') {
    return (
      <div className="mt-4 pt-3 animate-in slide-in-from-top-1 fade-in duration-250">
        <FeedbackCapture
          rating={rating}
          onRatingChange={setRating}
          feedback={feedback}
          onFeedbackChange={setFeedback}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          submitLabel="Send"
          cancelLabel="Skip"
          isSubmitting={isSubmitting}
          hideRatingPrompt
          variant="default"
        />
      </div>
    );
  }

  return (
    <div className="mt-4 pt-3 flex items-center justify-end gap-2.5">
      <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground/50 font-body font-medium">
        Was this brief useful?
      </span>
      <div className="flex items-center gap-1.5">
        {BRIEF_FEEDBACK_ICONS.map(({ value, Icon, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => handlePick(value)}
            aria-label={label}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full border border-transparent',
              'text-muted-foreground/50 hover:text-taupe-foreground hover:bg-taupe/10 hover:border-taupe/30',
              'transition-all duration-200 active:scale-95'
            )}
          >
            <Icon size={14} strokeWidth={2} />
          </button>
        ))}
      </div>
    </div>
  );
};
