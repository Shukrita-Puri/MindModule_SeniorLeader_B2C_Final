import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ==================== AUTH0 VERIFICATION ====================
async function verifyAuth0Token(authHeader: string): Promise<string> {
  const token = authHeader.replace('Bearer ', '');
  const auth0Domain = Deno.env.get('AUTH0_DOMAIN');
  if (!auth0Domain) throw new Error('AUTH0_DOMAIN not configured');
  
  const response = await fetch(`https://${auth0Domain}/userinfo`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Invalid token');
  const userInfo = await response.json();
  return userInfo.sub;
}

// ==================== TYPES ====================
type EnergyTier = 'depleted' | 'managing' | 'strong' | 'peak';
type CalendarLevel = 'low' | 'medium' | 'high';
type ThemeDriver = 'pressure+load' | 'pressure' | 'load' | 'morning' | 'evening' | 'state';

interface OuterReadinessResult {
  phrase: string;
  context: string;
  leanOn: string;
  watchFor: string;
  driver: ThemeDriver;
  dataSources: string[];
}

interface ComputeRequest {
  innerReadinessTier: EnergyTier;
  innerReadinessScore: number;
  calendarLoad: CalendarLevel | null;
  calendarPressure: CalendarLevel | null;
  archetype: string | null;
  clarityLevel: number | null;
  confidenceLevel: number | null;
  checkInOutcome: string | null;
  timezoneOffset?: number;
}

// ==================== TIME HELPERS ====================
function getUserTime(timezoneOffset: number): Date {
  const now = new Date();
  return new Date(now.getTime() - timezoneOffset * 60000);
}

function getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

function isLateEvening(hour: number): boolean {
  return hour >= 21 || hour < 6;
}

type DayContext = 'weekday' | 'friday' | 'saturday' | 'sunday';
function getDayContext(dayOfWeek: number): DayContext {
  if (dayOfWeek === 5) return 'friday';
  if (dayOfWeek === 6) return 'saturday';
  if (dayOfWeek === 0) return 'sunday';
  return 'weekday';
}

// ==================== THEME MATRIX (v3.0 — 40 themes) ====================
function getTheme(
  tier: EnergyTier,
  pressure: CalendarLevel | null,
  load: CalendarLevel | null,
  score: number,
  hour: number,
  dayOfWeek: number,
): { phrase: string; context: string; driver: ThemeDriver } {
  
  // No calendar connected — tier-only fallbacks with sub-tier precision
  if (pressure === null || load === null) {
    return getNoCalendarTheme(tier, score, hour, dayOfWeek);
  }

  const timeOfDay = getTimeOfDay(hour);
  const dayCtx = getDayContext(dayOfWeek);

  // DEPLETED TIER
  if (tier === 'depleted') {
    if (pressure === 'high' && load === 'high')
      return { phrase: "One thing at a time.", context: "A heavy and high-stakes calendar is meeting a leader running below full capacity. What genuinely requires your full presence today, and what can be held or delegated?", driver: 'pressure+load' };
    if (pressure === 'high' && load === 'medium')
      return { phrase: "Protect what matters.", context: "Significant stakes ahead with a manageable schedule. The space exists to be selective. Where you spend your capacity today determines the quality of your most important moments.", driver: 'pressure+load' };
    if (pressure === 'high' && load === 'low')
      return { phrase: "Reserve for the moment.", context: "High stakes on a light schedule, a rare alignment. Your recovery window today is also your preparation window.", driver: 'pressure' };
    if (pressure === 'medium' && load === 'high')
      return { phrase: "Navigate, don't absorb.", context: "A dense calendar without the high-stakes pressure of your hardest days. Steady passage through the volume is the goal, not deep engagement with each moment.", driver: 'load' };
    if (load === 'high' && pressure === 'low')
      return { phrase: "Move through gently.", context: "High volume without high stakes. The risk today is volume draining what little reserve you have. Move through rather than absorb.", driver: 'load' };
    if (load === 'medium')
      return { phrase: "Pace and protect.", context: "A moderate day that asks you to be present without overspending. Each recovery window between engagements is worth protecting.", driver: 'load' };
    if (load === 'low')
      return { phrase: "Rest is the work.", context: "A light calendar and a depleted system. Today's most productive act is genuine recovery.", driver: 'load' };
    if (timeOfDay === 'morning')
      return { phrase: "Begin with intention.", context: "Starting the day in a depleted state with demands ahead. How you enter each moment today matters more than how much you do.", driver: 'morning' };
    if (timeOfDay === 'evening') {
      if (dayCtx === 'sunday')
        return { phrase: "Close before the week.", context: "Ending the weekend in a low-reserve state means Monday starts in deficit. What tonight holds matters more than it might feel like it does.", driver: 'evening' };
      if (dayCtx === 'friday')
        return { phrase: "Release the week.", context: "The week is done. A depleted system needs genuine release, not just the absence of work.", driver: 'evening' };
      return { phrase: "Close before tomorrow.", context: "What you don't release tonight you carry into tomorrow's first decisions and interactions.", driver: 'evening' };
    }
    return { phrase: "Protect your reserves.", context: "The demands ahead need to be met with what you have. Deliberate pacing is your strategy today.", driver: 'state' };
  }

  // MANAGING TIER
  if (tier === 'managing') {
    if (pressure === 'high' && load === 'high')
      return { phrase: "Hold your ground.", context: "Your most demanding conditions are meeting an operational leader. Steadiness through the full weight of the day is both the challenge and the achievement.", driver: 'pressure+load' };
    if (pressure === 'high' && load === 'medium')
      return { phrase: "Steady into the stakes.", context: "High-stakes moments ahead with a manageable schedule. You have the capacity to show up well for what matters most today.", driver: 'pressure+load' };
    if (pressure === 'high' && load === 'low')
      return { phrase: "Depth over breadth.", context: "Significant stakes on a clear schedule. Your operating capacity is well-matched to the important moments today if you protect the space around them.", driver: 'pressure' };
    if (pressure === 'medium' && load === 'high')
      return { phrase: "Rhythm over intensity.", context: "A dense calendar at your current capacity calls for consistent pacing. Sustainable engagement through the full day rather than peaks and drops.", driver: 'load' };
    if (load === 'high' && pressure === 'low')
      return { phrase: "Ride the rhythm.", context: "High volume without high stakes. A day to move steadily through rather than push against.", driver: 'load' };
    if (load === 'medium')
      return { phrase: "Steady execution.", context: "Moderate demands meeting moderate capacity. A well-matched day for consistent, quality output.", driver: 'load' };
    if (load === 'low')
      return { phrase: "Build your reserves.", context: "Light demands on a managing state. A genuine opportunity to invest rather than spend today.", driver: 'load' };
    if (timeOfDay === 'morning')
      return { phrase: "Set a sustainable pace.", context: "The full shape of the day is ahead. How you pace the opening determines whether you finish well.", driver: 'morning' };
    if (timeOfDay === 'evening') {
      if (dayCtx === 'sunday')
        return { phrase: "Close into the week.", context: "Sunday evening is its own transition. How you close it is how you open the week. A clean close here protects Monday's first hours.", driver: 'evening' };
      if (dayCtx === 'friday')
        return { phrase: "Let the week go.", context: "You've carried the week at operating capacity. The weekend is a genuine recovery window if you let the work threads close.", driver: 'evening' };
      return { phrase: "Close with care.", context: "You've carried the day's demands at operating capacity. How you close is how you recover.", driver: 'evening' };
    }
    return { phrase: "Maintain your rhythm.", context: "Today calls for consistent, sustainable engagement. Protecting your operational state through the full shape of the day.", driver: 'state' };
  }

  // STRONG TIER
  if (tier === 'strong') {
    if (pressure === 'high' && load === 'high')
      return { phrase: "Lead from strength.", context: "Your most demanding conditions are meeting a well-resourced leader. A day where your readiness is genuinely being asked for.", driver: 'pressure+load' };
    if (pressure === 'high' && load === 'medium')
      return { phrase: "Execute with presence.", context: "Significant stakes ahead with a focused schedule. You have both the capacity and the space to bring your best to the moments that count.", driver: 'pressure+load' };
    if (pressure === 'high' && load === 'low')
      return { phrase: "Bring your full weight.", context: "High stakes with room to prepare and recover. Conditions that allow your strongest leadership to show up fully.", driver: 'pressure' };
    if (pressure === 'medium' && load === 'high')
      return { phrase: "Sustain the quality.", context: "A dense calendar with real stakes. Your above-baseline capacity is what keeps quality consistent across the full day.", driver: 'load' };
    if (load === 'high' && pressure === 'low')
      return { phrase: "Move with confidence.", context: "High volume meets strong capacity. A day you can move through with assurance rather than caution.", driver: 'load' };
    if (load === 'medium')
      return { phrase: "Invest the advantage.", context: "Above-baseline readiness on a selective day. The conditions are there to go deep on what matters rather than wide across everything.", driver: 'load' };
    if (load === 'low')
      return { phrase: "Protect and build.", context: "Strong readiness on a light day. Rare conditions for deep work, strategic thinking, or genuine recovery that compounds forward.", driver: 'load' };
    if (timeOfDay === 'morning')
      return { phrase: "Protect the window.", context: "Strong readiness at the start of the day. How you use the opening hours determines how much of this advantage you carry through.", driver: 'morning' };
    if (timeOfDay === 'evening') {
      if (dayCtx === 'sunday')
        return { phrase: "Carry it into Monday.", context: "Strong readiness at the close of the weekend is a real asset. Protecting tonight means carrying that advantage into Monday rather than spending it before the week begins.", driver: 'evening' };
      if (dayCtx === 'friday')
        return { phrase: "Close the week strong.", context: "Above-baseline readiness at the end of the week. A strong close sets the foundation for genuine weekend recovery.", driver: 'evening' };
      return { phrase: "Close strong.", context: "Above-baseline capacity at close of day. A strong finish is within reach and worth protecting.", driver: 'evening' };
    }
    return { phrase: "Leverage your position.", context: "You are above baseline today. The question is where that advantage is most worth investing.", driver: 'state' };
  }

  // PEAK TIER
  if (pressure === 'high' && load === 'high')
    return { phrase: "Peak performance day.", context: "Your most demanding calendar is meeting your fullest readiness. A genuine high-leverage day where your leadership capacity is fully called upon.", driver: 'pressure+load' };
  if (pressure === 'high' && load === 'medium')
    return { phrase: "Execute with precision.", context: "High stakes on a focused schedule. Conditions for your sharpest, most decisive leadership are fully in place.", driver: 'pressure+load' };
  if (pressure === 'high' && load === 'low')
    return { phrase: "Seize the high ground.", context: "Your highest readiness meeting your most important moments with space to prepare. Rare and powerful conditions.", driver: 'pressure' };
  if (pressure === 'medium' && load === 'high')
    return { phrase: "Channel the capacity.", context: "A full calendar meeting your fullest state. Directing that capacity with precision prevents diffusion across the volume.", driver: 'load' };
  if (load === 'high' && pressure === 'low')
    return { phrase: "Move with full confidence.", context: "High volume, full capacity. A day to move through with assurance and presence across the full schedule.", driver: 'load' };
  if (load === 'medium')
    return { phrase: "Depth and precision.", context: "Selective demands meeting peak readiness. Conditions for the quality of leadership that defines your best days.", driver: 'load' };
  if (load === 'low')
    return { phrase: "Deep work window.", context: "Peak readiness on a protected schedule. Among the rarest conditions for your highest-value thinking and most important work.", driver: 'load' };
  if (timeOfDay === 'morning')
    return { phrase: "Protect the peak.", context: "Full readiness at the start of the day, a window that is both rare and perishable. How you open the day determines how much of it you carry through.", driver: 'morning' };
  if (timeOfDay === 'evening') {
    if (dayCtx === 'sunday')
      return { phrase: "Protect it for Monday.", context: "Full readiness on a Sunday evening is worth protecting deliberately. How you close tonight determines whether that state is still available when the week's first demands arrive.", driver: 'evening' };
    if (dayCtx === 'friday')
      return { phrase: "Close at the peak.", context: "Peak readiness at week's end. A deliberate close tonight protects this state into the weekend.", driver: 'evening' };
    return { phrase: "Close with intention.", context: "Peak activation at the close of the day. A structured, intentional close protects tonight's recovery and tomorrow's readiness.", driver: 'evening' };
  }
  return { phrase: "Own your optimal state.", context: "Full readiness is present. The priority is protecting that state through the full shape of what the day holds.", driver: 'state' };
}

// ==================== NO-CALENDAR FALLBACKS (sub-tier + time-aware) ====================
function getNoCalendarTheme(tier: EnergyTier, score: number, hour: number, dayOfWeek: number): { phrase: string; context: string; driver: ThemeDriver } {
  const dayCtx = getDayContext(dayOfWeek);
  const lateEvening = isLateEvening(hour);

  if (tier === 'depleted') {
    if (lateEvening) {
      if (dayCtx === 'sunday')
        return { phrase: "Rest before the week.", context: "Ending the weekend in a low-reserve state means Monday starts in deficit. What tonight holds matters more than it might feel like it does.", driver: 'state' };
      return { phrase: "Let the day close.", context: "Your system has already given what it had. The most important thing now is genuine release and recovery.", driver: 'state' };
    }
    if (score <= 25)
      return { phrase: "Begin with stillness.", context: "Leading from a deeply depleted state asks more of your self-awareness than almost any other condition. Every interaction and judgment today carries a higher cost than usual.", driver: 'state' };
    return { phrase: "Protect your reserves.", context: "Below-baseline readiness shapes every interaction today. How much you spend, and on what, is the decision that matters most right now.", driver: 'state' };
  }
  if (tier === 'managing') {
    if (lateEvening) {
      if (dayCtx === 'sunday')
        return { phrase: "Close into the week.", context: "Sunday evening is its own transition. How you close it is how you open the week. A clean close here protects Monday's first hours.", driver: 'state' };
      return { phrase: "Close the day cleanly.", context: "Operational capacity has served its purpose today. A clean close now protects tomorrow's opening state.", driver: 'state' };
    }
    if (score <= 49)
      return { phrase: "Operate with care.", context: "Operational but not at full capacity. A day for selective investment of your leadership presence rather than broad deployment.", driver: 'state' };
    return { phrase: "Steady and selective.", context: "Baseline readiness is present. You have capacity to show up well for what matters if you're deliberate about where it goes.", driver: 'state' };
  }
  if (tier === 'strong') {
    if (lateEvening) {
      if (dayCtx === 'sunday')
        return { phrase: "Carry it into Monday.", context: "Strong readiness at the close of the weekend is a real asset. Protecting tonight means carrying that advantage into Monday.", driver: 'state' };
      return { phrase: "Protect tomorrow's advantage.", context: "Above-baseline readiness at this hour is worth protecting through deliberate wind-down rather than spending.", driver: 'state' };
    }
    if (score <= 69)
      return { phrase: "Lead with confidence.", context: "Above-baseline readiness is a real leadership asset today. Your presence, judgment, and influence are all working well for you.", driver: 'state' };
    return { phrase: "Invest your advantage.", context: "Strong readiness gives you the conditions for your best thinking and leadership presence. The question is where that advantage is most worth directing.", driver: 'state' };
  }
  // Peak
  if (lateEvening) {
    if (dayCtx === 'sunday')
      return { phrase: "Protect it for Monday.", context: "Full readiness on a Sunday evening is worth protecting deliberately. How you close tonight determines whether that state is still available when the week's first demands arrive.", driver: 'state' };
    return { phrase: "Wind down deliberately.", context: "Peak activation at this hour needs a deliberate transition. Your nervous system needs the wind-down even when your mind doesn't.", driver: 'state' };
  }
  if (score <= 89)
    return { phrase: "Bring your full presence.", context: "Full readiness. Your capacity for complex decisions, difficult conversations, and high-stakes leadership is at its highest.", driver: 'state' };
  return { phrase: "Own your peak.", context: "Exceptional readiness is present. A rare state that is worth both using fully and protecting deliberately.", driver: 'state' };
}

// ==================== LEAN ON / WATCH FOR ====================

// Late evening (9 PM+) recovery-oriented Lean On / Watch For by tier
const eveningTierInsights: Record<EnergyTier, { leanOn: string; watchFor: string }> = {
  depleted: {
    leanOn: "Your awareness that your system has already given what it had. Permission to stop is itself a form of leadership.",
    watchFor: "Replaying the day when what your system actually needs is release.",
  },
  managing: {
    leanOn: "Your capacity to close cleanly. The day is done and your system knows it.",
    watchFor: "Carrying unfinished mental threads into the hours your body needs to recover.",
  },
  strong: {
    leanOn: "Your ability to transition. You can shift from performance mode to recovery mode deliberately.",
    watchFor: "Staying in problem-solving mode past the point where it serves tomorrow.",
  },
  peak: {
    leanOn: "Your discipline to protect recovery even when your system still feels activated. High output needs high-quality rest.",
    watchFor: "Mistaking late-night activation for productive energy. Your nervous system needs the wind-down even when your mind doesn't.",
  },
};

// Sunday evening Lean On / Watch For by tier
const sundayEveningInsights: Record<EnergyTier, { leanOn: string; watchFor: string }> = {
  depleted: {
    leanOn: "Your awareness that starting the week already depleted is itself useful information. What you protect tonight is the most important leadership decision you make before Monday.",
    watchFor: "Pushing through Sunday evening when your system needs recovery. Deficit carried into Monday compounds through the week.",
  },
  managing: {
    leanOn: "Your capacity to close the weekend cleanly and set a deliberate intention for how you want to enter the week.",
    watchFor: "Drifting into Monday without a clear internal anchor. Operational capacity without direction diffuses quickly.",
  },
  strong: {
    leanOn: "Your readiness to open the week from a position of genuine strength. Above-baseline on a Sunday evening is a real advantage if protected.",
    watchFor: "Spending Sunday evening energy on low-value thinking when the higher-leverage move is protecting the state you're already in.",
  },
  peak: {
    leanOn: "Full readiness at the start of the week is among the rarest and most valuable conditions. Your priority tonight is protecting it, not spending it.",
    watchFor: "Using peak Sunday activation for work or planning rather than genuine wind-down. The week needs this state intact, not already drawn from.",
  },
};

// Priority 2: C+C Signal Modifier
function getCCModifier(clarity: number | null, confidence: number | null): { leanOn: string; watchFor: string } | null {
  const c = clarity ?? 3;
  const conf = confidence ?? 3;
  const avg = (c + conf) / 2;
  
  if (avg <= 2.5) {
    const lowC = c <= 2.5;
    const lowConf = conf <= 2.5;
    if (lowC && lowConf)
      return { leanOn: "Your awareness that today needs more deliberation than momentum.", watchFor: "High-stakes commitments made before your judgment has found its footing." };
    if (lowConf)
      return { leanOn: "Your self-awareness. You know you're operating with uncertainty today, and that honesty is itself a form of leadership.", watchFor: "Decisions performed from projected confidence rather than genuine conviction." };
    return { leanOn: "Your capacity to ask the right question before committing to a direction.", watchFor: "Moving into the day's demands before you've found your anchor point." };
  }
  
  if (avg >= 4.5) {
    const highC = c >= 4.5;
    const highConf = conf >= 4.5;
    if (highC && highConf)
      return { leanOn: "Full decision readiness. You are resourced, clear, and certain in your direction today.", watchFor: "Operating as if today's peak readiness is the norm. Protect it, don't spend it." };
    if (highConf)
      return { leanOn: "Your conviction. You trust your judgment today and can move with authority.", watchFor: "Confidence tipping into certainty that closes off important inputs." };
    return { leanOn: "Your directional certainty. You know what matters today and why.", watchFor: "Clarity about your own view crowding out the perspectives you need." };
  }
  
  return null;
}

// Priority 3: Archetype × Tier matrix
const archetypeMatrix: Record<string, Record<EnergyTier, { leanOn: string; watchFor: string }>> = {
  'natural-regulator': {
    depleted: { leanOn: "Your instinct to return to stillness. It restores you faster than most.", watchFor: "Absorbing the room's energy when your own reserves need protecting." },
    managing: { leanOn: "Your capacity to stay rooted when the pace around you accelerates.", watchFor: "Underestimating the quiet drain of holding steadiness for others." },
    strong: { leanOn: "Your natural stability. It's a leadership presence others orient around.", watchFor: "Staying in maintenance mode when your state supports something more." },
    peak: { leanOn: "Your grounded precision. Full presence with full capacity.", watchFor: "Tunnel focus that closes off peripheral awareness at the moment it matters." },
  },
  'high-octane-performer': {
    depleted: { leanOn: "Your knowledge that recovery is part of performance, not a retreat from it.", watchFor: "Performing resilience instead of actually recovering." },
    managing: { leanOn: "Your baseline reliability. Showing up consistently is its own form of leadership.", watchFor: "Settling for operational when your performance instinct wants to push." },
    strong: { leanOn: "Your above-baseline capacity. A real performance window is available.", watchFor: "Burning the window early by going too hard before the high-stakes moments." },
    peak: { leanOn: "Your full competitive edge. This is your signature performance state.", watchFor: "Spending the peak too fast without protecting what carries you through the full day." },
  },
  'strategic-pauser': {
    depleted: { leanOn: "Your ability to think simply when complexity costs too much. Straight lines today.", watchFor: "Over-processing when low energy needs economy of thought." },
    managing: { leanOn: "Your capacity to bring analytical clarity to what genuinely requires it.", watchFor: "Applying deep analysis to decisions that don't warrant the cognitive spend." },
    strong: { leanOn: "Your sharpest insights surface from a stable, well-resourced state. Conditions are good.", watchFor: "Staying in analysis past the point where the insight is already clear." },
    peak: { leanOn: "Your analytical precision at full cognitive capacity. Your highest-value thinking window.", watchFor: "Intellectual momentum that runs past the decision point and into complexity for its own sake." },
  },
  'awareness-builder': {
    depleted: { leanOn: "Your knowledge that genuine rest is what fuels your next surge, not pushing through.", watchFor: "Forcing intensity on empty. It produces noise rather than output." },
    managing: { leanOn: "Your drive, held in check. Directed intensity at operational capacity is still formidable.", watchFor: "Impatience with the pace your current state requires." },
    strong: { leanOn: "Your capacity to amplify from a stable base. Above-baseline intensity is powerful and sustainable.", watchFor: "Accelerating past the pace that keeps the full day's output high." },
    peak: { leanOn: "Your full-force capability. Focused intensity at peak readiness is your highest-performance state.", watchFor: "Opening at full intensity before the highest-leverage moments of the day." },
  },
  'adaptive-navigator': {
    depleted: { leanOn: "Your ability to read what a situation actually needs. Even in a depleted state your situational awareness is sharp.", watchFor: "Adapting to everyone else's demands when your own capacity is the priority." },
    managing: { leanOn: "Your flexibility. Meeting the day's variability without resistance.", watchFor: "Staying adaptive when the moment calls for a fixed position." },
    strong: { leanOn: "Your strategic read of the full field. You see the whole board clearly from this state.", watchFor: "Over-navigating what could be decided directly and cleanly." },
    peak: { leanOn: "Your strategic agility at full cognitive capacity. Your sharpest navigation state.", watchFor: "Complexity for its own sake when direct, decisive action is what the moment needs." },
  },
};

// Priority 4: Hardcoded tier fallbacks
const tierFallbacks: Record<EnergyTier, { leanOn: string; watchFor: string }> = {
  depleted: { leanOn: "Your awareness of your own state. Knowing you're depleted is itself a form of self-leadership.", watchFor: "Committing to demands that require more than your current state can sustain." },
  managing: { leanOn: "Your operational steadiness. Consistent presence is a form of strength.", watchFor: "Over-extending into territory that requires more than your current reserves." },
  strong: { leanOn: "Your above-baseline readiness. A real asset that is worth protecting through the day.", watchFor: "Diffusing strong capacity across too many demands rather than concentrating it." },
  peak: { leanOn: "Your full readiness. You are at your most resourced, present, and capable.", watchFor: "Treating peak state as the norm and spending it without protecting what sustains it." },
};

function getLeanOnWatchFor(
  tier: EnergyTier,
  archetype: string | null,
  clarity: number | null,
  confidence: number | null,
  coachStrength: string | null,
  coachGrowth: string | null,
  hour: number,
  dayOfWeek: number,
): { leanOn: string; watchFor: string } {
  const lateEvening = isLateEvening(hour);
  const dayCtx = getDayContext(dayOfWeek);

  // After 9 PM: recovery-oriented insights, but C+C can override when extreme
  if (lateEvening) {
    // Priority 1: Coach insights still take precedence
    if (coachStrength && coachGrowth) {
      return { leanOn: coachStrength, watchFor: coachGrowth };
    }
    
    // Priority 2: Extreme low C+C overrides evening defaults
    // When clarity/confidence are very low, the "strong readiness" evening message is misleading
    const ccMod = getCCModifier(clarity, confidence);
    if (ccMod) {
      // Blend C+C insight with evening context
      const eveningSet = dayCtx === 'sunday' ? sundayEveningInsights[tier] : eveningTierInsights[tier];
      const avgCC = ((clarity ?? 3) + (confidence ?? 3)) / 2;
      if (avgCC <= 2.5) {
        // Low C+C dominates: use C+C leanOn/watchFor since felt readiness is undermined
        return { leanOn: ccMod.leanOn, watchFor: ccMod.watchFor };
      }
      // High C+C: blend evening context with C+C confidence boost
      return { leanOn: eveningSet.leanOn, watchFor: eveningSet.watchFor };
    }
    
    // Sunday evening gets its own set
    if (dayCtx === 'sunday') {
      return sundayEveningInsights[tier];
    }
    // All other late evenings
    return eveningTierInsights[tier];
  }

  // Daytime: full cascade
  // Priority 1: Coach insights
  if (coachStrength && coachGrowth) {
    return { leanOn: coachStrength, watchFor: coachGrowth };
  }
  
  // Partial coach: mix with other priorities
  const ccMod = getCCModifier(clarity, confidence);
  
  if (coachStrength) {
    const watchFor = ccMod?.watchFor || archetypeMatrix[archetype || '']?.[tier]?.watchFor || tierFallbacks[tier].watchFor;
    return { leanOn: coachStrength, watchFor };
  }
  if (coachGrowth) {
    const leanOn = ccMod?.leanOn || archetypeMatrix[archetype || '']?.[tier]?.leanOn || tierFallbacks[tier].leanOn;
    return { leanOn, watchFor: coachGrowth };
  }
  
  // Priority 2: C+C signal modifier
  if (ccMod) return ccMod;
  
  // Priority 3: Archetype × Tier
  if (archetype && archetypeMatrix[archetype]?.[tier]) {
    return archetypeMatrix[archetype][tier];
  }
  
  // Priority 4: Tier fallback
  return tierFallbacks[tier];
}

// ==================== PATTERN RECOGNITION ====================
function getPatternOverride(
  checkIns: Array<{ checkin_date: string; outcome: string }>,
  currentOutcome: string | null
): string | null {
  if (!currentOutcome || !checkIns || checkIns.length < 2) return null;
  
  const lowStates = ['overwhelmed', 'drained', 'scattered'];
  if (!lowStates.includes(currentOutcome)) return null;
  
  const sorted = [...checkIns].sort((a, b) => 
    new Date(b.checkin_date).getTime() - new Date(a.checkin_date).getTime()
  );
  
  let count = 0;
  for (const c of sorted) {
    if (c.outcome === currentOutcome) count++;
    else break;
  }
  
  if (count < 3) return null;
  
  const signals: Record<string, string> = {
    overwhelmed: "Sustained overload at this level points to something structural, not something a daily regulation practice alone resolves. What has been consistently missing?",
    drained: "A multi-day depletion pattern signals an accumulating recovery deficit, not a single bad night. Your system may need more than the day's margins can provide.",
    scattered: "Persistent fragmentation across consecutive days points to unresolved open loops or an unprocessed decision backlog. What is still occupying bandwidth that needs to be closed?",
  };
  
  return `Day ${count} at this state. Your system is showing a pattern. ${signals[currentOutcome]}`;
}

// ==================== DATA SOURCES BUILDER ====================
function buildDataSources(
  hasCalendar: boolean,
  archetype: string | null,
  _checkInOutcome: string | null,
): string[] {
  const sources: string[] = [];
  sources.push('inner readiness score');
  if (hasCalendar) sources.push('calendar');
  if (archetype) sources.push('archetype');
  return sources;
}

// ==================== MAIN ====================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ComputeRequest & { userId?: string } = await req.json();

    let userId: string;
    if (body.userId) {
      console.log('[compute-outer-readiness] Using userId from body (dev mode):', body.userId);
      userId = body.userId;
    } else {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      userId = await verifyAuth0Token(authHeader);
    }
    
    const {
      innerReadinessTier,
      innerReadinessScore,
      calendarLoad,
      calendarPressure,
      archetype,
      clarityLevel,
      confidenceLevel,
      checkInOutcome,
      timezoneOffset = 0,
    } = body;

    // Compute user's local time
    const userTime = getUserTime(timezoneOffset);
    const hour = userTime.getHours();
    const dayOfWeek = userTime.getDay();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, supabaseKey);

    const [coachRes, checkInRes] = await Promise.all([
      db.from('user_coach_insights')
        .select('insight_type, insight_content')
        .eq('user_id', userId)
        .in('insight_type', ['strength', 'growth_area'])
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(5),
      db.from('daily_checkins')
        .select('checkin_date, outcome')
        .eq('user_id', userId)
        .gte('checkin_date', new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0])
        .order('checkin_date', { ascending: false })
        .limit(10),
    ]);

    const coachInsights = coachRes.data || [];
    const recentCheckIns = checkInRes.data || [];
    
    const coachStrength = coachInsights.find((i: any) => i.insight_type === 'strength')?.insight_content || null;
    const coachGrowth = coachInsights.find((i: any) => i.insight_type === 'growth_area')?.insight_content || null;

    const theme = getTheme(innerReadinessTier, calendarPressure, calendarLoad, innerReadinessScore, hour, dayOfWeek);
    const patternOverride = getPatternOverride(recentCheckIns as any[], checkInOutcome || null);
    
    // C+C divergence override: if tier is strong/peak but C+C is very low,
    // override theme phrase and context to reflect the internal conflict
    const avgCC = ((clarityLevel ?? 3) + (confidenceLevel ?? 3)) / 2;
    const ccProvided = clarityLevel !== null || confidenceLevel !== null;
    let finalPhrase = theme.phrase;
    let finalContext = patternOverride || theme.context;
    
    if (ccProvided && avgCC <= 2.0 && (innerReadinessTier === 'strong' || innerReadinessTier === 'peak')) {
      finalPhrase = "Strength without clarity.";
      finalContext = "Your felt energy is high, but your internal compass — clarity and confidence — is signalling uncertainty. High activation without direction can lead to misplaced effort. Before deploying your readiness, find your anchor.";
    }
    
    const { leanOn, watchFor } = getLeanOnWatchFor(
      innerReadinessTier, archetype, clarityLevel, confidenceLevel,
      coachStrength, coachGrowth, hour, dayOfWeek
    );

    const hasCalendar = calendarLoad !== null && calendarPressure !== null;
    const dataSources = buildDataSources(hasCalendar, archetype, checkInOutcome);

    const timeOfDay = getTimeOfDay(hour);
    const today = new Date().toISOString().split('T')[0];
    try {
      await db.from('daily_themes').upsert({
        user_id: userId,
        theme_date: today,
        theme_phrase: theme.phrase,
        theme_driver: theme.driver,
        check_in_outcome: checkInOutcome || null,
        calendar_pressure: calendarPressure || null,
        calendar_load: calendarLoad || null,
        time_of_day: timeOfDay,
        lean_on: leanOn,
        watch_for: watchFor,
        inner_readiness_score: innerReadinessScore,
        archetype: archetype || null,
      }, { onConflict: 'user_id,theme_date' });
    } catch (e) {
      console.error('[compute-outer-readiness] Theme persistence error:', e);
    }

    const result: OuterReadinessResult = {
      phrase: finalPhrase,
      context: finalContext,
      leanOn,
      watchFor,
      driver: theme.driver,
      dataSources,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[compute-outer-readiness] Error:', msg);
    const status = msg === 'Invalid token' || msg === 'Missing authorization header' ? 401 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
