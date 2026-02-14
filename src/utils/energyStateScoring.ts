/**
 * Energy State Scoring System — Cleaned (v3)
 * 
 * Inner Readiness scoring logic (weights, tiers, context statements, divergence)
 * now lives exclusively in the `compute-inner-readiness` edge function.
 * 
 * This file retains ONLY:
 * - Type exports used across the codebase
 * - Calendar metrics (used by Strategic Theme / Outer Readiness)
 * - Time-of-day utility
 * - Energy tier utility (used by Strategic Theme, Performance Plan, Moment Detection)
 * - Strategic Theme generation (Outer Readiness — NOT Inner Readiness)
 */

// ==================== TYPE EXPORTS ====================

export type CalendarLoad = 'low' | 'medium' | 'high';
export type CalendarPressure = 'low' | 'medium' | 'high';
export type EnergyTier = 'depleted' | 'managing' | 'strong' | 'peak';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';
export type WearableFunction = 'low' | 'medium' | 'high';
export type MasteryType = 'pause' | 'flow' | 'renewal';
export type MasterySubtype = 
  | 'deep-calm' | 'grounding' | 'composure' 
  | 'activate' | 'optimize' | 'maintain-peak'
  | 'recharge' | 'restore' | 'refresh'
  | 'focus' | 'clarity' | 'executive-presence' | 'restore-resilience' | 'reset-energy';

export interface Recommendation {
  primary: MasteryType;
  primarySubtype?: MasterySubtype;
  secondary?: MasteryType;
  secondarySubtype?: MasterySubtype;
  contextStatement: string;
}

export interface CalendarMetrics {
  load: CalendarLoad;
  pressure: CalendarPressure;
  density: number;
  pressureScore: number;
  loadScore: number;
}

// ==================== TIME OF DAY ====================

export function getTimeOfDay(hour: number = new Date().getHours()): TimeOfDay {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

// ==================== ENERGY TIER (utility — thresholds match edge function) ====================

export function getEnergyTier(balance: number): EnergyTier {
  if (balance < 40) return 'depleted';
  if (balance < 60) return 'managing';
  if (balance < 75) return 'strong';
  return 'peak';
}

// ==================== CALENDAR METRICS ====================

export function getCalendarMetrics(calendarData: any[]): CalendarMetrics {
  const now = new Date();
  const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  
  // Filter upcoming events (next 4 hours)
  const upcomingEvents = calendarData.filter((event: any) => {
    const startTime = new Date(event.start_time || event.startTime);
    return startTime >= now && startTime <= fourHoursLater;
  });
  
  // Calculate Load (number of meetings)
  const meetingCount = upcomingEvents.length;
  let load: CalendarLoad = 'low';
  if (meetingCount >= 5) load = 'high';
  else if (meetingCount >= 3) load = 'medium';
  
  // Calculate Pressure (metadata scoring)
  let totalPressure = 0;
  
  upcomingEvents.forEach((event: any) => {
    let eventPressure = 0;
    
    if (event.is_organizer) eventPressure += 2;
    
    const attendees = event.attendees_count || 0;
    if (attendees > 5) eventPressure += 2;
    else if (attendees > 2) eventPressure += 1;
    
    const start = new Date(event.start_time || event.startTime);
    const end = new Date(event.end_time || event.endTime);
    const durationMin = (end.getTime() - start.getTime()) / 60000;
    if (durationMin > 60) eventPressure += 2;
    else if (durationMin >= 30) eventPressure += 1;
    
    if (!event.is_recurring) eventPressure += 1;
    
    const hour = start.getHours();
    if ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 16)) {
      eventPressure += 1;
    }
    
    totalPressure += eventPressure;
  });
  
  // Check for back-to-back meetings
  const sortedEvents = upcomingEvents.sort((a: any, b: any) => 
    new Date(a.start_time || a.startTime).getTime() - new Date(b.start_time || b.startTime).getTime()
  );
  
  for (let i = 0; i < sortedEvents.length - 1; i++) {
    const currentEnd = new Date(sortedEvents[i].end_time || sortedEvents[i].endTime);
    const nextStart = new Date(sortedEvents[i + 1].start_time || sortedEvents[i + 1].startTime);
    const gap = (nextStart.getTime() - currentEnd.getTime()) / 60000;
    if (gap < 15) totalPressure += 1;
  }
  
  let pressure: CalendarPressure = 'low';
  if (totalPressure >= 6) pressure = 'high';
  else if (totalPressure >= 3) pressure = 'medium';
  
  const loadScoreMap: Record<CalendarLoad, number> = { 'low': 5, 'medium': 0, 'high': -5 };
  const pressureScoreMap: Record<CalendarPressure, number> = { 'low': 5, 'medium': 0, 'high': -5 };
  
  return {
    load,
    pressure,
    density: meetingCount,
    loadScore: loadScoreMap[load],
    pressureScore: pressureScoreMap[pressure]
  };
}

