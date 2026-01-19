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
    'pause': 10,           // I'm stressed/overwhelmed (Depleted)
    'power-up': 20,        // I'm drained/tired (Depleted)
    'steady': 50,          // I'm feeling steady and balanced (Managing)
    'presence': 55,        // I'm scattered/unfocused (Managing)
    'focused': 70,         // I'm focused and energized (Strong)
    'ready': 80            // I'm motivated and ready (Peak)
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

// Helper function to get check-in emotional state
function getCheckInEmotion(checkInOutcome: string | null): string {
  if (!checkInOutcome) return '';
  
  const emotionMap: Record<string, string> = {
    'pause': 'stressed and overwhelmed',
    'power-up': 'drained and tired',
    'presence': 'scattered and unfocused',
    'steady': 'feeling steady and balanced',
    'focused': 'focused and energized',
    'calm': 'anxious and tense',
    'ready': 'motivated and ready',
    'good': 'good'
  };
  
  return emotionMap[checkInOutcome] || '';
}

// Helper function to format context statement
function formatContextStatement(
  checkInOutcome: string | null,
  balance: number,
  timeOfDay: TimeOfDay,
  energyTier: EnergyTier
): string {
  const emotion = getCheckInEmotion(checkInOutcome);
  const timeLabel = timeOfDay === 'morning' ? 'this morning' : timeOfDay === 'afternoon' ? 'this afternoon' : 'this evening';
  
  // Tier display names
  const tierNames: Record<EnergyTier, string> = {
    'depleted': 'Depleted',
    'managing': 'Managing', 
    'strong': 'Strong',
    'peak': 'Peak'
  };
  
  // Tier explanations (time-aware for depleted)
  const tierMeanings: Record<EnergyTier, string> = {
    'depleted': timeOfDay === 'evening' 
      ? 'Depleted energy means you need calming techniques and restoration to prepare for deep rest tonight'
      : 'Depleted energy means you need deep rest and restoration before taking on demands',
    'managing': 'Managing energy means you need a mix of grounding and recovery practices to maintain performance',
    'strong': 'Strong energy means you can lean into flow states with grounding support',
    'peak': 'Peak energy means you can optimize high performance and sustain momentum'
  };
  
  const tierName = tierNames[energyTier];
  const tierMeaning = tierMeanings[energyTier];
  
  if (emotion) {
    return `You mentioned you are ${emotion}. Hence I understand your energy is ${tierName} ${timeLabel}. ${tierMeaning}.`;
  }
  
  return `Your energy is ${tierName} ${timeLabel}. ${tierMeaning}.`;
}

export function getRecommendation(
  balance: number,
  energyTier: EnergyTier,
  calendarMetrics: CalendarMetrics,
  wearableFunction: WearableFunction,
  checkInOutcome: string | null,
  timeOfDay: TimeOfDay
): Recommendation {
  const subTier = getEnergySubTier(balance);
  
  // ==================== DEPLETED TIER ====================
  if (energyTier === 'depleted') {
    // Differentiate by CHECK-IN OUTCOME (type of depletion)
    
    if (checkInOutcome === 'pause') {
      // STRESSED/OVERWHELMED → Need grounding and calming
      return {
        primary: 'pause',
        primarySubtype: calendarMetrics.pressure === 'high' ? 'composure' : 'grounding',
        secondary: 'renewal',
        secondarySubtype: 'restore',
        contextStatement: formatContextStatement(
          checkInOutcome, balance, timeOfDay, energyTier
        )
      };
    }
    
    if (checkInOutcome === 'power-up') {
      // DRAINED/TIRED → Could need rest OR gentle energizing
      if (wearableFunction === 'low' && calendarMetrics.pressure !== 'high') {
        // Very low physiological readiness + no pressure = DEEP REST
        return {
          primary: 'pause',
          primarySubtype: 'deep-calm',
          secondary: 'renewal',
          secondarySubtype: 'restore',
          contextStatement: formatContextStatement(
            checkInOutcome, balance, timeOfDay, energyTier
          )
        };
      } else {
        // Needs gentle energizing
        return {
          primary: 'renewal',
          primarySubtype: 'recharge',
          secondary: 'pause',
          secondarySubtype: 'grounding',
          contextStatement: formatContextStatement(
            checkInOutcome, balance, timeOfDay, energyTier
          )
        };
      }
    }
    
    if (checkInOutcome === 'presence') {
      // SCATTERED/UNFOCUSED → Flow (activate) + Pause (grounding)
      return {
        primary: 'flow',
        primarySubtype: 'activate',
        secondary: 'pause',
        secondarySubtype: 'grounding',
        contextStatement: formatContextStatement(
          checkInOutcome, balance, timeOfDay, energyTier
        )
      };
    }
    
    // Default depleted (fallback for old outcomes or no check-in)
    let secondarySubtype: MasterySubtype = 'grounding';
    let recommendation = '';
    
    if (subTier === 'very-low') {
      secondarySubtype = (calendarMetrics.pressure === 'high') ? 'grounding' : 'deep-calm';
      recommendation = secondarySubtype === 'deep-calm' 
        ? 'deep rest is your priority—focus on restoring your energy before anything else' 
        : 'high demands require maintaining composure under stress';
    } else if (subTier === 'low') {
      secondarySubtype = (calendarMetrics.pressure === 'low' && wearableFunction === 'low') ? 'deep-calm' : 'grounding';
      recommendation = secondarySubtype === 'deep-calm'
        ? 'your body needs deep rest right now—recovery is essential before you take on anything else'
        : 'ground yourself first before tackling demands';
    } else {
      secondarySubtype = (calendarMetrics.pressure === 'high' || calendarMetrics.load === 'high') ? 'composure' : 'grounding';
      recommendation = secondarySubtype === 'composure'
        ? 'cognitive clarity is compromised—maintain composure under pressure'
        : 'scattered energy calls for grounding to restore focus';
    }
    
    return {
      primary: 'renewal',
      primarySubtype: 'restore',
      secondary: 'pause',
      secondarySubtype,
      contextStatement: formatContextStatement(checkInOutcome, balance, timeOfDay, energyTier)
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
        contextStatement: formatContextStatement(checkInOutcome, balance, timeOfDay, energyTier)
      };
    } else if (calendarMetrics.load === 'medium') {
      return {
        primary: 'pause',
        primarySubtype: 'grounding',
        secondary: 'flow',
        secondarySubtype: 'activate',
        contextStatement: formatContextStatement(checkInOutcome, balance, timeOfDay, energyTier)
      };
    } else {
      return {
        primary: 'flow',
        primarySubtype: 'activate',
        secondary: 'pause',
        secondarySubtype: 'grounding',
        contextStatement: formatContextStatement(checkInOutcome, balance, timeOfDay, energyTier)
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
        contextStatement: formatContextStatement(checkInOutcome, balance, timeOfDay, energyTier)
      };
    } else {
      return {
        primary: 'flow',
        primarySubtype: 'activate',
        secondary: 'pause',
        secondarySubtype: 'grounding',
        contextStatement: formatContextStatement(checkInOutcome, balance, timeOfDay, energyTier)
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
      contextStatement: formatContextStatement(checkInOutcome, balance, timeOfDay, energyTier)
    };
  } else if (timeOfDay === 'evening') {
    return {
      primary: 'flow',
      primarySubtype: 'maintain-peak',
      secondary: 'renewal',
      secondarySubtype: 'refresh',
      contextStatement: formatContextStatement(checkInOutcome, balance, timeOfDay, energyTier)
    };
  } else {
    return {
      primary: 'flow',
      primarySubtype: 'optimize',
      secondary: 'pause',
      secondarySubtype: 'grounding',
      contextStatement: formatContextStatement(checkInOutcome, balance, timeOfDay, energyTier)
    };
  }
}

