/**
 * PerformanceReadinessBrief – unified card replacing TodayStateCard + StrategicIntentionCard
 * Variant A only: interpretation chips with tap-to-flip number reveal.
 */

import { useState } from 'react';
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

const chipDotColor = (color: SignalChip['color']) => {
  switch (color) {
    case 'red': return 'bg-red-500';
    case 'amber': return 'bg-amber-500';
    case 'green': return 'bg-emerald-500';
    default: return 'bg-muted-foreground/40';
  }
};

const chipBgColor = (color: SignalChip['color']) => {
  switch (color) {
    case 'red': return 'bg-red-500/8 border-red-500/15';
    case 'amber': return 'bg-amber-500/8 border-amber-500/15';
    case 'green': return 'bg-emerald-500/8 border-emerald-500/15';
    default: return 'bg-muted/50 border-border/30';
  }
};

// Map leanOnSource keys to human-readable source labels
const getSourceLabel = (source: string | undefined): string => {
  if (!source) return '';
  switch (source) {
    case 'coach-insights-recent':
    case 'coach-insights-grace':
      return 'From coach conversations';
    case 'cc-modifier':
    case 'cc-modifier-with-context':
      return 'From your check-in today';
    case 'coach-partial-strength':
    case 'coach-partial-growth':
      return 'Coach + archetype';
    case 'archetype-tier':
      return 'From your archetype';
    case 'tier-fallback':
    case 'sunday-evening-override':
    case 'evening-recovery-override':
      return 'From readiness score';
    default:
      return '';
  }
};

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

