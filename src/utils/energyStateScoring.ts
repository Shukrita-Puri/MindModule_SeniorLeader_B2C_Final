/**
 * Energy State Scoring System - FULL IMPLEMENTATION (All Phases)
 * 
 * Core scoring functions for the new energy state calculation:
 * - Check-in scoring (6 statements → 0-100)
 * - Wearable scoring (Low/Medium/High → 0-100)
 * - Calendar scoring (Load + Pressure → 0-100)
 * - Circadian scoring (Time of day → -5/0/+5 adjustment)
 * - Sub-tier logic for finer granularity
 */

// ==================== CHECK-IN SCORING ====================

export function getCheckInScore(outcome: string): number {
  const scoreMap: Record<string, number> = {
    // New values - more differentiated scores
    'overwhelmed': 25,     // Stressed but not depleted - needs regulation
    'drained': 20,         // Genuinely needs rest - lowest
    'scattered': 35,       // Needs focus, not rest - low-mid
    'steady': 55,          // Solid middle ground
    'focused': 80,         // High - performing well
    
    // Legacy values (backward compatibility)
    'pause': 25,
    'power-up': 20,
    'presence': 35,
    'ready': 80
  };
  
  return scoreMap[outcome] || 50; // Default to 50 if unknown
}

// ==================== WEARABLE SCORING ====================

export type WearableFunction = 'low' | 'medium' | 'high';

export function getWearableFunction(wearableData: any): WearableFunction {
  const readiness = wearableData.readiness || wearableData.readinessScore;
  
  if (!readiness) return 'medium';
  
  // Map readiness score to function level
  if (readiness < 50) return 'low';
  if (readiness < 75) return 'medium';
  return 'high';
}

export function getWearableScore(wearableData: any): number {
  const func = getWearableFunction(wearableData);
  
  const scoreMap: Record<WearableFunction, number> = {
    'low': 20,
    'medium': 50,
    'high': 80
  };
  
  return scoreMap[func];
}

// ==================== CALENDAR SCORING ====================

export type CalendarLoad = 'low' | 'medium' | 'high';
export type CalendarPressure = 'low' | 'medium' | 'high';

export interface CalendarMetrics {
  load: CalendarLoad;
  pressure: CalendarPressure;
  density: number;
  pressureScore: number;
  loadScore: number;
}

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
    
    // User is organizer
    if (event.is_organizer) eventPressure += 2;
    
    // Attendee count
    const attendees = event.attendees_count || 0;
    if (attendees > 5) eventPressure += 2;
    else if (attendees > 2) eventPressure += 1;
    
    // Duration
    const start = new Date(event.start_time || event.startTime);
    const end = new Date(event.end_time || event.endTime);
    const durationMin = (end.getTime() - start.getTime()) / 60000;
    if (durationMin > 60) eventPressure += 2;
    else if (durationMin >= 30) eventPressure += 1;
    
    // Recurring
    if (!event.is_recurring) eventPressure += 1;
    
    // Prime hours (9am-12pm, 2pm-4pm)
    const hour = start.getHours();
    if ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 16)) {
      eventPressure += 1;
    }
    
    totalPressure += eventPressure;
  });
  
  // Check for back-to-back meetings
  const sortedEvents = upcomingEvents.sort((a, b) => 
    new Date(a.start_time || a.startTime).getTime() - new Date(b.start_time || b.startTime).getTime()
  );
  
  for (let i = 0; i < sortedEvents.length - 1; i++) {
    const currentEnd = new Date(sortedEvents[i].end_time || sortedEvents[i].endTime);
    const nextStart = new Date(sortedEvents[i + 1].start_time || sortedEvents[i + 1].startTime);
    const gap = (nextStart.getTime() - currentEnd.getTime()) / 60000;
    if (gap < 15) totalPressure += 1; // Back-to-back
  }
  
  // Map pressure to category
  let pressure: CalendarPressure = 'low';
  if (totalPressure >= 6) pressure = 'high';
  else if (totalPressure >= 3) pressure = 'medium';
  
  // Calculate numeric scores
  const loadScoreMap: Record<CalendarLoad, number> = {
    'low': 5,
    'medium': 0,
    'high': -5
  };
  
  const pressureScoreMap: Record<CalendarPressure, number> = {
    'low': 5,
    'medium': 0,
    'high': -5
  };
  
  return {
    load,
    pressure,
    density: meetingCount,
    loadScore: loadScoreMap[load],
    pressureScore: pressureScoreMap[pressure]
  };
}

export function getCalendarScore(calendarData: any[]): number {
  const metrics = getCalendarMetrics(calendarData);
  
  // Base score: 50
  // Weighted combination: 40% Load + 60% Pressure
  const score = 50 + (metrics.loadScore * 0.4) + (metrics.pressureScore * 0.6);
  
  return Math.max(0, Math.min(100, score));
}

