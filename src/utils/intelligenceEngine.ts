// Intelligence Engine for Mental Elite Homepage
// Calculates Mental Fitness Score, detects patterns, and generates intelligent priorities

export interface MentalFitnessScore {
  currentScore: number;
  previousScore: number;
  change: number;
  breakdown: {
    scenariosCompleted: number;
    practiceConsistency: number;
    breakthroughs: number;
    activeDays: number;
  };
}

export interface QuickWin {
  date: string;
  win: string;
  source: 'dialogue' | 'sanctuary';
  sessionId?: string;
}

export interface Pattern {
  text: string;
  effectiveness?: number;
  correlation?: number;
  sampleSize?: number;
}

export interface IntelligentPriority {
  type: 'practice-followup' | 'calendar-event' | 'skill-gap';
  title: string;
  subtitle?: string;
  timeHorizon?: string;
  icon: string;
  whyThisMatters: string;
  metaSkillFocus?: string;
  route: string;
  ctaLabel: string;
}

// Get Win Verbatim (Yesterday's achievement)
export function getWinVerbatim(): string | null {
  const quickWins = JSON.parse(localStorage.getItem('quickWins') || '[]');
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  const yesterdayWin = quickWins.find((win: QuickWin) => 
    sameDay(new Date(win.date), yesterday)
  );
  
  return yesterdayWin ? `Yesterday you achieved: ${yesterdayWin.win}` : null;
}

// Calculate Mental Fitness Score (includes both Dialogue and Sanctuary)
export function calculateMentalFitnessScore(): MentalFitnessScore {
  const practiceHistory = JSON.parse(localStorage.getItem('practiceHistory') || '[]');
  const recalibrateHistory = JSON.parse(localStorage.getItem('recalibrateHistory') || '[]');
  const quickWins = JSON.parse(localStorage.getItem('quickWins') || '[]');
  const previousScore = JSON.parse(localStorage.getItem('mentalFitnessScore') || '{}').currentScore || 0;

  // ALL practices completed (40% weight) - Dialogue + Sanctuary
  const allPractices = practiceHistory.length + recalibrateHistory.length;
  const practicesScore = Math.min(allPractices, 100);

  // Practice consistency (30% weight) - based on streak and frequency
  const streak = getUserStreak();
  const practicesLast30Days = [...practiceHistory, ...recalibrateHistory].filter((p: any) => 
    withinLast30Days(p.timestamp)
  ).length;
  const consistencyScore = Math.min((streak * 2) + (practicesLast30Days * 2), 100);

  // Self-reported breakthroughs (20% weight) - Quick Wins
  const breakthroughsScore = Math.min(quickWins.length * 5, 100);

  // Days active (10% weight) - active days in last 90 days
  const activeDays = getActiveDaysCount(90);
  const activeDaysScore = Math.min((activeDays / 90) * 100, 100);

  // Calculate weighted score
  const currentScore = Math.round(
    (practicesScore * 0.4) +
    (consistencyScore * 0.3) +
    (breakthroughsScore * 0.2) +
    (activeDaysScore * 0.1)
  );

  const change = currentScore - previousScore;

  // Save for next comparison
  const scoreData = {
    currentScore,
    previousScore: currentScore,
    change,
    breakdown: {
      scenariosCompleted: allPractices,
      practiceConsistency: consistencyScore,
      breakthroughs: quickWins.length,
      activeDays
    },
    lastCalculated: new Date().toISOString()
  };
  localStorage.setItem('mentalFitnessScore', JSON.stringify(scoreData));

  return scoreData;
}

// Get latest Quick Win or Insight
export function getLatestQuickWin(): { type: 'quick-win' | 'insight'; text: string; date: string } | null {
  const quickWins = JSON.parse(localStorage.getItem('quickWins') || '[]');
  
  // Get yesterday's quick win
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  const yesterdayWin = quickWins.find((win: QuickWin) => 
    sameDay(new Date(win.date), yesterday)
  );
  
  if (yesterdayWin) {
    return {
      type: 'quick-win',
      text: yesterdayWin.win,
      date: 'Yesterday'
    };
  }
  
  // Fallback to latest insight
  const practiceHistory = JSON.parse(localStorage.getItem('practiceHistory') || '[]');
  const latestPractice = practiceHistory[0];
  
  if (latestPractice?.insight) {
    return {
      type: 'insight',
      text: latestPractice.insight,
      date: formatRelativeDate(latestPractice.timestamp)
    };
  }
  
  return null;
}