// ==================== STRATEGIC THEME (Outer Readiness — kept client-side) ====================

export type ThemeDriver = 'pressure+load' | 'pressure' | 'load' | 'morning' | 'evening' | 'state';

export interface StrategicTheme {
  phrase: string;
  context: string;
  driver: ThemeDriver;
}

// Archetype-aware unlock statements
function getArchetypeUnlock(archetype: string | undefined, state: string, defaultUnlock: string): string {
  if (!archetype) return defaultUnlock;
  
  const archetypeUnlocks: Record<string, Record<string, string>> = {
    'The Grounded Master': {
      overwhelmed: "Your natural stability is your edge—regulation restores it.",
      drained: "Your groundedness depends on honoring your limits.",
      scattered: "Your clarity is built on grounded presence.",
      steady: "This equilibrium is your signature strength.",
      focused: "This is where your grounded leadership shines."
    },
    'The Resilient Performer': {
      overwhelmed: "Your bounce-back strength depends on quality transitions.",
      drained: "Your resilience recharges through genuine rest.",
      scattered: "Your performance edge requires focused attention.",
      steady: "This foundation enables your signature resilience.",
      focused: "This is where your performance advantage lives."
    },
    'The Clear Thinker': {
      overwhelmed: "Your cognitive clarity depends on nervous system regulation.",
      drained: "Your sharp thinking requires energy reserves.",
      scattered: "Your mental precision needs single-pointed focus.",
      steady: "This calm state enables your clearest insights.",
      focused: "This is where your analytical edge is sharpest."
    },
    'The Intensity Driver': {
      overwhelmed: "Your intensity is most powerful when channeled, not scattered.",
      drained: "Your drive needs fuel—rest enables your next surge.",
      scattered: "Your intensity thrives on clear direction.",
      steady: "This grounded state amplifies your impact.",
      focused: "This is where your intensity creates breakthroughs."
    },
    'The Adaptive Navigator': {
      overwhelmed: "Your adaptability works best from a regulated baseline.",
      drained: "Your flexibility needs energy to respond effectively.",
      scattered: "Your navigation requires a stable reference point.",
      steady: "This balance enables your signature adaptability.",
      focused: "This is where your strategic agility shines."
    }
  };
  
  return archetypeUnlocks[archetype]?.[state] || defaultUnlock;
}