// ==================== STRATEGIC THEME GENERATION ====================

export interface StrategicTheme {
  phrase: string;
  context: string;
}

export function getStrategicTheme(
  energyTier: EnergyTier,
  calendarLoad: CalendarLoad,
  calendarPressure: CalendarPressure,
  timeOfDay: TimeOfDay
): StrategicTheme {
  // Depleted tier themes
  if (energyTier === 'depleted') {
    if (calendarPressure === 'high') {
      return {
        phrase: "Protect your energy today.",
        context: "High demands ahead but you're running on reserves. Be ruthless about what gets your attention."
      };
    }
    if (calendarLoad === 'high') {
      return {
        phrase: "Less is more today.",
        context: "Your calendar is full but your tank isn't. Simplify, delegate, and preserve yourself."
      };
    }
    if (timeOfDay === 'evening') {
      return {
        phrase: "Rest is your work tonight.",
        context: "Tomorrow's performance depends on tonight's recovery. Wind down intentionally."
      };
    }
    return {
      phrase: "Restore before you push.",
      context: "Deep rest is not optional today—it's the foundation for everything else."
    };
  }

  // Managing tier themes
  if (energyTier === 'managing') {
    if (calendarPressure === 'high') {
      return {
        phrase: "Steady under pressure.",
        context: "You're managing well. Today is about pacing yourself through high-stakes moments."
      };
    }
    if (calendarLoad === 'high') {
      return {
        phrase: "Pace yourself for endurance.",
        context: "A full day ahead. Small resets between meetings will compound into sustained energy."
      };
    }
    if (calendarLoad === 'low') {
      return {
        phrase: "Build your reserves today.",
        context: "Light calendar means space to invest in yourself. Use it wisely."
      };
    }
    return {
      phrase: "Balance before breakthrough.",
      context: "You're in a transitional state. Ground yourself before pushing for more."
    };
  }

  // Strong tier themes
  if (energyTier === 'strong') {
    if (calendarPressure === 'high') {
      return {
        phrase: "You're ready for this.",
        context: "Strong energy meets high stakes. Lean into the challenge—you have the capacity."
      };
    }
    if (timeOfDay === 'morning') {
      return {
        phrase: "Lean into flow.",
        context: "Morning energy is prime. Channel it toward what matters most before the day fragments."
      };
    }
    if (timeOfDay === 'evening') {
      return {
        phrase: "Close strong, rest well.",
        context: "Strong finish to the day. Complete what you started, then honor the transition to rest."
      };
    }
    return {
      phrase: "Execute with intention.",
      context: "You have the energy. Direct it precisely toward your highest-leverage activities."
    };
  }

  // Peak tier themes
  if (calendarPressure === 'high') {
    return {
      phrase: "Execute with precision.",
      context: "Peak state meets peak demands. This is what you've trained for—deliver."
    };
  }
  if (timeOfDay === 'morning') {
    return {
      phrase: "Maximize your morning.",
      context: "You're at your best. Tackle the hardest, most important work while the window is open."
    };
  }
  if (timeOfDay === 'evening') {
    return {
      phrase: "Sustain and celebrate.",
      context: "Peak energy sustained into evening is rare. Acknowledge the day, then let it go."
    };
  }
  return {
    phrase: "Own your optimal state.",
    context: "You're operating at your best. Protect this state and deploy it strategically."
  };
}