// ─── CHIP BUILDER (deterministic, no LLM) ───
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

  if (!hasCheckIn) {
    const promptChips: SignalChip[] = [{ id: 'no-checkin', label: 'Check in to unlock your state', color: 'neutral' }];
    if (tier === 'none') {
      promptChips.push({ id: 'wearable-prompt', label: 'Connect wearable', color: 'neutral' });
    }
    return promptChips;
  }

  // Longitudinal qualifier – suppressed for Apple Health < 14 days
  const getQualifier = (isWorst10?: boolean, isBest7d?: boolean): string => {
    if (tier !== 'full') return '';
    if (isAppleHealth && wearableDays < 14) return ''; // Apple Health HRV inconsistency
    if (checkInCountTotal < 7) return '';
    if (isWorst10) {
      if (checkInCountTotal >= 15) return ' · unusual for you';
      return ' · unusual this week';
    }
    if (isBest7d) return ' · best this week';
    return '';
  };

  // Tier qualifier suffix
  const tierSuffix = tier === 'absolute' ? ' · establishing baseline' : tier === 'partial' ? ' · early reading' : '';

  // Helper for back labels with baseline context
  const hrvBaseline = outerBrief?.hrvBaseline;
  const sleepBaseline = outerBrief?.sleepBaseline;
  const rhrBaseline = outerBrief?.rhrBaseline;

  const hrvBackLabel = (val: number | null, dev: number | null): string => {
    if (val == null) return '';
    if (tier === 'full' && hrvBaseline) return `HRV: ${val}ms (${dev != null && dev >= 0 ? '+' : ''}${dev}% vs your ${hrvBaseline}ms avg)`;
    return `HRV: ${val}ms (baseline not yet established)`;
  };

  const sleepBackLabel = (dur: number | null, dev: number | null, score: number | null): string => {
    if (dur != null) {
      const hrs = Math.floor(dur / 60);
      const mins = dur % 60;
      const durStr = mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
      if (tier === 'full' && sleepBaseline) {
        const avgHrs = Math.floor(sleepBaseline / 60);
        return `Sleep: ${durStr} (${dev != null && dev >= 0 ? '+' : ''}${dev}% vs your ${avgHrs}h avg)`;
      }
      return `Sleep: ${durStr}`;
    }
    if (score != null) {
      if (tier === 'full' && sleepBaseline) return `Sleep score: ${score} (${dev != null && dev >= 0 ? '+' : ''}${dev}% vs your ${sleepBaseline} avg)`;
      return `Sleep score: ${score}`;
    }
    return '';
  };

  const rhrBackLabel = (val: number | null, dev: number | null): string => {
    if (val == null) return '';
    if (tier === 'full' && rhrBaseline) return `RHR: ${val}bpm (${dev != null && dev >= 0 ? '+' : ''}${dev}% vs your ${rhrBaseline}bpm avg)`;
    return `RHR: ${val}bpm (baseline not yet established)`;
  };

  // ── Wearable chips by tier ──
  if (tier === 'full') {
    // Full deviation-based logic
    const hrvDev = outerBrief?.hrvDeviation;
    const hrvVal = outerBrief?.hrvValue;
    if (hrvDev != null) {
      if (hrvDev < -15) {
        chips.push({ id: 'hrv', label: 'Body under load', backLabel: hrvBackLabel(hrvVal, hrvDev), color: 'red', qualifier: getQualifier(true) });
      } else if (hrvDev >= -15 && hrvDev < -8) {
        chips.push({ id: 'hrv', label: 'Body under mild load', backLabel: hrvBackLabel(hrvVal, hrvDev), color: 'amber' });
      } else if (hrvDev > 15) {
        chips.push({ id: 'hrv', label: 'Body recovered', backLabel: hrvBackLabel(hrvVal, hrvDev), color: 'green', qualifier: getQualifier(false, true) });
      } else if (hrvDev > 8) {
        chips.push({ id: 'hrv', label: 'Body recovered', backLabel: hrvBackLabel(hrvVal, hrvDev), color: 'green' });
      }
    }

    // Sleep
    const sleepDev = outerBrief?.sleepDeviation;
    const sleepDur = outerBrief?.sleepDuration;
    const sleepScore = outerBrief?.sleepScore;
    if (sleepDur != null && sleepDur < 360) {
      chips.push({ id: 'sleep', label: 'Short sleep', backLabel: sleepBackLabel(sleepDur, sleepDev, sleepScore), color: 'red' });
    } else if (sleepDev != null) {
      if (sleepDev < -15) {
        chips.push({ id: 'sleep', label: 'Poor sleep', backLabel: sleepBackLabel(sleepDur, sleepDev, sleepScore), color: 'red', qualifier: ' · below your avg' });
      } else if (sleepDev > 10) {
        chips.push({ id: 'sleep', label: 'Well rested', backLabel: sleepBackLabel(sleepDur, sleepDev, sleepScore), color: 'green', qualifier: ' · above your avg' });
      }
    }

    // RHR (deviation-based)
    const rhrDev = outerBrief?.rhrDeviation;
    const rhrVal = outerBrief?.rhrValue;
    if (rhrDev != null) {
      if (rhrDev > 20) {
        chips.push({ id: 'rhr', label: 'HR elevated', backLabel: rhrBackLabel(rhrVal, rhrDev), color: 'red' });
      } else if (rhrDev > 10) {
        chips.push({ id: 'rhr', label: 'HR elevated', backLabel: rhrBackLabel(rhrVal, rhrDev), color: 'amber' });
      }
      // <= 10%: omit (including negative — low RHR is good)
    }
  } else if (tier === 'partial') {
    // Partial: use available deviation with "early reading" suffix, no personal qualifiers
    const hrvDev = outerBrief?.hrvDeviation;
    const hrvVal = outerBrief?.hrvValue;
    if (hrvDev != null) {
      if (hrvDev < -15) {
        chips.push({ id: 'hrv', label: 'Body under load', backLabel: hrvBackLabel(hrvVal, hrvDev), color: 'red', qualifier: tierSuffix });
      } else if (hrvDev >= -15 && hrvDev < -8) {
        chips.push({ id: 'hrv', label: 'Body under mild load', backLabel: hrvBackLabel(hrvVal, hrvDev), color: 'amber', qualifier: tierSuffix });
      } else if (hrvDev > 8) {
        chips.push({ id: 'hrv', label: 'Body recovered', backLabel: hrvBackLabel(hrvVal, hrvDev), color: 'green', qualifier: tierSuffix });
      }
    }

    const sleepDev = outerBrief?.sleepDeviation;
    const sleepDur = outerBrief?.sleepDuration;
    const sleepScore = outerBrief?.sleepScore;
    if (sleepDur != null && sleepDur < 360) {
      chips.push({ id: 'sleep', label: 'Short sleep', backLabel: sleepBackLabel(sleepDur, sleepDev, sleepScore), color: 'red', qualifier: tierSuffix });
    } else if (sleepDev != null) {
      if (sleepDev < -15) {
        chips.push({ id: 'sleep', label: 'Poor sleep', backLabel: sleepBackLabel(sleepDur, sleepDev, sleepScore), color: 'red', qualifier: tierSuffix });
      } else if (sleepDev > 10) {
        chips.push({ id: 'sleep', label: 'Well rested', backLabel: sleepBackLabel(sleepDur, sleepDev, sleepScore), color: 'green', qualifier: tierSuffix });
      }
    }

    const rhrDev = outerBrief?.rhrDeviation;
    const rhrVal = outerBrief?.rhrValue;
    if (rhrDev != null) {
      if (rhrDev > 20) {
        chips.push({ id: 'rhr', label: 'HR elevated', backLabel: rhrBackLabel(rhrVal, rhrDev), color: 'red', qualifier: tierSuffix });
      } else if (rhrDev > 10) {
        chips.push({ id: 'rhr', label: 'HR elevated', backLabel: rhrBackLabel(rhrVal, rhrDev), color: 'amber', qualifier: tierSuffix });
      }
    }
  } else if (tier === 'absolute') {
    // Absolute thresholds for day 1-2, no history
    const hrvVal = outerBrief?.hrvValue;
    const sleepDur = outerBrief?.sleepDuration;
    const sleepScore = outerBrief?.sleepScore;
    const rhrVal = outerBrief?.rhrValue;

    if (hrvVal != null) {
      if (hrvVal < 20) {
        chips.push({ id: 'hrv', label: 'Body under significant load', backLabel: hrvBackLabel(hrvVal, null), color: 'red', qualifier: tierSuffix });
      } else if (hrvVal < 40) {
        chips.push({ id: 'hrv', label: 'Body under load', backLabel: hrvBackLabel(hrvVal, null), color: 'amber', qualifier: tierSuffix });
      } else if (hrvVal > 70) {
        chips.push({ id: 'hrv', label: 'Body well recovered', backLabel: hrvBackLabel(hrvVal, null), color: 'green', qualifier: tierSuffix });
      }
    }

    // Sleep: prefer score if available, else duration
    if (sleepScore != null) {
      if (sleepScore < 60) {
        chips.push({ id: 'sleep', label: 'Poor sleep', backLabel: sleepBackLabel(sleepDur, null, sleepScore), color: 'red', qualifier: tierSuffix });
      } else if (sleepScore > 75) {
        chips.push({ id: 'sleep', label: 'Well rested', backLabel: sleepBackLabel(sleepDur, null, sleepScore), color: 'green', qualifier: tierSuffix });
      }
    } else if (sleepDur != null) {
      if (sleepDur < 360) {
        chips.push({ id: 'sleep', label: 'Short sleep', backLabel: sleepBackLabel(sleepDur, null, null), color: 'red', qualifier: tierSuffix });
      } else if (sleepDur < 420) {
        chips.push({ id: 'sleep', label: 'Light sleep', backLabel: sleepBackLabel(sleepDur, null, null), color: 'amber', qualifier: tierSuffix });
      }
    }

    if (rhrVal != null) {
      if (rhrVal > 90) {
        chips.push({ id: 'rhr', label: 'HR elevated', backLabel: rhrBackLabel(rhrVal, null), color: 'red', qualifier: tierSuffix });
      } else if (rhrVal > 80) {
        chips.push({ id: 'rhr', label: 'HR elevated', backLabel: rhrBackLabel(rhrVal, null), color: 'amber', qualifier: tierSuffix });
      }
    }
  } else {
    // none: prompt chip
    chips.push({ id: 'wearable-prompt', label: 'Connect wearable for full intelligence', color: 'neutral' });
  }

  // ── Felt state chips ──
  const outcome = energyState?.checkInOutcome;
  if (outcome === 'focused') {
    const coachMatch = outerBrief?.coachStrength?.toLowerCase()?.includes('focus');
    chips.push({
      id: 'felt',
      label: 'Mind sharp',
      color: 'green',
      qualifier: coachMatch ? ' · your strength' : '',
    });
  } else if (outcome === 'scattered') {
    chips.push({ id: 'felt', label: 'Mind scattered', color: 'red' });
  } else if (outcome === 'drained' || outcome === 'overwhelmed') {
    chips.push({ id: 'felt', label: 'Mind depleted', color: 'red' });
  }

  // ── C×C chips ──
  const clarity = outerBrief?.clarityLevel;
  const confidence = outerBrief?.confidenceLevel;
  if (clarity != null) {
    if (clarity >= 4) chips.push({ id: 'clarity', label: 'Clarity strong', backLabel: `Clarity ${clarity}/5`, color: 'green' });
    else if (clarity <= 2) chips.push({ id: 'clarity', label: 'Clarity low', backLabel: `Clarity ${clarity}/5`, color: 'red' });
  }
  if (confidence != null) {
    if (confidence >= 4) chips.push({ id: 'confidence', label: 'High confidence', backLabel: `Confidence ${confidence}/5`, color: 'green' });
    else if (confidence <= 2) {
      const consec = outerBrief?.consecutiveLowConfidence ?? 0;
      const qual = consec >= 3 ? ` · ${consec}th day` : '';
      chips.push({ id: 'confidence', label: 'Confidence low', backLabel: `Confidence ${confidence}/5`, color: 'amber', qualifier: qual });
    }
  }

  return chips.slice(0, 5);
}