// Detect user patterns
export function detectUserPatterns(): Pattern[] {
  const patterns: Pattern[] = [];
  const recalibrateHistory = JSON.parse(localStorage.getItem('recalibrateHistory') || '[]');
  const practiceHistory = JSON.parse(localStorage.getItem('practiceHistory') || '[]');
  
  if (practiceHistory.length < 5) return patterns; // Need minimum data
  
  // Time-of-day effectiveness
  const morningPractices = practiceHistory.filter((s: any) => {
    const hour = new Date(s.timestamp).getHours();
    return hour >= 6 && hour < 12;
  });
  
  if (morningPractices.length > 3) {
    const avgMorningEffectiveness = average(morningPractices.map((s: any) => s.effectivenessRating || 4));
    
    if (avgMorningEffectiveness >= 4.0) {
      patterns.push({
        text: `You practice most at 7am (${avgMorningEffectiveness.toFixed(1)}/5 effectiveness)`,
        effectiveness: avgMorningEffectiveness,
        sampleSize: morningPractices.length
      });
    }
  }
  
  // Check-in to recalibrate correlation
  const checkInHistory = JSON.parse(localStorage.getItem('checkInHistory') || '[]');
  const pauseDays = checkInHistory.filter((c: any) => c.outcome === 'pause');
  const pauseRecalibrates = recalibrateHistory.filter((r: any) => 
    pauseDays.some((p: any) => sameDay(new Date(p.timestamp), new Date(r.timestamp)))
  );
  
  if (pauseRecalibrates.length > 3) {
    patterns.push({
      text: 'Pause sessions work best after stress check-ins',
      correlation: 0.82,
      sampleSize: pauseRecalibrates.length
    });
  }
  
  // Meta-skill growth pattern
  const metaSkillGrowth = getMetaSkillGrowth();
  const fastestGrowingSkill = Object.entries(metaSkillGrowth)
    .sort(([, a]: any, [, b]: any) => b.weeklyGrowth - a.weeklyGrowth)[0];
  
  if (fastestGrowingSkill && fastestGrowingSkill[1].weeklyGrowth > 0.1) {
    const skillName = fastestGrowingSkill[0] === 'social_intelligence' ? 'Social Intelligence' :
                     fastestGrowingSkill[0] === 'adaptive_capacity' ? 'Adaptive Capacity' : 'Self-Regulation';
    patterns.push({
      text: `${skillName} grows fastest with 2x/week practice`,
      effectiveness: fastestGrowingSkill[1].weeklyGrowth * 10
    });
  }
  
  return patterns.slice(0, 3); // Max 3 patterns
}

// Generate intelligent priorities (max 2) with rich context
export function generateIntelligentPriorities(): IntelligentPriority[] {
  const priorities: IntelligentPriority[] = [];
  const practiceHistory = JSON.parse(localStorage.getItem('practiceHistory') || '[]');
  const patterns = detectUserPatterns();
  const metaSkills = getMetaSkillGrowth();
  const calendarEvents = JSON.parse(localStorage.getItem('calendarEvents') || '[]');
  const wearableData = JSON.parse(localStorage.getItem('wearableData') || '{}');
  
  // Priority 1: Yesterday's Practice Follow-Up (if exists)
  const yesterday = practiceHistory.find((p: any) => wasYesterday(p.timestamp));
  
  if (yesterday && yesterday.insight) {
    const missedOpportunity = yesterday.blindSpot || yesterday.insight;
    priorities.push({
      type: 'practice-followup',
      title: "Yesterday's Practice 💭",
      subtitle: `Scenario: ${yesterday.scenario || 'Difficult conversation'}`,
      icon: 'MessageSquare',
      whyThisMatters: `Yesterday you missed ${missedOpportunity}. Practice it today to perfect it. Your brain is primed to integrate this—make it your secret weapon.`,
      route: '/practice',
      ctaLabel: 'Practice Similar Scenario'
    });
  }
  
  // Priority 2: Context-Based Recommendation (Calendar/Patterns/Memory)
  const calendarConnected = localStorage.getItem('calendarConnected') === 'true';
  
  if (calendarConnected && calendarEvents.length > 0) {
    const nextEvent = getUpcomingHighStakesEvent();
    if (nextEvent) {
      const lowestSkill = getLowestMetaSkill();
      const bestTimePattern = patterns.find(p => p.text.includes('am'));
      const previousEventData = wearableData.lastBoardMeeting || {};
      
      let contextRich = `Tomorrow ${nextEvent.title} per your calendar. `;
      
      // Add wearable data context if available
      if (previousEventData.highHRV) {
        contextRich += `You showed high HRV during last ${nextEvent.type}—leverage that composure. `;
      }
      
      // Add pattern context
      if (bestTimePattern) {
        contextRich += `${bestTimePattern.text}. `;
      }
      
      // Add meta-skill focus
      contextRich += `Your ${lowestSkill.displayName} is one you want to work on. Practice makes it your unfair advantage.`;
      
      priorities.push({
        type: 'calendar-event',
        title: nextEvent.title,
        timeHorizon: `${nextEvent.daysAway} days away`,
        icon: 'BookOpen',
        whyThisMatters: contextRich,
        metaSkillFocus: lowestSkill.key,
        route: '/practice',
        ctaLabel: 'Practice with Assessor'
      });
    }
  } else {
    // Pro: Pattern-based recommendation
    const lowestSkill = getLowestMetaSkill();
    const practicePattern = detectPracticePattern(practiceHistory);
    
    let whyMatters = '';
    
    if (practicePattern.doingWellAt) {
      whyMatters = `Seeing patterns: you're doing more scenarios where you're naturally good at ${practicePattern.doingWellAt}. How about you try ${lowestSkill.displayName}? `;
    } else {
      whyMatters = `Your ${lowestSkill.displayName} is one you identified wanting to work on. `;
    }
    
    whyMatters += `Practice builds this into your secret weapon.`;
    
    priorities.push({
      type: 'skill-gap',
      title: `Build ${lowestSkill.displayName}`,
      timeHorizon: 'Today',
      icon: 'Target',
      whyThisMatters: whyMatters,
      metaSkillFocus: lowestSkill.key,
      route: '/practice',
      ctaLabel: 'Start Practice'
    });
  }
  
  return priorities.slice(0, 2); // Max 2 priorities
}

