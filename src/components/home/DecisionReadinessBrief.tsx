/**
 * PerformanceReadinessBrief – unified card replacing TodayStateCard + StrategicIntentionCard
 * Variant A only: interpretation chips with tap-to-flip number reveal.
 * 
 * Signal Pill Contract (from PERFORMANCE_READINESS_BRIEF_LOGIC.md §7):
 *   Priority: 1.Calendar → 2.HRV → 3.Sleep → 4.RHR → 5.Mind → 6.Pattern
 *   Every pill has: front (analysis) + back (evidence)
 *   All states render (green/amber/red) — not only threshold-breakers
 *   Mind pill is clarity×confidence matrix, NOT outcome-led
 *   Pattern pills surface when upstream enrichment fields qualify
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { useOuterReadiness } from '@/hooks/useOuterReadiness';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';
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

// Event pill style — taupe
const eventPillStyle = 'bg-gradient-to-r from-[hsl(var(--taupe))] to-[hsl(var(--taupe-highlight))] text-white shadow-[0_2px_8px_rgba(0,0,0,0.1)] border-0';

// Map leanOnSource keys to human-readable source labels
const getSourceLabel = (source: string | undefined): string => {
  if (!source) return '';
  switch (source) {
    case 'llm-v4': return '';
    case 'coach-insights-recent':
    case 'coach-insights-grace': return 'From coach conversations';
    case 'cc-modifier':
    case 'cc-modifier-with-context': return 'From your check-in today';
    case 'coach-partial-strength':
    case 'coach-partial-growth': return 'Coach + archetype';
    case 'archetype-tier': return 'From your archetype';
    case 'tier-fallback':
    case 'sunday-evening-override':
    case 'evening-recovery-override': return 'From readiness score';
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
      pairs.push({
        signal: line.substring(0, sepIdx).trim(),
        source: line.substring(sepIdx + 3).trim(),
      });
    }
  }
  return pairs.length > 0 ? pairs : null;
}

// ─── WEARABLE TIER ───
type WearableTier = 'none' | 'absolute' | 'partial' | 'full';

function getWearableTier(outerBrief: any): WearableTier {
  const hasWearable = outerBrief?.hasWearable ?? false;
  if (!hasWearable) return 'none';
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
  energyState: any,
  checkInCountTotal: number,
): SignalChip[] {
  const chips: SignalChip[] = [];
  const hasCheckIn = !!energyState?.checkInOutcome;
  const tier = getWearableTier(outerBrief);
  const wearableDataSource = outerBrief?.wearableDataSource ?? null;
  const isAppleHealth = wearableDataSource === 'apple-healthkit';
  const wearableDays = outerBrief?.wearableDaysConnected ?? 0;

  // Debug: log wearable data availability
  console.log('[buildSignalChips] wearable debug:', {
    tier, hasWearable: outerBrief?.hasWearable, wearableDataSource,
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
  const score = energyState?.overallBalance ?? null;
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
  // §7.1  HRV PILL — always shows when data exists
  // ────────────────────────────────────────
  const hrvVal = outerBrief?.hrvValue as number | null;
  const hrvDev = outerBrief?.hrvDeviation as number | null;

  if (hrvVal != null) {
    let frontLabel: string;
    let color: SignalChip['color'];
    let qualifier = tierSuffix;

    if (tier === 'full' && hrvDev != null) {
      if (hrvDev < -15) {
        frontLabel = 'HRV below baseline';
        color = 'red';
        qualifier = getLongQualifier(true) || tierSuffix;
      } else if (hrvDev < -5) {
        frontLabel = 'HRV dipped';
        color = 'amber';
      } else if (hrvDev > 15) {
        frontLabel = 'HRV strong';
        color = 'green';
        qualifier = getLongQualifier(false, true) || tierSuffix;
      } else if (hrvDev > 5) {
        frontLabel = 'HRV above baseline';
        color = 'green';
      } else {
        frontLabel = 'HRV at baseline';
        color = 'green';
      }
    } else if ((tier === 'partial' || tier === 'absolute') && hrvDev != null) {
      if (hrvDev < -15) { frontLabel = 'HRV below baseline'; color = 'red'; }
      else if (hrvDev < -5) { frontLabel = 'HRV dipped'; color = 'amber'; }
      else if (hrvDev > 5) { frontLabel = 'HRV above baseline'; color = 'green'; }
      else { frontLabel = 'HRV at baseline'; color = 'green'; }
    } else {
      if (hrvVal < 20) { frontLabel = 'HRV low'; color = 'red'; }
      else if (hrvVal < 40) { frontLabel = 'HRV moderate'; color = 'amber'; }
      else if (hrvVal > 70) { frontLabel = 'HRV strong'; color = 'green'; }
      else { frontLabel = 'HRV normal'; color = 'green'; }
    }

    // Inline wearable pattern on HRV (highest priority wearable pill)
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

    // Back label: evidence
    let backLabel: string;
    if (hrvDev != null && hrvBaseline) {
      backLabel = `${hrvVal}ms · ${devSign(hrvDev)} vs ${hrvBaseline}ms baseline`;
    } else {
      backLabel = `${hrvVal}ms`;
      if (tier === 'absolute' || tier === 'partial') backLabel += ' · baseline building';
    }

    chips.push({ id: 'hrv', label: frontLabel, backLabel, color, qualifier });
  }

  // ────────────────────────────────────────
  // §7.1  SLEEP PILL — always shows when data exists
  // ────────────────────────────────────────
  const sleepDur = outerBrief?.sleepDuration as number | null;
  const sleepScore = outerBrief?.sleepScore as number | null;
  const sleepDev = outerBrief?.sleepDeviation as number | null;

  if (sleepDur != null || sleepScore != null) {
    let frontLabel: string;
    let color: SignalChip['color'];
    const qualifier = tierSuffix;

    if (sleepDur != null && sleepDur < 360) {
      frontLabel = `Short sleep · ${fmtSleepDur(sleepDur)}`;
      color = 'red';
    } else if (sleepDev != null) {
      if (sleepDev < -15) {
        frontLabel = sleepDur != null ? `Sleep below baseline · ${fmtSleepDur(sleepDur)}` : 'Sleep below baseline';
        color = 'red';
      } else if (sleepDev < -5) {
        frontLabel = sleepDur != null ? `Sleep slightly short · ${fmtSleepDur(sleepDur)}` : 'Sleep slightly short';
        color = 'amber';
      } else if (sleepDev > 10) {
        frontLabel = sleepDur != null ? `Solid sleep · ${fmtSleepDur(sleepDur)}` : 'Solid sleep';
        color = 'green';
      } else {
        frontLabel = sleepDur != null ? `Sleep at baseline · ${fmtSleepDur(sleepDur)}` : 'Sleep at baseline';
        color = 'green';
      }
    } else if (sleepScore != null) {
      if (sleepScore < 60) { frontLabel = `Poor sleep · ${sleepScore}`; color = 'red'; }
      else if (sleepScore < 70) { frontLabel = `Fair sleep · ${sleepScore}`; color = 'amber'; }
      else { frontLabel = `Solid sleep · ${sleepScore}`; color = 'green'; }
    } else if (sleepDur != null) {
      if (sleepDur < 420) { frontLabel = `Light sleep · ${fmtSleepDur(sleepDur)}`; color = 'amber'; }
      else { frontLabel = `Sleep · ${fmtSleepDur(sleepDur)}`; color = 'green'; }
    } else {
      frontLabel = 'Sleep data';
      color = 'neutral';
    }

    // Inline wearable/score pattern on sleep if HRV didn't use it
    if (scoreTrajectory === 'declining' && !wearablePatternUsed) {
      frontLabel += ' · score declining';
      wearablePatternUsed = true;
    } else if (scoreTrajectory === 'improving' && !wearablePatternUsed) {
      frontLabel += ' · score improving';
      wearablePatternUsed = true;
    }

    // Back label
    let backLabel = '';
    if (sleepDur != null) {
      backLabel = fmtSleepDur(sleepDur);
      if (sleepDev != null && sleepBaseline) {
        backLabel += ` · ${devSign(sleepDev)} vs ${fmtSleepDur(sleepBaseline)} baseline`;
      }
    } else if (sleepScore != null) {
      backLabel = `Score: ${sleepScore}`;
      if (sleepDev != null && sleepBaseline) {
        backLabel += ` · ${devSign(sleepDev)} vs ${sleepBaseline} baseline`;
      }
    }

    chips.push({ id: 'sleep', label: frontLabel, backLabel: backLabel || undefined, color, qualifier });
  }

  // ────────────────────────────────────────
  // §7.1  RHR / HEART PILL — always shows when data exists
  // ────────────────────────────────────────
  const rhrVal = outerBrief?.rhrValue as number | null;
  const rhrDev = outerBrief?.rhrDeviation as number | null;

  if (rhrVal != null) {
    let frontLabel: string;
    let color: SignalChip['color'];
    const qualifier = tierSuffix;

    if (rhrDev != null) {
      if (rhrDev > 20) { frontLabel = 'RHR elevated'; color = 'red'; }
      else if (rhrDev > 10) { frontLabel = 'RHR above baseline'; color = 'amber'; }
      else if (rhrDev < -10) { frontLabel = 'RHR low · recovered'; color = 'green'; }
      else { frontLabel = 'RHR at baseline'; color = 'green'; }
    } else {
      if (rhrVal > 90) { frontLabel = 'RHR high'; color = 'red'; }
      else if (rhrVal > 80) { frontLabel = 'RHR elevated'; color = 'amber'; }
      else { frontLabel = 'RHR normal'; color = 'green'; }
    }

    // Inline remaining wearable pattern on RHR if not used yet
    if (wearableTrend === 'declining' && !wearablePatternUsed) {
      frontLabel += ' · trend declining';
      wearablePatternUsed = true;
    }

    let backLabel: string;
    if (rhrDev != null && rhrBaseline) {
      backLabel = `${rhrVal}bpm · ${devSign(rhrDev)} vs ${rhrBaseline}bpm baseline`;
    } else {
      backLabel = `${rhrVal}bpm`;
      if (tier === 'absolute' || tier === 'partial') backLabel += ' · baseline building';
    }

    chips.push({ id: 'rhr', label: frontLabel, backLabel, color, qualifier });
  }

  // ── Wearable prompt if no wearable at all ──
  if (tier === 'none') {
    chips.push({ id: 'wearable-prompt', label: 'Connect wearable for full intelligence', color: 'neutral' });
  }

  // ────────────────────────────────────────
  // §7.1  UNIFIED MIND PILL — Stage 1 (outcome) + Stage 2 (clarity × confidence)
  // Synthesizes check-in sharpness + clarity/confidence into one pill
  // ────────────────────────────────────────
  const clarity = outerBrief?.clarityLevel as number | null;
  const confidence = outerBrief?.confidenceLevel as number | null;
  const outcome = energyState?.checkInOutcome as string | null;

  // Outcome tier mapping
  const outcomeTier = (o: string | null): 'red' | 'amber' | 'green' | null => {
    if (!o) return null;
    if (['overwhelmed', 'drained'].includes(o)) return 'red';
    if (['scattered', 'anxious', 'frustrated'].includes(o)) return 'amber';
    if (['focused', 'steady', 'energised', 'calm'].includes(o)) return 'green';
    return 'amber'; // fallback for unknown outcomes
  };

  // C×C tier mapping
  const ccTier = (c: number | null, co: number | null): 'red' | 'amber' | 'green' | null => {
    if (c == null && co == null) return null;
    if ((c != null && c <= 2) && (co != null && co <= 2)) return 'red';
    if ((c != null && c <= 2) || (co != null && co <= 2)) return 'amber';
    if ((c != null && c >= 4) && (co != null && co >= 4)) return 'green';
    return 'green';
  };

  // Worst-of color
  const worstOf = (a: 'red' | 'amber' | 'green' | null, b: 'red' | 'amber' | 'green' | null): SignalChip['color'] => {
    const order = { red: 0, amber: 1, green: 2 };
    if (a == null && b == null) return 'green';
    if (a == null) return b!;
    if (b == null) return a;
    return order[a] <= order[b] ? a : b;
  };

  const oTier = outcomeTier(outcome);
  const cTier = ccTier(clarity, confidence);

  if (outcome || clarity != null || confidence != null) {
    let frontLabel: string;
    const color = worstOf(oTier, cTier);

    // Synthesize front label from both stages
    const outcomeLabel = outcome ? outcome.charAt(0).toUpperCase() + outcome.slice(1) : null;

    if (outcomeLabel && clarity != null && confidence != null) {
      // Full synthesis: Stage 1 + Stage 2
      const ccDesc = clarity >= 4 && confidence >= 4 ? 'sharp clarity'
        : clarity >= 4 ? 'sharp clarity · low confidence'
        : clarity <= 2 && confidence <= 2 ? 'low clarity · low confidence'
        : clarity <= 2 ? 'low clarity'
        : confidence <= 2 ? 'low confidence'
        : confidence >= 4 ? 'high confidence'
        : 'moderate mind';
      frontLabel = `${outcomeLabel} · ${ccDesc}`;
    } else if (outcomeLabel && clarity != null) {
      const cDesc = clarity >= 4 ? 'sharp clarity' : clarity <= 2 ? 'low clarity' : 'moderate clarity';
      frontLabel = `${outcomeLabel} · ${cDesc}`;
    } else if (outcomeLabel && confidence != null) {
      const coDesc = confidence >= 4 ? 'high confidence' : confidence <= 2 ? 'low confidence' : 'moderate confidence';
      frontLabel = `${outcomeLabel} · ${coDesc}`;
    } else if (outcomeLabel) {
      frontLabel = `Mind ${outcomeLabel.toLowerCase()}`;
    } else if (clarity != null && confidence != null) {
      // No outcome, just C×C
      if (clarity >= 4 && confidence >= 4) frontLabel = 'Clarity sharp · high confidence';
      else if (clarity <= 2 && confidence <= 2) frontLabel = 'Low clarity · low confidence';
      else if (clarity >= 4) frontLabel = 'Clarity sharp';
      else if (clarity <= 2) frontLabel = 'Clarity low';
      else if (confidence >= 4) frontLabel = 'High confidence';
      else if (confidence <= 2) frontLabel = 'Confidence low';
      else frontLabel = 'Mind moderate';
    } else if (clarity != null) {
      frontLabel = clarity >= 4 ? 'Clarity sharp' : clarity <= 2 ? 'Clarity low' : 'Clarity moderate';
    } else if (confidence != null) {
      frontLabel = confidence >= 4 ? 'High confidence' : confidence <= 2 ? 'Confidence low' : 'Confidence moderate';
    } else {
      frontLabel = 'Mind assessed';
    }

    // Inline pattern: consecutive low days
    if (consecLowConf >= 3) {
      const ordinal = consecLowConf === 3 ? '3rd' : `${consecLowConf}th`;
      frontLabel += ` · ${ordinal} day`;
    } else if (consecLowClarity >= 3) {
      const ordinal = consecLowClarity === 3 ? '3rd' : `${consecLowClarity}th`;
      frontLabel += ` · ${ordinal} day low clarity`;
    }

    // Inline pattern: DOW comparison
    let mindQualifier = '';
    if (typicalDOW != null && score != null && score < typicalDOW - 10) {
      mindQualifier = ` · below your usual ${todayName}`;
    } else if (typicalDOW != null && score != null && score > typicalDOW + 10) {
      mindQualifier = ` · above your usual ${todayName}`;
    }

    // Back label: evidence
    const backParts: string[] = [];
    if (outcomeLabel) backParts.push(`Sharpness: ${outcomeLabel.toLowerCase()}`);
    if (clarity != null) backParts.push(`C:${clarity}/5`);
    if (confidence != null) backParts.push(`Co:${confidence}/5`);
    const backLabel = backParts.join(' · ');

    chips.push({ id: 'mind', label: frontLabel, backLabel: backLabel || undefined, color, qualifier: mindQualifier || undefined });
  }

  // Cap at 6 visible chips (Calendar is separate, so this only caps signal chips)
  return chips.slice(0, 6);
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
          "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-body transition-all duration-500",
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
          {!flipped && chip.qualifier && (
            <span className="opacity-70">{chip.qualifier}</span>
          )}
        </span>
      </button>
    </div>
  );
}

// ─── CALENDAR PILLS ───
function CalendarPills({ outerBrief }: { outerBrief: any }) {
  const hasCalendar = outerBrief?.hasCalendar ?? (outerBrief?.calendarState === 'active');
  const calendarState = outerBrief?.calendarState;
  const nextHS = outerBrief?.nextHighStakesEvent;
  const remainingHS: string[] = outerBrief?.remainingHighStakes ?? [];
  const calLoad = outerBrief?.calendarLoad ?? 'low';
  const loadLabel = calLoad === 'high' ? 'Heavy' : calLoad === 'medium' ? 'Moderate' : 'Light';
  const meetingCount = outerBrief?.meetingCount ?? 0;

  if (!hasCalendar && calendarState === 'not_connected') {
    return (
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => window.location.href = '/connected-data'}
          className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-body bg-muted/50 text-muted-foreground/60 border border-border/30 cursor-pointer active:scale-95 transition-transform"
        >
          Connect calendar
        </button>
      </div>
    );
  }

  if (!hasCalendar || meetingCount === 0) return null;

  // High-stakes within 90 mins — urgent orange pill
  if (nextHS?.title && nextHS?.minutesUntil != null && nextHS.minutesUntil <= 90) {
    const urgentLabel = nextHS.minutesUntil < 30
      ? `${nextHS.title} · now`
      : `${nextHS.title} · in ${nextHS.minutesUntil} mins`;
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-body bg-[hsl(var(--saffron))]/10 text-[hsl(var(--saffron))] border border-[hsl(var(--saffron))]/20 font-medium">
          {urgentLabel}
        </span>
        <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-body", calendarLoadPillStyle(calLoad))}>
          {loadLabel} day · {meetingCount} meetings
        </span>
      </div>
    );
  }

  // Regular calendar display
  const pills: JSX.Element[] = [];
  pills.push(
    <span key="load" className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-body", calendarLoadPillStyle(calLoad))}>
      {loadLabel} day · {meetingCount} meetings
    </span>
  );

  // Show next remaining high-stakes event with formatted time
  if (remainingHS.length > 0 && nextHS?.title) {
    const formatEventTime = (minsUntil: number) => {
      if (minsUntil < 30) return 'now';
      if (minsUntil < 90) return `in ${minsUntil} mins`;
      const eventTime = new Date(Date.now() + minsUntil * 60000);
      const h = eventTime.getHours();
      const m = eventTime.getMinutes();
      return m === 0 ? `${h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'}` : `${h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`;
    };
    const timeLabel = nextHS.minutesUntil != null ? formatEventTime(nextHS.minutesUntil) : 'ahead';
    pills.push(
      <span key="hs" className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-body italic", eventPillStyle)}>
        {remainingHS[0]} · {timeLabel}
      </span>
    );
  } else if (remainingHS.length > 0) {
    pills.push(
      <span key="hs" className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-body italic", eventPillStyle)}>
        {remainingHS[0]} · ahead
      </span>
    );
  }

  return <div className="flex flex-wrap gap-2 mt-2">{pills}</div>;
}

// ─── MAIN COMPONENT ───
const PerformanceReadinessBrief = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rawExpanded, setRawExpanded] = useState(false);

  const { data: energyState } = useQuery({
    queryKey: ['energy-state', user?.id],
    queryFn: async () => computeEnergyState(user?.id),
    enabled: !!user?.id,
    staleTime: 60000,
  });

  const { data: outerBrief } = useOuterReadiness();

  const score = energyState?.overallBalance ?? null;
  const tier = energyState?.energyTier ?? 'default';
  const hasCheckIn = !!energyState?.checkInOutcome;
  const checkInCountTotal = outerBrief?.checkInCountTotal ?? 0;

  // Build chips
  const chips = buildSignalChips(outerBrief, energyState, checkInCountTotal);

  // Phrase & body
  const phrase = outerBrief?.phrase || (hasCheckIn ? "Let's make today count." : "Begin with your check-in.");
  const bodyText = outerBrief?.bodyText || outerBrief?.context || (hasCheckIn
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

  // Data sources
  const dataSources: string[] = ['Check-in'];
  if (outerBrief?.hasCalendar || outerBrief?.calendarState === 'active') dataSources.push('calendar');
  if (outerBrief?.hasWearable) dataSources.push('wearable');
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
        <span className="text-[9px] text-muted-foreground/50 font-body">
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
            <span className={cn("text-[10px] uppercase tracking-wider font-medium ml-1", getTierColor(tier))}>
              {getTierLabel(tier)}
            </span>
          </>
        ) : (
          <>
            <span className="text-[40px] font-medium leading-none text-muted-foreground/30">--</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40 ml-2">Not yet assessed</span>
          </>
        )}
      </div>

      {/* 3. CALENDAR PILLS */}
      <CalendarPills outerBrief={outerBrief} />

      {/* 4. PHRASE */}
      <p className="mt-4 text-[17px] italic text-foreground/80" style={{ fontFamily: 'Georgia, serif' }}>
        {phrase}
      </p>

      {/* 5. BODY COPY */}
      {bodyText && (
        <p className="mt-2 text-[12px] text-muted-foreground/70 font-body leading-relaxed">
          {renderBody(bodyText)}
        </p>
      )}

      {/* 6. SIGNAL SECTION */}
      <div className="mt-4">
        <span className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground/50 font-body font-medium">
          Based on your signals
        </span>

        {/* 7. SIGNAL CHIPS */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {chips.map(chip => {
            const navMap: Record<string, string> = {
              'no-checkin': '/daily-check-in',
              'wearable-prompt': '/connected-data',
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

        {/* 8. FLIP AFFORDANCE HINT */}
        {chips.some(c => !!c.backLabel) && (
          <p className="mt-1.5 text-[9px] text-muted-foreground/40 font-body italic">
            Tap a pill to see the number behind it
          </p>
        )}
      </div>

      {/* 9. DIVIDER */}
      <div className="w-full h-px bg-gradient-to-r from-transparent via-[hsl(var(--taupe))]/20 to-transparent my-4" />

      {/* 10. HOW TO SHOW UP */}
      <span className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground/50 font-body font-medium">
        How to show up
      </span>

      {/* 11. LEAN ON */}
      {outerBrief?.leanOn && (() => {
        const pairs = parseSignalSourcePairs(outerBrief.leanOn);
        return (
          <div className="flex items-start gap-2 mt-3">
            <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              Lean on
            </span>
            <div className="flex-1 min-w-0">
              {pairs ? (
                <div className="space-y-0.5">
                  {pairs.map((pair, idx) => (
                    <p key={idx} className="text-[10px] text-foreground/80 font-body leading-relaxed">
                      {pair.signal} <span className="text-muted-foreground/50">· {pair.source}</span>
                    </p>
                  ))}
                </div>
              ) : (
                <>
                  <p className="text-[10px] text-foreground/80 font-body leading-relaxed">
                    {outerBrief.leanOn}
                  </p>
                  {leanOnSource && (
                    <p className="text-[9px] text-muted-foreground/55 font-body mt-0.5">
                      {leanOnSource}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* 12. WATCH FOR */}
      {outerBrief?.watchFor && (() => {
        const pairs = parseSignalSourcePairs(outerBrief.watchFor);
        return (
          <div className="flex items-start gap-2 mt-2">
            <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
              Watch for
            </span>
            <div className="flex-1 min-w-0">
              {pairs ? (
                <div className="space-y-0.5">
                  {pairs.map((pair, idx) => (
                    <p key={idx} className="text-[10px] text-foreground/80 font-body leading-relaxed">
                      {pair.signal} <span className="text-muted-foreground/50">· {pair.source}</span>
                    </p>
                  ))}
                </div>
              ) : (
                <>
                  <p className="text-[10px] text-foreground/80 font-body leading-relaxed">
                    {outerBrief.watchFor}
                  </p>
                  {watchForSource && (
                    <p className="text-[9px] text-muted-foreground/55 font-body mt-0.5">
                      {watchForSource}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* 13. DATA SOURCE NOTE */}
      <p className="mt-4 text-[9px] text-muted-foreground/35 font-body">
        {dataSources.join(' · ')}
      </p>

      {/* 14. TAP FOR RAW NUMBERS */}
      {hasCheckIn && (
        <Collapsible open={rawExpanded} onOpenChange={setRawExpanded}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center justify-end w-full mt-2 text-[9px] text-muted-foreground/35 font-body gap-1 hover:text-muted-foreground/50 transition-colors">
              {rawExpanded ? 'Hide raw numbers' : 'Tap for raw numbers ›'}
              {rawExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 p-3 rounded-lg bg-muted/30 border border-border/20">
            <div className="space-y-1 text-[10px] font-body text-muted-foreground/60">
              {outerBrief?.hasWearable && (
                <>
                  {outerBrief?.hrvValue != null && (
                    <div>HRV: {outerBrief.hrvValue}ms {outerBrief?.hrvBaseline ? `(${outerBrief?.hrvDeviation != null ? `${outerBrief.hrvDeviation > 0 ? '+' : ''}${outerBrief.hrvDeviation}%` : 'n/a'} vs your ${outerBrief.hrvBaseline}ms avg)` : '(baseline not yet established)'}</div>
                  )}
                  {outerBrief?.sleepDuration != null && (
                    <div>Sleep: {Math.floor(outerBrief.sleepDuration / 60)}h {outerBrief.sleepDuration % 60}m {outerBrief?.sleepBaseline ? `(${outerBrief?.sleepDeviation != null ? `${outerBrief.sleepDeviation > 0 ? '+' : ''}${outerBrief.sleepDeviation}%` : 'n/a'} vs your ${Math.floor(outerBrief.sleepBaseline / 60)}h avg)` : ''}</div>
                  )}
                  {outerBrief?.sleepScore != null && (
                    <div>Sleep score: {outerBrief.sleepScore} {outerBrief?.sleepBaseline && outerBrief?.sleepDuration == null ? `(vs your ${outerBrief.sleepBaseline} avg)` : ''}</div>
                  )}
                  {outerBrief?.rhrValue != null && (
                    <div>RHR: {outerBrief.rhrValue}bpm {outerBrief?.rhrBaseline ? `(${outerBrief?.rhrDeviation != null ? `${outerBrief.rhrDeviation > 0 ? '+' : ''}${outerBrief.rhrDeviation}%` : 'n/a'} vs your ${outerBrief.rhrBaseline}bpm avg)` : '(baseline not yet established)'}</div>
                  )}
                </>
              )}
              {(outerBrief?.clarityLevel) != null && (
                <div>Clarity: {outerBrief.clarityLevel}/5</div>
              )}
              {(outerBrief?.confidenceLevel) != null && (
                <div>Confidence: {outerBrief.confidenceLevel}/5</div>
              )}
              <div>Score: {score ?? '--'} ({getTierLabel(tier).toLowerCase()})</div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};

export default PerformanceReadinessBrief;