// ─── INNER SUMMARY LINE ───
function buildInnerSummary(chips: SignalChip[]): string | null {
  if (chips.length === 0 || chips[0].id === 'no-checkin') return null;

  const worstChip = [...chips].sort((a, b) => {
    const rank = { red: 0, amber: 1, neutral: 2, green: 3 };
    return rank[a.color] - rank[b.color];
  })[0];

  const bestChip = [...chips].sort((a, b) => {
    const rank = { green: 0, neutral: 1, amber: 2, red: 3 };
    return rank[a.color] - rank[b.color];
  })[0];

  const cxcChip = chips.find(c => c.id === 'clarity' || c.id === 'confidence');

  const parts: string[] = [];
  if (worstChip) parts.push(worstChip.label);
  if (bestChip && bestChip.id !== worstChip?.id) parts.push(bestChip.label);
  if (cxcChip && cxcChip.id !== worstChip?.id && cxcChip.id !== bestChip?.id) parts.push(cxcChip.label);

  return parts.slice(0, 3).join(' · ') || null;
}

// ─── FLIPPABLE CHIP COMPONENT ───
function FlippableChip({ chip, onNavigate }: { chip: SignalChip; onNavigate?: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const hasBack = !!chip.backLabel;

  const handleClick = () => {
    if (onNavigate) {
      onNavigate();
      return;
    }
    if (hasBack) setFlipped(!flipped);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-body transition-all duration-300",
        "border",
        chipBgColor(chip.color),
        (hasBack || onNavigate) && "cursor-pointer active:scale-95",
        !hasBack && !onNavigate && "cursor-default"
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", chipDotColor(chip.color))} />
      <span className="text-foreground/80 whitespace-nowrap">
        {flipped && chip.backLabel ? chip.backLabel : chip.label}
        {!flipped && chip.qualifier && (
          <span className="text-muted-foreground/60">{chip.qualifier}</span>
        )}
      </span>
    </button>
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
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-body bg-muted/50 text-muted-foreground/70 border border-border/30">
          {loadLabel} day · {meetingCount} meetings
        </span>
      </div>
    );
  }

  // Regular calendar display
  const pills: JSX.Element[] = [];
  pills.push(
    <span key="load" className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-body bg-muted/50 text-muted-foreground/70 border border-border/30">
      {loadLabel} day · {meetingCount} meetings
    </span>
  );

  // Show next remaining high-stakes event with formatted time
  if (remainingHS.length > 0 && nextHS?.title) {
    // nextHS has minutesUntil — use it for time label
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
      <span key="hs" className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-body bg-muted/50 text-muted-foreground/70 border border-border/30 italic">
        {remainingHS[0]} · {timeLabel}
      </span>
    );
  } else if (remainingHS.length > 0) {
    // Fallback: no nextHS timing data, just show "ahead"
    pills.push(
      <span key="hs" className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-body bg-muted/50 text-muted-foreground/70 border border-border/30 italic">
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
  const innerSummary = buildInnerSummary(chips);

  // Phrase & body
  const phrase = outerBrief?.phrase || (hasCheckIn ? "Let's make today count." : "Begin with your check-in.");
  const bodyText = outerBrief?.bodyText || outerBrief?.context || (hasCheckIn
    ? null
    : "Check in to activate your personalised intelligence — takes two minutes.");

  // Parse body for bold (**text**)
  const renderBody = (text: string) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
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

        {/* 8. INNER SUMMARY */}
        {innerSummary && (
          <p className="mt-2 text-[11px] text-muted-foreground/60 font-body font-medium">
            {innerSummary}
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
      {outerBrief?.leanOn && (
        <div className="flex items-start gap-2 mt-3">
          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            Lean on
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-foreground/80 font-body leading-relaxed">
              {outerBrief.leanOn}
            </p>
            {leanOnSource && (
              <p className="text-[9px] text-muted-foreground/55 font-body mt-0.5">
                {leanOnSource}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 12. WATCH FOR */}
      {outerBrief?.watchFor && (
        <div className="flex items-start gap-2 mt-2">
          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
            Watch for
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-foreground/80 font-body leading-relaxed">
              {outerBrief.watchFor}
            </p>
            {watchForSource && (
              <p className="text-[9px] text-muted-foreground/55 font-body mt-0.5">
                {watchForSource}
              </p>
            )}
          </div>
        </div>
      )}

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