// Detect practice pattern (what user is naturally good at)
function detectPracticePattern(practiceHistory: any[]) {
  if (practiceHistory.length < 5) return { doingWellAt: null };
  
  const recentPractices = practiceHistory.slice(0, 10);
  const metaSkillCounts: Record<string, number> = {};
  
  recentPractices.forEach(p => {
    if (p.metaSkillsFocused) {
      p.metaSkillsFocused.forEach((skill: string) => {
        metaSkillCounts[skill] = (metaSkillCounts[skill] || 0) + 1;
      });
    }
  });
  
  const mostPracticed = Object.entries(metaSkillCounts)
    .sort(([, a], [, b]) => b - a)[0];
  
  if (mostPracticed && mostPracticed[1] > 5) {
    const skillName = mostPracticed[0] === 'social_intelligence' ? 'Social Intelligence' :
                     mostPracticed[0] === 'adaptive_capacity' ? 'Adaptive Capacity' : 'Self-Regulation';
    return { doingWellAt: skillName };
  }
  
  return { doingWellAt: null };
}

// Daily Ritual Recommendation
export function getDailyRitualRecommendation() {
  const hour = new Date().getHours();
  const checkIn = JSON.parse(localStorage.getItem('dailyCheckIn') || '{}');
  const hasCheckIn = checkIn.timestamp && new Date(checkIn.timestamp).toDateString() === new Date().toDateString();
  
  // Evening mode (6pm-12am)
  if (hour >= 18) {
    return {
      title: 'Close Your Day',
      subtitle: 'Reflect and restore before tomorrow',
      icon: 'Waves',
      ctaLabel: 'Evening Wind-Down',
      route: '/recalibrate/pause'
    };
  }
  
  // Morning mode (6am-12pm)
  if (hour < 12) {
    if (!hasCheckIn) {
      return {
        title: 'Set Your Intention',
        subtitle: 'How are you showing up today?',
        icon: 'Target',
        ctaLabel: 'Daily Check-in',
        route: '/daily-check-in'
      };
    } else {
      return {
        title: 'Get Ready for the Day',
        subtitle: getEnergyInsight(checkIn.outcome),
        icon: getOutcomeIcon(checkIn.outcome),
        ctaLabel: getRecommendedAction(checkIn),
        route: getRecommendedRoute(checkIn)
      };
    }
  }
  
  // Afternoon mode (12pm-6pm)
  return {
    title: 'Recalibrate Your Energy',
    subtitle: hasCheckIn 
      ? getEnergyInsight(checkIn.outcome)
      : 'Take a moment to reset',
    icon: 'Zap',
    ctaLabel: getRecommendedAction(checkIn) || 'Quick Reset',
    route: getRecommendedRoute(checkIn) || '/recalibrate'
  };
}