export function getStrategicTheme(
  energyTier: EnergyTier,
  calendarLoad: CalendarLoad,
  calendarPressure: CalendarPressure,
  timeOfDay: TimeOfDay,
  checkInOutcome?: string,
  archetype?: string
): StrategicTheme {
  // ============= OVERWHELMED =============
  if (checkInOutcome === 'overwhelmed') {
    const unlock = getArchetypeUnlock(archetype, 'overwhelmed', 'Creating breathing room restores your capacity for strategic response.');
    
    if (timeOfDay === 'evening') {
      return { phrase: "Decompress before you rest.", context: `Without transition, your activated nervous system blocks restorative sleep. With intentional release, tonight's rest actually recovers tomorrow's capacity. ${unlock}`, driver: 'evening' };
    }
    if (calendarPressure === 'high' && calendarLoad === 'high') {
      return { phrase: "Survival mode activated.", context: `Without regulation, cortisol compounds into reactive decisions and damaged relationships. With even brief downshift, you restore access to strategic thinking. ${unlock}`, driver: 'pressure+load' };
    }
    if (calendarPressure === 'high' && calendarLoad === 'medium') {
      return { phrase: "Steady your ground.", context: `Without grounding, stress hormones narrow cognitive bandwidth and reduce empathy. With regulation, you bring clarity to high-stakes moments. ${unlock}`, driver: 'pressure+load' };
    }
    if (calendarPressure === 'high') {
      return { phrase: "Protect your boundaries today.", context: `Without boundaries, each additional demand compounds the stress response. With protection, you preserve capacity for what truly matters. ${unlock}`, driver: 'pressure' };
    }
    if (calendarPressure === 'medium' && calendarLoad === 'high') {
      return { phrase: "Simplify to survive.", context: `Without simplification, overwhelm plus a packed schedule leads to shallow execution. With focus on essentials, you protect both quality and yourself. ${unlock}`, driver: 'load' };
    }
    if (calendarLoad === 'high') {
      return { phrase: "Choose your battles wisely.", context: `Without selection, pushing through depletes reserves needed for recovery. With intentional choice, you honor today while protecting tomorrow. ${unlock}`, driver: 'load' };
    }
    if (calendarLoad === 'medium') {
      return { phrase: "Pace your recovery.", context: `Your overwhelm signals accumulated stress rather than today's demands. Your nervous system needs regulation, not productivity. ${unlock}`, driver: 'load' };
    }
    if (timeOfDay === 'morning') {
      return { phrase: "Set the tone gently.", context: `Without a gentle start, morning cortisol sets a trajectory that affects your entire day. With regulation now, you reshape what follows. ${unlock}`, driver: 'morning' };
    }
    return { phrase: "Regulate before you engage.", context: `Without regulation, your responses are reactive rather than strategic. With nervous system settling, clarity and composure return. ${unlock}`, driver: 'state' };
  }

  // ============= DRAINED =============
  if (checkInOutcome === 'drained') {
    const unlock = getArchetypeUnlock(archetype, 'drained', 'Honoring this signal is how sustainable performance is built.');
    
    if (timeOfDay === 'evening') {
      return { phrase: "Rest is productive.", context: `Without honoring this signal, you fragment tonight's sleep and reduce recovery. Evening depletion is your body's signal that you've given enough. ${unlock}`, driver: 'evening' };
    }
    if (calendarPressure === 'high' && calendarLoad === 'high') {
      return { phrase: "Conserve for what counts.", context: `Without energy boundaries, you risk depleting before your high-stakes moments. With them, you arrive with reserves intact. ${unlock}`, driver: 'pressure+load' };
    }
    if (calendarPressure === 'high' && calendarLoad === 'medium') {
      return { phrase: "Strategic bursts only.", context: `Without pacing, forcing continuous output accelerates depletion exponentially. With strategic bursts, you preserve capacity for what matters. ${unlock}`, driver: 'pressure+load' };
    }
    if (calendarPressure === 'high') {
      return { phrase: "Guard your reserves.", context: `Without protection, depletion impairs exactly the faculties you need for high-stakes performance. With boundaries, you maintain executive function. ${unlock}`, driver: 'pressure' };
    }
    if (calendarPressure === 'medium' && calendarLoad === 'high') {
      return { phrase: "Endurance over excellence.", context: `Without lowering expectations, you create a quality vs. completion tradeoff that exhausts you. Today, 'good enough' protects tomorrow's capacity. ${unlock}`, driver: 'load' };
    }
    if (calendarLoad === 'high') {
      return { phrase: "Navigate, don't sprint.", context: `Without pacing, continuing to sprint creates a deficit that compounds over days. With navigation, you honor limits while meeting demands. ${unlock}`, driver: 'load' };
    }
    if (calendarLoad === 'medium') {
      return { phrase: "Gentle momentum.", context: `A lighter schedule gives space for strategic recovery rather than just survival. Small energy deposits throughout the day compound into restored capacity. ${unlock}`, driver: 'load' };
    }
    if (timeOfDay === 'morning') {
      return { phrase: "Ease into the day.", context: `Without a slow start, morning depletion compounds throughout the day. With gentle pacing, you create space for recovery while moving forward. ${unlock}`, driver: 'morning' };
    }
    return { phrase: "Restore before you push.", context: `Without rest, pushing through delays recovery exponentially. Depletion isn't laziness—it's your nervous system protecting you from overextension. ${unlock}`, driver: 'state' };
  }

  // ============= SCATTERED =============
  if (checkInOutcome === 'scattered') {
    const unlock = getArchetypeUnlock(archetype, 'scattered', 'Grounding unlocks the clarity that fragmentation blocks.');
    
    if (timeOfDay === 'evening') {
      return { phrase: "Release the threads.", context: `Without letting go, tonight's open loops become tomorrow's mental fog. Your scattered evening mind needs release, not resolution. ${unlock}`, driver: 'evening' };
    }
    if (calendarPressure === 'high' && calendarLoad === 'high') {
      return { phrase: "Focus or fragment.", context: `Without focus, complexity becomes chaos and decisions become reactive. With grounding, you move through the density with strategic clarity. ${unlock}`, driver: 'pressure+load' };
    }
    if (calendarPressure === 'high' && calendarLoad === 'medium') {
      return { phrase: "Clarity before stakes.", context: `Without grounding, your working memory is fragmented when you need it most. With focus, you bring your full cognitive capacity to what matters. ${unlock}`, driver: 'pressure+load' };
    }
    if (calendarPressure === 'high') {
      return { phrase: "Find your center first.", context: `Without grounding, high-stakes become reactive and error-prone. With presence, you access the executive function these moments demand. ${unlock}`, driver: 'pressure' };
    }
    if (calendarPressure === 'medium' && calendarLoad === 'high') {
      return { phrase: "Anchor and execute.", context: `Each context-switch costs 15-25 minutes of cognitive recovery. Without anchoring, a busy day becomes an exhausting blur. ${unlock}`, driver: 'load' };
    }
    if (calendarLoad === 'high') {
      return { phrase: "One thread at a time.", context: `Without single-threading, performance drops 40% and errors multiply. With focus, you move efficiently through the density. ${unlock}`, driver: 'load' };
    }
    if (calendarLoad === 'medium') {
      return { phrase: "Reclaim your attention.", context: `Your scattering comes from input fragmentation, not schedule demands. Without intentional focus, cognitive resources drain on incomplete thoughts. ${unlock}`, driver: 'load' };
    }
    if (timeOfDay === 'morning') {
      return { phrase: "Ground before you go.", context: `Morning scatteredness reflects yesterday's unprocessed thoughts. Without grounding now, this fragmentation compounds through the day. ${unlock}`, driver: 'morning' };
    }
    return { phrase: "Find your anchor point.", context: `Your brain is holding too many threads, depleting working memory. Without grounding, this creates urgency without productivity. ${unlock}`, driver: 'state' };
  }

  // ============= STEADY =============
  if (checkInOutcome === 'steady') {
    const unlock = getArchetypeUnlock(archetype, 'steady', 'This foundation is what sustainable high performance is built on.');
    
    if (calendarPressure === 'high' && calendarLoad === 'high') {
      return { phrase: "Anchor in the storm.", context: `Your balanced nervous system is a competitive advantage when others are reactive. Under pressure, this steadiness enables clear thinking and measured responses. ${unlock}`, driver: 'pressure+load' };
    }
    if (calendarPressure === 'high' && calendarLoad === 'medium') {
      return { phrase: "Calm confidence.", context: `Steadiness during high-stakes moments signals competence and creates psychological safety for others. This state is rare and valuable. ${unlock}`, driver: 'pressure+load' };
    }
    if (calendarPressure === 'high') {
      return { phrase: "Rise to the moment.", context: `A steady foundation enables you to access your full cognitive capacity when stakes are high. This is the state where peak performance lives. ${unlock}`, driver: 'pressure' };
    }
    if (calendarPressure === 'medium' && calendarLoad === 'high') {
      return { phrase: "Sustainable pace required.", context: `Steadiness in a busy day can erode without intention. The density of commitments creates micro-stressors that accumulate. ${unlock}`, driver: 'load' };
    }
    if (calendarLoad === 'high') {
      return { phrase: "Ride the rhythm.", context: `A packed calendar is manageable from a steady state because you're not burning energy on stress responses. Your equilibrium creates efficiency. ${unlock}`, driver: 'load' };
    }
    if (calendarLoad === 'medium') {
      return { phrase: "Steady as she goes.", context: `A balanced state with balanced demands is optimal for both performance and recovery. This is where sustainable leadership lives. ${unlock}`, driver: 'load' };
    }
    if (timeOfDay === 'morning') {
      return { phrase: "Set the rhythm.", context: `Morning steadiness creates a baseline that shapes the entire day. Your nervous system learns from how the day begins. ${unlock}`, driver: 'morning' };
    }
    if (timeOfDay === 'evening') {
      return { phrase: "Maintain your balance.", context: `Arriving at evening in a steady state means your regulation throughout the day worked. ${unlock}`, driver: 'evening' };
    }
    return { phrase: "Build on your balance.", context: `Steadiness is not neutral; it's an active state that enables clear thinking and responsive action. ${unlock}`, driver: 'state' };
  }

  // ============= FOCUSED =============
  if (checkInOutcome === 'focused') {
    const unlock = getArchetypeUnlock(archetype, 'focused', 'This is the state where your best work happens.');
    
    if (calendarPressure === 'high' && calendarLoad === 'high') {
      return { phrase: "Peak performance day.", context: `Peak cognitive state meets maximum demands. This alignment is rare and powerful. Deploy your capacity where it creates the most leverage. ${unlock}`, driver: 'pressure+load' };
    }
    if (calendarPressure === 'high' && calendarLoad === 'medium') {
      return { phrase: "Execute with precision.", context: `High stakes with peak readiness is the ideal condition for decisive action. Your cognitive resources are optimized for complexity. ${unlock}`, driver: 'pressure+load' };
    }
    if (calendarPressure === 'high') {
      return { phrase: "Seize the high ground.", context: `Peak focus during high stakes is a competitive advantage. Your prefrontal cortex is fully online, enabling strategic thinking and emotional regulation. ${unlock}`, driver: 'pressure' };
    }
    if (calendarPressure === 'medium' && calendarLoad === 'high') {
      return { phrase: "Channel the intensity.", context: `Peak state enables efficient processing of a dense schedule. You can handle more without accumulating stress. ${unlock}`, driver: 'load' };
    }
    if (calendarLoad === 'high') {
      return { phrase: "Sprint through the density.", context: `Focused energy in a packed day is powerful leverage. You can move through commitments with less friction and more impact. ${unlock}`, driver: 'load' };
    }
    if (calendarLoad === 'medium') {
      return { phrase: "Strategic deployment.", context: `Peak focus with moderate demands gives you choice. This is premium cognitive real estate—deploy it on your highest-value work. ${unlock}`, driver: 'load' };
    }
    if (timeOfDay === 'morning') {
      return { phrase: "Maximize your morning.", context: `Morning focus is your highest-value window. Cognitive capacity typically peaks in the first few hours after waking. ${unlock}`, driver: 'morning' };
    }
    if (timeOfDay === 'evening') {
      const eveningUnlock = getArchetypeUnlock(archetype, 'focused', 'Intentional closure now protects tomorrow\'s capacity.');
      return { phrase: "Channel wisely.", context: `Evening focus is valuable but needs direction. Without intention, this energy may delay sleep and compromise tomorrow's recovery. Choose one meaningful completion, then release. ${eveningUnlock}`, driver: 'evening' };
    }
    return { phrase: "Own your optimal state.", context: `Peak focus is limited cognitive capital that depletes throughout the day. Protect it from interruption and direct it toward what matters most. ${unlock}`, driver: 'state' };
  }

  // ============= TIER-BASED FALLBACKS (No check-in outcome) =============
  
  if (energyTier === 'depleted') {
    if (calendarPressure === 'high' && calendarLoad === 'high') return { phrase: "Conserve for what counts.", context: "Critical moments ahead with empty reserves. Ruthlessly protect energy for high-stakes only.", driver: 'pressure+load' };
    if (calendarPressure === 'high' && calendarLoad === 'medium') return { phrase: "Strategic bursts only.", context: "Important moments ahead. Deploy energy in focused bursts, recover between.", driver: 'pressure+load' };
    if (calendarPressure === 'high') return { phrase: "Protect your energy today.", context: "High demands ahead but you're running on reserves. Be ruthless about what gets your attention.", driver: 'pressure' };
    if (calendarPressure === 'medium' && calendarLoad === 'high') return { phrase: "Endurance over excellence.", context: "Full schedule, depleted tank. Aim for completion, not perfection.", driver: 'load' };
    if (calendarLoad === 'high') return { phrase: "Less is more today.", context: "Your calendar is full but your tank isn't. Simplify, delegate, and preserve yourself.", driver: 'load' };
    if (calendarLoad === 'medium') return { phrase: "Gentle momentum.", context: "Light enough schedule to pace yourself. Small wins compound into recovered energy.", driver: 'load' };
    if (timeOfDay === 'morning') return { phrase: "Ease into the day.", context: "Morning depletion calls for a slow start. Protect the first hour for restoration.", driver: 'morning' };
    if (timeOfDay === 'evening') return { phrase: "Rest is your work tonight.", context: "Tomorrow's performance depends on tonight's recovery. Wind down intentionally.", driver: 'evening' };
    return { phrase: "Restore before you push.", context: "Deep rest is not optional today—it's the foundation for everything else.", driver: 'state' };
  }

  if (energyTier === 'managing') {
    if (calendarPressure === 'high' && calendarLoad === 'high') return { phrase: "Anchor in the storm.", context: "Maximum demands but you're holding. Your stability is your advantage—hold the center.", driver: 'pressure+load' };
    if (calendarPressure === 'high' && calendarLoad === 'medium') return { phrase: "Calm confidence.", context: "High-stakes moments with manageable gaps. Use your steady state as a competitive edge.", driver: 'pressure+load' };
    if (calendarPressure === 'high') return { phrase: "Steady under pressure.", context: "You're managing well. Today is about pacing yourself through high-stakes moments.", driver: 'pressure' };
    if (calendarPressure === 'medium' && calendarLoad === 'high') return { phrase: "Sustainable pace required.", context: "Full day ahead with moderate stakes. Your balance will be tested—pace accordingly.", driver: 'load' };
    if (calendarLoad === 'high') return { phrase: "Pace yourself for endurance.", context: "A full day ahead. Small resets between meetings will compound into sustained energy.", driver: 'load' };
    if (calendarLoad === 'medium') return { phrase: "Steady as she goes.", context: "Balanced state meets balanced day. Maintain your rhythm without overreaching.", driver: 'load' };
    if (calendarLoad === 'low') return { phrase: "Build your reserves today.", context: "Light calendar means space to invest in yourself. Use it wisely.", driver: 'load' };
    if (timeOfDay === 'morning') return { phrase: "Set the rhythm.", context: "Manage your mornings well and the days follow. Establish your pace early.", driver: 'morning' };
    if (timeOfDay === 'evening') return { phrase: "Maintain your balance.", context: "Managing well into evening is a win. Carry this equilibrium into rest.", driver: 'evening' };
    return { phrase: "Balance before breakthrough.", context: "You're in a transitional state. Ground yourself before pushing for more.", driver: 'state' };
  }

  if (energyTier === 'strong') {
    if (calendarPressure === 'high' && calendarLoad === 'high') return { phrase: "Peak performance day.", context: "Strong capacity meets maximum demands. This is your moment to deliver at scale.", driver: 'pressure+load' };
    if (calendarPressure === 'high' && calendarLoad === 'medium') return { phrase: "Execute with precision.", context: "High stakes, strong readiness. Deploy your focus where it creates decisive outcomes.", driver: 'pressure+load' };
    if (calendarPressure === 'high') return { phrase: "You're ready for this.", context: "Strong energy meets high stakes. Lean into the challenge—you have the capacity.", driver: 'pressure' };
    if (calendarPressure === 'medium' && calendarLoad === 'high') return { phrase: "Channel the intensity.", context: "Full schedule but you're sharp. Direct your focus where it creates the most value.", driver: 'load' };
    if (calendarLoad === 'high') return { phrase: "Sprint through the density.", context: "Packed calendar, strong energy. Use your capacity to move through efficiently.", driver: 'load' };
    if (calendarLoad === 'medium') return { phrase: "Strategic deployment.", context: "Moderate demands, strong state. Choose where to invest this energy for maximum return.", driver: 'load' };
    if (timeOfDay === 'morning') return { phrase: "Lean into flow.", context: "Morning energy is prime. Channel it toward what matters most before the day fragments.", driver: 'morning' };
    if (timeOfDay === 'evening') return { phrase: "Close strong, rest well.", context: "Strong finish to the day. Complete what you started, then honor the transition to rest.", driver: 'evening' };
    return { phrase: "Execute with intention.", context: "You have the energy. Direct it precisely toward your highest-leverage activities.", driver: 'state' };
  }

  // PEAK tier (default)
  if (calendarPressure === 'high' && calendarLoad === 'high') return { phrase: "Maximum output mode.", context: "Peak state meets peak demands. Deploy everything you have—this is what you've trained for.", driver: 'pressure+load' };
  if (calendarPressure === 'high' && calendarLoad === 'medium') return { phrase: "Precision and power.", context: "Peak readiness, high stakes. Your execution today can be exceptional.", driver: 'pressure+load' };
  if (calendarPressure === 'high') return { phrase: "Execute with precision.", context: "Peak state meets peak demands. This is what you've trained for—deliver.", driver: 'pressure' };
  if (calendarPressure === 'medium' && calendarLoad === 'high') return { phrase: "Flow through the volume.", context: "Full day, peak capacity. Let your energy carry you through the density effortlessly.", driver: 'load' };
  if (calendarLoad === 'high') return { phrase: "Sprint through the density.", context: "Packed calendar, peak energy. Use your capacity to dominate the day.", driver: 'load' };
  if (calendarLoad === 'medium') return { phrase: "Strategic excellence.", context: "Peak state, moderate demands. Choose your targets and execute with precision.", driver: 'load' };
  if (timeOfDay === 'morning') return { phrase: "Maximize your morning.", context: "You're at your best. Tackle the hardest, most important work while the window is open.", driver: 'morning' };
  if (timeOfDay === 'evening') return { phrase: "Sustain and celebrate.", context: "Peak energy sustained into evening is rare. Acknowledge the day, then let it go.", driver: 'evening' };
  return { phrase: "Own your optimal state.", context: "You're operating at your best. Protect this state and deploy it strategically.", driver: 'state' };
}
