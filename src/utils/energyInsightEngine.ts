import type { CurrentEnergyState } from './energyStateEngine';

interface InsightTemplate {
  stateObservation: string;
  contextClause?: string;
  recommendation: string;
}

interface InsightParams {
  balance: number;
  checkInOutcome: 'pause' | 'power-up' | 'presence' | 'calm' | 'ready' | null | undefined;
  timeOfDay: number; // 0-23
  calendarDensity: number;
  dataSources: string[];
}

type TimeOfDay = 'morning' | 'afternoon' | 'evening';
type BalanceRange = 'depleted' | 'managing' | 'strong' | 'peak';

export function generateEnergyInsight(params: InsightParams): string {
  const { balance, checkInOutcome, timeOfDay, calendarDensity, dataSources } = params;
  
  const timeLabel = getTimeLabel(timeOfDay);
  const balanceRange = getBalanceRange(balance);
  
  const template = selectInsightTemplate(
    balanceRange,
    timeLabel,
    checkInOutcome,
    calendarDensity,
    dataSources
  );
  
  return buildInsightText(template);
}

function getTimeLabel(hour: number): TimeOfDay {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

function getBalanceRange(balance: number): BalanceRange {
  if (balance < 40) return 'depleted';
  if (balance < 60) return 'managing';
  if (balance < 75) return 'strong';
  return 'peak';
}

function selectInsightTemplate(
  balanceRange: BalanceRange,
  timeLabel: TimeOfDay,
  checkInOutcome: string | null | undefined,
  calendarDensity: number,
  dataSources: string[]
): InsightTemplate {
  const hasWearable = dataSources.includes('wearable');
  const hasCalendar = dataSources.includes('calendar') && timeLabel !== 'evening';
  
  // DEPLETED (<40)
  if (balanceRange === 'depleted') {
    if (timeLabel === 'morning') {
      if (checkInOutcome === 'power-up') {
        return {
          stateObservation: 'Low energy detected in morning peak window',
          contextClause: hasCalendar && calendarDensity === 0 ? 'Clear schedule offers recovery opportunity' : undefined,
          recommendation: 'Recommended: gentle energizing practices before 11am'
        };
      }
      if (checkInOutcome === 'pause') {
        return {
          stateObservation: 'System depleted with stress signals',
          contextClause: hasWearable ? 'Biometrics confirm need for recovery' : undefined,
          recommendation: 'Recommended: calming practices before demands escalate'
        };
      }
      if (checkInOutcome === 'calm') {
        return {
          stateObservation: 'Low energy with tension present',
          recommendation: 'Recommended: grounding practices to build stability'
        };
      }
      if (checkInOutcome === 'presence') {
        return {
          stateObservation: 'Scattered focus in depleted state',
          recommendation: 'Recommended: gentle centering practices'
        };
      }
      // ready or null
      return {
        stateObservation: 'Low morning energy detected',
        contextClause: 'Peak window still available',
        recommendation: 'Recommended: gentle activation to lift energy'
      };
    }
    
    if (timeLabel === 'afternoon') {
      if (checkInOutcome === 'pause') {
        return {
          stateObservation: 'System depleted with stress accumulating',
          contextClause: hasCalendar && calendarDensity > 2 ? `With ${calendarDensity} meetings ahead, protection critical` : undefined,
          recommendation: 'Recommended: immediate calming practices'
        };
      }
      if (checkInOutcome === 'power-up') {
        return {
          stateObservation: 'Deep fatigue in afternoon period',
          recommendation: 'Recommended: brief energizing practices or rest'
        };
      }
      return {
        stateObservation: 'Energy dip detected in afternoon',
        contextClause: hasCalendar && calendarDensity > 0 ? 'Support critical for remaining demands' : undefined,
        recommendation: 'Recommended: restoration practices'
      };
    }
    
    // Evening
    if (checkInOutcome === 'pause') {
      return {
        stateObservation: 'Stressed and depleted after demanding day',
        recommendation: 'Recommended: calming practices to transition into rest mode'
      };
    }
    if (checkInOutcome === 'power-up') {
      return {
        stateObservation: 'System depleted at day end',
        contextClause: hasWearable ? 'Recovery metrics confirm need for deep rest' : undefined,
        recommendation: 'Recommended: prioritize sleep and recovery tonight'
      };
    }
    return {
      stateObservation: 'Low energy at evening transition',
      recommendation: 'Recommended: gentle grounding to prepare for rest'
    };
  }
  
  // MANAGING (40-60)
  if (balanceRange === 'managing') {
    if (timeLabel === 'morning') {
      if (checkInOutcome === 'pause') {
        return {
          stateObservation: 'Managing stress in morning window',
          recommendation: 'Recommended: calming practices to protect peak hours'
        };
      }
      if (checkInOutcome === 'power-up') {
        return {
          stateObservation: 'Moderate energy in morning peak',
          contextClause: hasCalendar && calendarDensity > 0 ? 'Support helpful before demands begin' : undefined,
          recommendation: 'Recommended: activating practices to optimize window'
        };
      }
      if (checkInOutcome === 'presence') {
        return {
          stateObservation: 'Scattered focus in morning period',
          recommendation: 'Recommended: centering practices to sharpen clarity'
        };
      }
      return {
        stateObservation: 'Moderate balance in morning',
        recommendation: 'Recommended: grounding practices to build stability'
      };
    }
    
    if (timeLabel === 'afternoon') {
      if (checkInOutcome === 'pause') {
        return {
          stateObservation: 'Managing stress in afternoon period',
          contextClause: hasCalendar && calendarDensity > 2 ? `With ${calendarDensity} meetings ahead, centering critical` : undefined,
          recommendation: 'Recommended: calming practices to protect decision quality'
        };
      }
      if (checkInOutcome === 'presence') {
        return {
          stateObservation: 'Scattered focus in afternoon dip',
          contextClause: hasCalendar && calendarDensity > 0 ? 'Centering critical for remaining demands' : undefined,
          recommendation: 'Recommended: focus practices to restore clarity'
        };
      }
      if (checkInOutcome === 'power-up') {
        return {
          stateObservation: 'Moderate energy in afternoon period',
          recommendation: 'Recommended: brief energizing practices to sustain performance'
        };
      }
      return {
        stateObservation: 'Managing afternoon demands',
        recommendation: 'Recommended: grounding practices to maintain stability'
      };
    }
    
    // Evening
    if (checkInOutcome === 'pause') {
      return {
        stateObservation: 'Stressed after a full day',
        recommendation: 'Recommended: calming practices for evening transition'
      };
    }
    if (checkInOutcome === 'power-up') {
      return {
        stateObservation: 'Moderate fatigue at day end',
        recommendation: 'Recommended: gentle restoration practices'
      };
    }
    return {
      stateObservation: 'Moderate balance at evening transition',
      recommendation: 'Recommended: grounding practices to consolidate and prepare for rest'
    };
  }
  
  // STRONG (60-75)
  if (balanceRange === 'strong') {
    if (timeLabel === 'morning') {
      if (checkInOutcome === 'ready') {
        return {
          stateObservation: 'Strong performance state in peak window',
          contextClause: hasCalendar && calendarDensity > 2 ? 'Well-positioned for demanding schedule' : undefined,
          recommendation: 'Recommended: grounding practices to sustain clarity'
        };
      }
      if (checkInOutcome === 'presence') {
        return {
          stateObservation: 'Strong energy with opportunity to sharpen focus',
          recommendation: 'Recommended: centering practices to optimize performance'
        };
      }
      return {
        stateObservation: 'Solid regulation in morning window',
        recommendation: 'Recommended: maintain with grounding practices'
      };
    }
    
    if (timeLabel === 'afternoon') {
      if (checkInOutcome === 'ready') {
        return {
          stateObservation: 'Strong performance maintained through afternoon',
          contextClause: hasCalendar && calendarDensity > 0 ? 'Well-positioned for remaining demands' : undefined,
          recommendation: 'Recommended: grounding practices to sustain through evening'
        };
      }
      if (checkInOutcome === 'pause') {
        return {
          stateObservation: 'Strong state but stress building',
          recommendation: 'Recommended: brief calming practices to maintain quality'
        };
      }
      return {
        stateObservation: 'Solid regulation in afternoon',
        recommendation: 'Recommended: centering practices to protect performance'
      };
    }
    
    // Evening
    if (checkInOutcome === 'ready') {
      return {
        stateObservation: 'Strong regulation maintained through the day',
        recommendation: 'Recommended: grounding practices to consolidate gains and prepare for rest'
      };
    }
    return {
      stateObservation: 'Solid state at evening transition',
      recommendation: 'Recommended: grounding practices to wind down'
    };
  }
  
  // PEAK (75+)
  if (balanceRange === 'peak') {
    if (timeLabel === 'morning') {
      return {
        stateObservation: 'Peak regulation in morning window',
        contextClause: hasCalendar && calendarDensity > 2 ? 'Excellent positioning for demanding day' : 'Optimal state to leverage',
        recommendation: 'Recommended: grounding practices to maintain excellence'
      };
    }
    
    if (timeLabel === 'afternoon') {
      return {
        stateObservation: 'Peak performance sustained through afternoon',
        recommendation: 'Recommended: grounding practices to protect state through evening'
      };
    }
    
    // Evening
    return {
      stateObservation: 'Peak regulation maintained through the day',
      recommendation: 'Recommended: grounding practices to consolidate gains and transition to rest'
    };
  }
  
  // Fallback (should never reach here)
  return {
    stateObservation: 'Current energy state assessed',
    recommendation: 'Recommended: grounding practices to support balance'
  };
}

function buildInsightText(template: InsightTemplate): string {
  const parts: string[] = [template.stateObservation];
  
  if (template.contextClause) {
    parts.push(template.contextClause);
  }
  
  parts.push(template.recommendation);
  
  return parts.join('. ') + '.';
}