// ==================== CIRCADIAN SCORING ====================

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export function getTimeOfDay(hour: number = new Date().getHours()): TimeOfDay {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

export function getCircadianScore(hour: number = new Date().getHours()): number {
  const time = getTimeOfDay(hour);
  
  const adjustmentMap: Record<TimeOfDay, number> = {
    'morning': 5,      // Peak alertness
    'afternoon': 0,    // Neutral
    'evening': -5      // Natural dip
  };
  
  return adjustmentMap[time]; // ✅ PHASE 1: Return adjustment directly (-5, 0, +5)
}

// ==================== ENERGY TIER CALCULATION ====================

export type EnergyTier = 'depleted' | 'managing' | 'strong' | 'peak';

export function getEnergyTier(balance: number): EnergyTier {
  if (balance < 40) return 'depleted';
  if (balance < 60) return 'managing';
  if (balance < 75) return 'strong';
  return 'peak';
}

// ==================== SUB-TIER LOGIC (PHASE 5) ====================

export type EnergySubTier = 'very-low' | 'low' | 'low-mid' | 'mid' | 'mid-high' | 'high' | 'very-high';

export function getEnergySubTier(balance: number): EnergySubTier {
  if (balance <= 15) return 'very-low';      // 0-15: Stressed/Overwhelmed
  if (balance <= 25) return 'low';           // 16-25: Drained/Tired, Anxious/Tense
  if (balance <= 35) return 'low-mid';       // 26-35: Scattered/Unfocused
  if (balance <= 55) return 'mid';           // 36-55: Managing
  if (balance <= 65) return 'mid-high';      // 56-65: Managing-Strong
  if (balance <= 75) return 'high';          // 66-75: Strong
  return 'very-high';                        // 76-100: Peak
}

// ==================== RECOMMENDATION LOGIC ====================

export type MasteryType = 'pause' | 'flow' | 'renewal';
export type MasterySubtype = 
  | 'deep-calm' | 'grounding' | 'composure' 
  | 'activate' | 'optimize' | 'maintain-peak'
  | 'recharge' | 'restore' | 'refresh'
  | 'focus' | 'clarity' | 'executive-presence' | 'restore-resilience' | 'reset-energy'; // Legacy values for compatibility

export interface Recommendation {
  primary: MasteryType;
  primarySubtype?: MasterySubtype;
  secondary?: MasteryType;
  secondarySubtype?: MasterySubtype;
  contextStatement: string;
}

// Helper function to get check-in emotional state (internal use only - not shown to user)
function getCheckInEmotion(checkInOutcome: string | null): string {
  if (!checkInOutcome) return '';
  
  const emotionMap: Record<string, string> = {
    // New values
    'overwhelmed': 'overwhelmed and stressed',
    'drained': 'low energy and drained',
    'scattered': 'scattered and unfocused',
    'steady': 'steady and balanced',
    'focused': 'focused and energized',
    // Legacy values
    'pause': 'stressed and overwhelmed',
    'power-up': 'drained and tired',
    'presence': 'scattered and unfocused',
    'calm': 'anxious and tense',
    'ready': 'motivated and ready',
    'good': 'good'
  };
  
  return emotionMap[checkInOutcome] || '';
}

// Helper function to format context statement - OUTCOME-SPECIFIC insights
function formatContextStatement(
  checkInOutcome: string | null,
  balance: number,
  timeOfDay: TimeOfDay,
  energyTier: EnergyTier,
  hasCalendar: boolean = false,
  hasWearable: boolean = false,
  calendarLoad?: CalendarLoad,
  calendarPressure?: CalendarPressure
): string {
  // Outcome-specific insights - pure felt-state messages (no calendar references)
  const outcomeInsights: Record<string, Record<TimeOfDay, string>> = {
    'overwhelmed': {
      'morning': 'Feeling overwhelmed this morning signals your nervous system is activated. Regulation comes before productivity.',
      'afternoon': 'Afternoon overwhelm often builds from accumulated stress. A nervous system reset can restore clarity.',
      'evening': 'Evening overwhelm means your day carried heavy weight. Release the tension before you carry it into tomorrow.'
    },
    'drained': {
      'morning': 'Starting drained indicates a recovery deficit. Your body is asking for restoration.',
      'afternoon': 'Afternoon depletion calls for genuine rest, not caffeine. Your body is asking for recovery.',
      'evening': 'Low evening energy is your body\'s signal to wind down early. Honor it.'
    },
    'scattered': {
      'morning': 'Scattered focus this morning needs grounding before you tackle priorities. Clarity comes from centering.',
      'afternoon': 'Afternoon mental fog is cognitive fatigue. Simplify your focus to one thing at a time.',
      'evening': 'Feeling scattered tonight means your mind is still processing. Let it settle with intention.'
    },
    'steady': {
      'morning': 'Steady start to the day. This balanced rhythm is a foundation to build on.',
      'afternoon': 'Afternoon steadiness is valuable. Protect it from unnecessary disruption.',
      'evening': 'Steady evening state suggests good regulation. Transition gently into rest.'
    },
    'focused': {
      'morning': 'Morning focus is your peak window. Deploy it on high-value, demanding work.',
      'afternoon': 'Sustained afternoon focus is rare. Maximize this cognitive advantage while you have it.',
      'evening': 'High evening focus can be channeled wisely—or it may delay sleep. Choose intentionally.'
    }
  };

  // Tier-based fallback insights (when no check-in outcome)
  const tierInsights: Record<EnergyTier, Record<TimeOfDay, string>> = {
    'depleted': {
      'morning': 'Start slowly. Your body needs restoration before taking on demanding work.',
      'afternoon': 'Low reserves this afternoon. Simplify your remaining tasks.',
      'evening': 'Rest is your work tonight. Tomorrow\'s performance depends on tonight\'s recovery.'
    },
    'managing': {
      'morning': 'You have reserves, but they need protection. Pace yourself through the morning demands.',
      'afternoon': 'Moderate energy this afternoon. Focus on maintaining rhythm rather than pushing harder.',
      'evening': 'Wind down with intention. Your energy is manageable but needs restoration overnight.'
    },
    'strong': {
      'morning': 'Strong morning energy. This is your window for demanding cognitive work.',
      'afternoon': 'Solid afternoon reserves. Leverage this energy for high-value tasks.',
      'evening': 'Good energy late in the day. Close out strong, then transition to rest mode.'
    },
    'peak': {
      'morning': 'Peak state this morning. Execute on your most important priorities now.',
      'afternoon': 'Exceptional afternoon energy. Rare opportunity for flow state work.',
      'evening': 'High energy tonight—channel it wisely, as rest will be important for sustaining this.'
    }
  };
  
  // Get outcome-specific insight, fallback to tier-based
  // Pure felt-state - no calendar or wearable additions (those go in Theme for Today)
  const insight = outcomeInsights[checkInOutcome || '']?.[timeOfDay] 
    || tierInsights[energyTier][timeOfDay];
  
  return insight;
}

export function getRecommendation(
  balance: number,
  energyTier: EnergyTier,
  calendarMetrics: CalendarMetrics,
  wearableFunction: WearableFunction,
  checkInOutcome: string | null,
  timeOfDay: TimeOfDay,
  hasCalendar: boolean = false,
  hasWearable: boolean = false
): Recommendation {
  const subTier = getEnergySubTier(balance);
  
  // Helper to create context statement with all context
  const createContext = () => formatContextStatement(
    checkInOutcome, balance, timeOfDay, energyTier,
    hasCalendar, hasWearable, calendarMetrics.load, calendarMetrics.pressure
  );
  
  // ==================== DEPLETED TIER ====================
  if (energyTier === 'depleted') {
    // Differentiate by CHECK-IN OUTCOME (type of depletion) - FIXED to use new values
    
    if (checkInOutcome === 'overwhelmed') {
      // STRESSED/OVERWHELMED → Need regulation and composure
      return {
        primary: 'pause',
        primarySubtype: calendarMetrics.pressure === 'high' ? 'composure' : 'grounding',
        secondary: 'flow',
        secondarySubtype: 'activate',
        contextStatement: createContext()
      };
    }
    
    if (checkInOutcome === 'drained') {
      // DRAINED/TIRED → Genuine rest needed
      if (wearableFunction === 'low' && calendarMetrics.pressure !== 'high') {
        // Very low physiological readiness + no pressure = DEEP REST
        return {
          primary: 'pause',
          primarySubtype: 'deep-calm',
          secondary: 'renewal',
          secondarySubtype: 'restore',
          contextStatement: createContext()
        };
      } else {
        // Needs gentle restoration
        return {
          primary: 'renewal',
          primarySubtype: 'restore',
          secondary: 'pause',
          secondarySubtype: 'deep-calm',
          contextStatement: createContext()
        };
      }
    }
    
    if (checkInOutcome === 'scattered') {
      // SCATTERED/UNFOCUSED → Grounding + Focus activation
      return {
        primary: 'pause',
        primarySubtype: 'grounding',
        secondary: 'flow',
        secondarySubtype: 'activate',
        contextStatement: createContext()
      };
    }
    
    // Default depleted (fallback for no check-in)
    let secondarySubtype: MasterySubtype = 'grounding';
    
    if (subTier === 'very-low') {
      secondarySubtype = (calendarMetrics.pressure === 'high') ? 'composure' : 'deep-calm';
    } else if (subTier === 'low') {
      secondarySubtype = (calendarMetrics.pressure === 'low' && wearableFunction === 'low') ? 'deep-calm' : 'grounding';
    } else {
      secondarySubtype = (calendarMetrics.pressure === 'high' || calendarMetrics.load === 'high') ? 'composure' : 'grounding';
    }
    
    return {
      primary: 'renewal',
      primarySubtype: 'restore',
      secondary: 'pause',
      secondarySubtype,
      contextStatement: createContext()
    };
  }

  // ==================== MANAGING TIER ====================
  if (energyTier === 'managing') {
    if (calendarMetrics.load === 'high') {
      return {
        primary: 'pause',
        primarySubtype: 'composure',
        secondary: 'renewal',
        secondarySubtype: 'refresh',
        contextStatement: createContext()
      };
    } else if (calendarMetrics.load === 'medium') {
      return {
        primary: 'pause',
        primarySubtype: 'grounding',
        secondary: 'flow',
        secondarySubtype: 'activate',
        contextStatement: createContext()
      };
    } else {
      return {
        primary: 'flow',
        primarySubtype: 'activate',
        secondary: 'pause',
        secondarySubtype: 'grounding',
        contextStatement: createContext()
      };
    }
  }

  // ==================== STRONG TIER ====================
  if (energyTier === 'strong') {
    if (calendarMetrics.pressure === 'high') {
      return {
        primary: 'flow',
        primarySubtype: 'optimize',
        secondary: 'pause',
        secondarySubtype: 'composure',
        contextStatement: createContext()
      };
    } else {
      return {
        primary: 'flow',
        primarySubtype: 'activate',
        secondary: 'pause',
        secondarySubtype: 'grounding',
        contextStatement: createContext()
      };
    }
  }

  // ==================== PEAK TIER ====================
  if (timeOfDay === 'morning') {
    return {
      primary: 'flow',
      primarySubtype: 'optimize',
      secondary: 'pause',
      secondarySubtype: 'composure',
      contextStatement: createContext()
    };
  } else if (timeOfDay === 'evening') {
    return {
      primary: 'flow',
      primarySubtype: 'maintain-peak',
      secondary: 'renewal',
      secondarySubtype: 'refresh',
      contextStatement: createContext()
    };
  } else {
    return {
      primary: 'flow',
      primarySubtype: 'optimize',
      secondary: 'pause',
      secondarySubtype: 'grounding',
      contextStatement: createContext()
    };
  }
}

// ==================== STRATEGIC THEME GENERATION ====================

export type ThemeDriver = 'pressure+load' | 'pressure' | 'load' | 'morning' | 'evening' | 'state';

export interface StrategicTheme {
  phrase: string;
  context: string;
  driver: ThemeDriver;
}

export function getStrategicTheme(
  energyTier: EnergyTier,
  calendarLoad: CalendarLoad,
  calendarPressure: CalendarPressure,
  timeOfDay: TimeOfDay,
  checkInOutcome?: string
): StrategicTheme {
  // ============= OVERWHELMED - Nervous system is activated, needs regulation =============
  if (checkInOutcome === 'overwhelmed') {
    // 1. High Pressure + High Load (maximum external demands)
    if (calendarPressure === 'high' && calendarLoad === 'high') {
      return {
        phrase: "Survival mode activated.",
        context: "Maximum demands on minimum capacity. Triage ruthlessly and protect your nervous system at all costs.",
        driver: 'pressure+load'
      };
    }
    // 2. High Pressure + Medium Load
    if (calendarPressure === 'high' && calendarLoad === 'medium') {
      return {
        phrase: "Steady your ground.",
        context: "Important moments ahead. Brief regulation between will prevent pressure from building.",
        driver: 'pressure+load'
      };
    }
    // 3. High Pressure only
    if (calendarPressure === 'high') {
      return {
        phrase: "Protect your boundaries today.",
        context: "High stakes require clear limits. Say no to preserve capacity for what matters.",
        driver: 'pressure'
      };
    }
    // 4. Medium Pressure + High Load
    if (calendarPressure === 'medium' && calendarLoad === 'high') {
      return {
        phrase: "Simplify to survive.",
        context: "Moderate stakes but packed schedule. Cut the non-essential to avoid compounding overwhelm.",
        driver: 'load'
      };
    }
    // 5. High Load only
    if (calendarLoad === 'high') {
      return {
        phrase: "Choose your battles wisely.",
        context: "Full calendar, limited reserves. Not everything deserves your energy today.",
        driver: 'load'
      };
    }
    // 6. Medium Load
    if (calendarLoad === 'medium') {
      return {
        phrase: "Pace your recovery.",
        context: "Manageable schedule today. Use the gaps between commitments to reset.",
        driver: 'load'
      };
    }
    // 7. Morning-specific
    if (timeOfDay === 'morning') {
      return {
        phrase: "Set the tone gently.",
        context: "Morning overwhelm shapes the day. Start with regulation, not reaction.",
        driver: 'morning'
      };
    }
    // 8. Evening-specific
    if (timeOfDay === 'evening') {
      return {
        phrase: "Decompress before you rest.",
        context: "Your nervous system needs to downshift before sleep will be restorative.",
        driver: 'evening'
      };
    }
    // 9. Default (afternoon, low calendar)
    return {
      phrase: "Regulate before you engage.",
      context: "Your system is activated. Brief regulation unlocks clearer responses.",
      driver: 'state'
    };
  }

  // ============= DRAINED - Energy depleted, needs restoration =============
  if (checkInOutcome === 'drained') {
    // 1. High Pressure + High Load
    if (calendarPressure === 'high' && calendarLoad === 'high') {
      return {
        phrase: "Conserve for what counts.",
        context: "Critical moments ahead with empty reserves. Ruthlessly protect energy for high-stakes only.",
        driver: 'pressure+load'
      };
    }
    // 2. High Pressure + Medium Load
    if (calendarPressure === 'high' && calendarLoad === 'medium') {
      return {
        phrase: "Strategic bursts only.",
        context: "Important moments ahead. Deploy energy in focused bursts, recover between.",
        driver: 'pressure+load'
      };
    }
    // 3. High Pressure only
    if (calendarPressure === 'high') {
      return {
        phrase: "Guard your reserves.",
        context: "High stakes demand energy you're low on. Prepare mentally, conserve physically.",
        driver: 'pressure'
      };
    }
    // 4. Medium Pressure + High Load
    if (calendarPressure === 'medium' && calendarLoad === 'high') {
      return {
        phrase: "Endurance over excellence.",
        context: "Full schedule, depleted tank. Aim for completion, not perfection.",
        driver: 'load'
      };
    }
    // 5. High Load only
    if (calendarLoad === 'high') {
      return {
        phrase: "Navigate, don't sprint.",
        context: "Packed day, low fuel. Move through steadily without burning out.",
        driver: 'load'
      };
    }
    // 6. Medium Load
    if (calendarLoad === 'medium') {
      return {
        phrase: "Gentle momentum.",
        context: "Light enough schedule to pace yourself. Small wins compound into recovered energy.",
        driver: 'load'
      };
    }
    // 7. Morning-specific
    if (timeOfDay === 'morning') {
      return {
        phrase: "Ease into the day.",
        context: "Morning depletion calls for a slow start. Protect the first hour for restoration.",
        driver: 'morning'
      };
    }
    // 8. Evening-specific
    if (timeOfDay === 'evening') {
      return {
        phrase: "Rest is productive.",
        context: "Evening depletion signals you've given enough. Restoration is your priority now.",
        driver: 'evening'
      };
    }
    // 9. Default
    return {
      phrase: "Restore before you push.",
      context: "Low reserves call for recovery, not demands. Gentle restoration first.",
      driver: 'state'
    };
  }

  // ============= SCATTERED - Mind unfocused, needs grounding =============
  if (checkInOutcome === 'scattered') {
    // 1. High Pressure + High Load
    if (calendarPressure === 'high' && calendarLoad === 'high') {
      return {
        phrase: "Focus or fragment.",
        context: "Scattered mind meets maximum demands. Ground first, or risk reactive chaos.",
        driver: 'pressure+load'
      };
    }
    // 2. High Pressure + Medium Load
    if (calendarPressure === 'high' && calendarLoad === 'medium') {
      return {
        phrase: "Clarity before stakes.",
        context: "Important moments ahead. Clear the mental fog before you engage.",
        driver: 'pressure+load'
      };
    }
    // 3. High Pressure only
    if (calendarPressure === 'high') {
      return {
        phrase: "Find your center first.",
        context: "High stakes need a clear mind. Brief grounding prevents scattered execution.",
        driver: 'pressure'
      };
    }
    // 4. Medium Pressure + High Load
    if (calendarPressure === 'medium' && calendarLoad === 'high') {
      return {
        phrase: "Anchor and execute.",
        context: "Busy day needs a clear mind. Pick your anchor, let everything else orbit around it.",
        driver: 'load'
      };
    }
    // 5. High Load only
    if (calendarLoad === 'high') {
      return {
        phrase: "One thread at a time.",
        context: "Full calendar, scattered focus. Pick one thing, complete it, then move on.",
        driver: 'load'
      };
    }
    // 6. Medium Load
    if (calendarLoad === 'medium') {
      return {
        phrase: "Reclaim your attention.",
        context: "Moderate demands give you space. Use it to consolidate your focus.",
        driver: 'load'
      };
    }
    // 7. Morning-specific
    if (timeOfDay === 'morning') {
      return {
        phrase: "Ground before you go.",
        context: "Scattered mornings cascade into scattered days. Five minutes of focus now saves hours later.",
        driver: 'morning'
      };
    }
    // 8. Evening-specific
    if (timeOfDay === 'evening') {
      return {
        phrase: "Gather the fragments.",
        context: "Evening scatteredness needs closure. Collect your thoughts before you rest.",
        driver: 'evening'
      };
    }
    // 9. Default
    return {
      phrase: "Find your anchor point.",
      context: "Scattered energy needs a single focus. Choose one priority and let it organize the rest.",
      driver: 'state'
    };
  }

  // ============= STEADY - Balanced state =============
  if (checkInOutcome === 'steady') {
    // 1. High Pressure + High Load
    if (calendarPressure === 'high' && calendarLoad === 'high') {
      return {
        phrase: "Anchor in the storm.",
        context: "Maximum demands but you're balanced. Your stability is your advantage—hold the center.",
        driver: 'pressure+load'
      };
    }
    // 2. High Pressure + Medium Load
    if (calendarPressure === 'high' && calendarLoad === 'medium') {
      return {
        phrase: "Calm confidence.",
        context: "High-stakes moments with manageable gaps. Use your steady state as a competitive edge.",
        driver: 'pressure+load'
      };
    }
    // 3. High Pressure only
    if (calendarPressure === 'high') {
      return {
        phrase: "Rise to the moment.",
        context: "High stakes, steady foundation. You're positioned to perform when it matters.",
        driver: 'pressure'
      };
    }
    // 4. Medium Pressure + High Load
    if (calendarPressure === 'medium' && calendarLoad === 'high') {
      return {
        phrase: "Sustainable pace required.",
        context: "Full day ahead with moderate stakes. Your balance will be tested—pace accordingly.",
        driver: 'load'
      };
    }
    // 5. High Load only
    if (calendarLoad === 'high') {
      return {
        phrase: "Ride the rhythm.",
        context: "Busy day, balanced state. Your steadiness lets you flow through the density.",
        driver: 'load'
      };
    }
    // 6. Medium Load
    if (calendarLoad === 'medium') {
      return {
        phrase: "Steady as she goes.",
        context: "Balanced state meets balanced day. Maintain your rhythm without overreaching.",
        driver: 'load'
      };
    }
    // 7. Morning-specific
    if (timeOfDay === 'morning') {
      return {
        phrase: "Set the rhythm.",
        context: "Steady mornings build steady days. Establish your pace before external demands begin.",
        driver: 'morning'
      };
    }
    // 8. Evening-specific
    if (timeOfDay === 'evening') {
      return {
        phrase: "Maintain your balance.",
        context: "Steady evening is a win. Carry this equilibrium into rest.",
        driver: 'evening'
      };
    }
    // 9. Default
    return {
      phrase: "Build on your balance.",
      context: "You're in a good place. Use this foundation to make progress without strain.",
      driver: 'state'
    };
  }

  // ============= FOCUSED - High energy, ready to perform =============
  if (checkInOutcome === 'focused') {
    // 1. High Pressure + High Load
    if (calendarPressure === 'high' && calendarLoad === 'high') {
      return {
        phrase: "Peak performance day.",
        context: "Maximum capacity meets maximum demands. This is your moment to deliver at scale.",
        driver: 'pressure+load'
      };
    }
    // 2. High Pressure + Medium Load
    if (calendarPressure === 'high' && calendarLoad === 'medium') {
      return {
        phrase: "Execute with precision.",
        context: "High stakes, peak readiness. Deploy your focus where it creates decisive outcomes.",
        driver: 'pressure+load'
      };
    }
    // 3. High Pressure only
    if (calendarPressure === 'high') {
      return {
        phrase: "Seize the high ground.",
        context: "High stakes, peak state. You have the edge—use it decisively.",
        driver: 'pressure'
      };
    }
    // 4. Medium Pressure + High Load
    if (calendarPressure === 'medium' && calendarLoad === 'high') {
      return {
        phrase: "Channel the intensity.",
        context: "Full schedule but you're sharp. Direct your focus where it creates the most value.",
        driver: 'load'
      };
    }
    // 5. High Load only
    if (calendarLoad === 'high') {
      return {
        phrase: "Sprint through the density.",
        context: "Packed calendar, peak energy. Use your capacity to move through efficiently.",
        driver: 'load'
      };
    }
    // 6. Medium Load
    if (calendarLoad === 'medium') {
      return {
        phrase: "Strategic deployment.",
        context: "Moderate demands, peak state. Choose where to invest this energy for maximum return.",
        driver: 'load'
      };
    }
    // 7. Morning-specific
    if (timeOfDay === 'morning') {
      return {
        phrase: "Maximize your morning.",
        context: "Peak state in the morning is gold. Execute your highest-value work now.",
        driver: 'morning'
      };
    }
    // 8. Evening-specific
    if (timeOfDay === 'evening') {
      return {
        phrase: "Finish strong.",
        context: "Focused evening is rare. Complete what matters before the day closes.",
        driver: 'evening'
      };
    }
    // 9. Default
    return {
      phrase: "Own your optimal state.",
      context: "You're operating at your best. Protect this state and deploy it strategically.",
      driver: 'state'
    };
  }

  // ============= TIER-BASED FALLBACKS (No check-in outcome) =============
  
  // DEPLETED tier
  if (energyTier === 'depleted') {
    if (calendarPressure === 'high' && calendarLoad === 'high') {
      return {
        phrase: "Conserve for what counts.",
        context: "Critical moments ahead with empty reserves. Ruthlessly protect energy for high-stakes only.",
        driver: 'pressure+load'
      };
    }
    if (calendarPressure === 'high' && calendarLoad === 'medium') {
      return {
        phrase: "Strategic bursts only.",
        context: "Important moments ahead. Deploy energy in focused bursts, recover between.",
        driver: 'pressure+load'
      };
    }
    if (calendarPressure === 'high') {
      return {
        phrase: "Protect your energy today.",
        context: "High demands ahead but you're running on reserves. Be ruthless about what gets your attention.",
        driver: 'pressure'
      };
    }
    if (calendarPressure === 'medium' && calendarLoad === 'high') {
      return {
        phrase: "Endurance over excellence.",
        context: "Full schedule, depleted tank. Aim for completion, not perfection.",
        driver: 'load'
      };
    }
    if (calendarLoad === 'high') {
      return {
        phrase: "Less is more today.",
        context: "Your calendar is full but your tank isn't. Simplify, delegate, and preserve yourself.",
        driver: 'load'
      };
    }
    if (calendarLoad === 'medium') {
      return {
        phrase: "Gentle momentum.",
        context: "Light enough schedule to pace yourself. Small wins compound into recovered energy.",
        driver: 'load'
      };
    }
    if (timeOfDay === 'morning') {
      return {
        phrase: "Ease into the day.",
        context: "Morning depletion calls for a slow start. Protect the first hour for restoration.",
        driver: 'morning'
      };
    }
    if (timeOfDay === 'evening') {
      return {
        phrase: "Rest is your work tonight.",
        context: "Tomorrow's performance depends on tonight's recovery. Wind down intentionally.",
        driver: 'evening'
      };
    }
    return {
      phrase: "Restore before you push.",
      context: "Deep rest is not optional today—it's the foundation for everything else.",
      driver: 'state'
    };
  }

  // MANAGING tier
  if (energyTier === 'managing') {
    if (calendarPressure === 'high' && calendarLoad === 'high') {
      return {
        phrase: "Anchor in the storm.",
        context: "Maximum demands but you're holding. Your stability is your advantage—hold the center.",
        driver: 'pressure+load'
      };
    }
    if (calendarPressure === 'high' && calendarLoad === 'medium') {
      return {
        phrase: "Calm confidence.",
        context: "High-stakes moments with manageable gaps. Use your steady state as a competitive edge.",
        driver: 'pressure+load'
      };
    }
    if (calendarPressure === 'high') {
      return {
        phrase: "Steady under pressure.",
        context: "You're managing well. Today is about pacing yourself through high-stakes moments.",
        driver: 'pressure'
      };
    }
    if (calendarPressure === 'medium' && calendarLoad === 'high') {
      return {
        phrase: "Sustainable pace required.",
        context: "Full day ahead with moderate stakes. Your balance will be tested—pace accordingly.",
        driver: 'load'
      };
    }
    if (calendarLoad === 'high') {
      return {
        phrase: "Pace yourself for endurance.",
        context: "A full day ahead. Small resets between meetings will compound into sustained energy.",
        driver: 'load'
      };
    }
    if (calendarLoad === 'medium') {
      return {
        phrase: "Steady as she goes.",
        context: "Balanced state meets balanced day. Maintain your rhythm without overreaching.",
        driver: 'load'
      };
    }
    if (calendarLoad === 'low') {
      return {
        phrase: "Build your reserves today.",
        context: "Light calendar means space to invest in yourself. Use it wisely.",
        driver: 'load'
      };
    }
    if (timeOfDay === 'morning') {
      return {
        phrase: "Set the rhythm.",
        context: "Manage your mornings well and the days follow. Establish your pace early.",
        driver: 'morning'
      };
    }
    if (timeOfDay === 'evening') {
      return {
        phrase: "Maintain your balance.",
        context: "Managing well into evening is a win. Carry this equilibrium into rest.",
        driver: 'evening'
      };
    }
    return {
      phrase: "Balance before breakthrough.",
      context: "You're in a transitional state. Ground yourself before pushing for more.",
      driver: 'state'
    };
  }

  // STRONG tier
  if (energyTier === 'strong') {
    if (calendarPressure === 'high' && calendarLoad === 'high') {
      return {
        phrase: "Peak performance day.",
        context: "Strong capacity meets maximum demands. This is your moment to deliver at scale.",
        driver: 'pressure+load'
      };
    }
    if (calendarPressure === 'high' && calendarLoad === 'medium') {
      return {
        phrase: "Execute with precision.",
        context: "High stakes, strong readiness. Deploy your focus where it creates decisive outcomes.",
        driver: 'pressure+load'
      };
    }
    if (calendarPressure === 'high') {
      return {
        phrase: "You're ready for this.",
        context: "Strong energy meets high stakes. Lean into the challenge—you have the capacity.",
        driver: 'pressure'
      };
    }
    if (calendarPressure === 'medium' && calendarLoad === 'high') {
      return {
        phrase: "Channel the intensity.",
        context: "Full schedule but you're sharp. Direct your focus where it creates the most value.",
        driver: 'load'
      };
    }
    if (calendarLoad === 'high') {
      return {
        phrase: "Sprint through the density.",
        context: "Packed calendar, strong energy. Use your capacity to move through efficiently.",
        driver: 'load'
      };
    }
    if (calendarLoad === 'medium') {
      return {
        phrase: "Strategic deployment.",
        context: "Moderate demands, strong state. Choose where to invest this energy for maximum return.",
        driver: 'load'
      };
    }
    if (timeOfDay === 'morning') {
      return {
        phrase: "Lean into flow.",
        context: "Morning energy is prime. Channel it toward what matters most before the day fragments.",
        driver: 'morning'
      };
    }
    if (timeOfDay === 'evening') {
      return {
        phrase: "Close strong, rest well.",
        context: "Strong finish to the day. Complete what you started, then honor the transition to rest.",
        driver: 'evening'
      };
    }
    return {
      phrase: "Execute with intention.",
      context: "You have the energy. Direct it precisely toward your highest-leverage activities.",
      driver: 'state'
    };
  }

  // PEAK tier (default)
  if (calendarPressure === 'high' && calendarLoad === 'high') {
    return {
      phrase: "Maximum output mode.",
      context: "Peak state meets peak demands. Deploy everything you have—this is what you've trained for.",
      driver: 'pressure+load'
    };
  }
  if (calendarPressure === 'high' && calendarLoad === 'medium') {
    return {
      phrase: "Precision and power.",
      context: "Peak readiness, high stakes. Your execution today can be exceptional.",
      driver: 'pressure+load'
    };
  }
  if (calendarPressure === 'high') {
    return {
      phrase: "Execute with precision.",
      context: "Peak state meets peak demands. This is what you've trained for—deliver.",
      driver: 'pressure'
    };
  }
  if (calendarPressure === 'medium' && calendarLoad === 'high') {
    return {
      phrase: "Flow through the volume.",
      context: "Full day, peak capacity. Let your energy carry you through the density effortlessly.",
      driver: 'load'
    };
  }
  if (calendarLoad === 'high') {
    return {
      phrase: "Sprint through the density.",
      context: "Packed calendar, peak energy. Use your capacity to dominate the day.",
      driver: 'load'
    };
  }
  if (calendarLoad === 'medium') {
    return {
      phrase: "Strategic excellence.",
      context: "Peak state, moderate demands. Choose your targets and execute with precision.",
      driver: 'load'
    };
  }
  if (timeOfDay === 'morning') {
    return {
      phrase: "Maximize your morning.",
      context: "You're at your best. Tackle the hardest, most important work while the window is open.",
      driver: 'morning'
    };
  }
  if (timeOfDay === 'evening') {
    return {
      phrase: "Sustain and celebrate.",
      context: "Peak energy sustained into evening is rare. Acknowledge the day, then let it go.",
      driver: 'evening'
    };
  }
  return {
    phrase: "Own your optimal state.",
    context: "You're operating at your best. Protect this state and deploy it strategically.",
    driver: 'state'
  };
}