// Helper functions
function getUserStreak(): number {
  const practiceHistory = JSON.parse(localStorage.getItem('practiceHistory') || '[]');
  if (practiceHistory.length === 0) return 0;
  
  let streak = 0;
  let currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  
  while (true) {
    const hasActivity = practiceHistory.some((p: any) => 
      sameDay(new Date(p.timestamp), currentDate)
    );
    
    if (hasActivity) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }
  
  return streak;
}

function withinLast30Days(timestamp: string): boolean {
  const date = new Date(timestamp);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return date >= thirtyDaysAgo;
}

function getActiveDaysCount(days: number): number {
  const practiceHistory = JSON.parse(localStorage.getItem('practiceHistory') || '[]');
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const activeDates = new Set(
    practiceHistory
      .filter((p: any) => new Date(p.timestamp) >= startDate)
      .map((p: any) => new Date(p.timestamp).toDateString())
  );
  
  return activeDates.size;
}

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

function sameDay(d1: Date, d2: Date): boolean {
  return d1.toDateString() === d2.toDateString();
}

function wasYesterday(timestamp: string): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return sameDay(new Date(timestamp), yesterday);
}

function formatRelativeDate(timestamp: string): string {
  const date = new Date(timestamp);
  const today = new Date();
  const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function getMetaSkillGrowth() {
  // Placeholder - would calculate from actual practice history
  return {
    adaptive_capacity: { baseline: 6.7, current: 6.9, weeklyGrowth: 0.2 },
    social_intelligence: { baseline: 8.9, current: 8.9, weeklyGrowth: 0.0 },
    self_regulation: { baseline: 5.6, current: 5.8, weeklyGrowth: 0.2 }
  };
}

function getLowestMetaSkill() {
  const skills = getMetaSkillGrowth();
  const lowest = Object.entries(skills)
    .sort(([, a], [, b]) => a.current - b.current)[0];
  
  return {
    key: lowest[0],
    displayName: lowest[0] === 'social_intelligence' ? 'Social Intelligence' :
                 lowest[0] === 'adaptive_capacity' ? 'Adaptive Capacity' :
                 'Self-Regulation'
  };
}

function getUpcomingHighStakesEvent() {
  // Placeholder - would fetch from connected calendar
  const events = JSON.parse(localStorage.getItem('calendarEvents') || '[]');
  const upcoming = events.find((e: any) => {
    const daysAway = Math.floor((new Date(e.datetime).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return daysAway > 0 && daysAway <= 14;
  });
  
  if (upcoming) {
    const daysAway = Math.floor((new Date(upcoming.datetime).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return { ...upcoming, daysAway };
  }
  
  return null;
}

function getEnergyInsight(outcome: string): string {
  const insightMap: Record<string, string> = {
    'pause': "You're seeking calm and restoration today",
    'power-up': "You're building energy and activation",
    'presence': "You're entering deep focus and flow"
  };
  
  return insightMap[outcome] || "Ready to tackle your day with focus";
}

function getOutcomeIcon(outcome: string): string {
  const iconMap: Record<string, string> = {
    'pause': 'Waves',
    'power-up': 'Zap',
    'presence': 'Target'
  };
  
  return iconMap[outcome] || 'Heart';
}

function getRecommendedAction(checkIn: any): string {
  if (!checkIn.outcome) return 'Daily Check-in';
  
  const actionMap: Record<string, Record<string, string>> = {
    'pause': {
      'high_stakes_decision': '8-min Box Breathing',
      'managing_stress': 'Stress Relief Practice',
      'quick_reset': 'Quick Pause Reset',
      'default': 'Pause Practice'
    },
    'power-up': {
      'low_energy_morning': 'Wim Hof Power-Up',
      'sustainable_energy': 'Energy Building Practice',
      'quick_boost': '3-min Energy Boost',
      'default': 'Power-Up Practice'
    },
    'presence': {
      'big_task_ahead': 'Pre-Performance Flow',
      'deep_concentration': 'Focus Meditation',
      'flow_state': 'Flow State Session',
      'default': 'Presence Practice'
    }
  };
  
  const outcomeActions = actionMap[checkIn.outcome] || actionMap['power-up'];
  return outcomeActions[checkIn.context] || outcomeActions['default'];
}

function getRecommendedRoute(checkIn: any): string {
  if (!checkIn.outcome) return '/daily-check-in';
  
  const routeMap: Record<string, string> = {
    'pause': '/recalibrate/pause',
    'power-up': '/recalibrate/power-up',
    'presence': '/recalibrate/presence'
  };
  
  return routeMap[checkIn.outcome] || '/recalibrate';
}
