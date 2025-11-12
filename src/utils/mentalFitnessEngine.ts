interface MentalFitnessData {
  score: number; // 0-100 scale
  trend: 'up' | 'down' | 'stable';
  changeFromBaseline: number;
  currentStreak: number;
  ritualsThisWeek: { completed: number; total: number };
  isInBaselinePeriod: boolean;
  daysInBaseline: number;
}

interface DailyRitualRecord {
  date: string;
  completionStatus: 'full' | 'partial' | 'skipped';
  componentsCompleted: number;
}

interface CheckInRecord {
  timestamp: string;
  outcome?: string;
  skipped?: boolean;
}

export function calculateMentalFitnessScore(): MentalFitnessData {
  // Get data from localStorage
  const dailyRitualHistory = JSON.parse(localStorage.getItem('dailyRitualHistory') || '[]') as DailyRitualRecord[];
  const practiceHistory = JSON.parse(localStorage.getItem('practiceHistory') || '[]');
  const recalibrateHistory = JSON.parse(localStorage.getItem('recalibrateHistory') || '[]');
  const baseline = JSON.parse(localStorage.getItem('mentalFitnessBaseline') || 'null');
  
  // Calculate days since first activity
  const allDates = [
    ...dailyRitualHistory.map(r => r.date),
    ...practiceHistory.map((p: any) => p.timestamp),
    ...recalibrateHistory.map((r: any) => r.timestamp)
  ].filter(Boolean);
  
  if (allDates.length === 0) {
    return {
      score: 0,
      trend: 'stable',
      changeFromBaseline: 0,
      currentStreak: 0,
      ritualsThisWeek: { completed: 0, total: 7 },
      isInBaselinePeriod: true,
      daysInBaseline: 0
    };
  }

  const firstActivityDate = new Date(Math.min(...allDates.map(d => new Date(d).getTime())));
  const today = new Date();
  const totalDaysSinceBaseline = Math.max(1, Math.floor((today.getTime() - firstActivityDate.getTime()) / (1000 * 60 * 60 * 24)));
  
  // Check if in baseline period (first 7 days)
  const isInBaselinePeriod = totalDaysSinceBaseline < 7;
  
  // Calculate each component
  const ritualCompletionScore = calculateRitualCompletion(dailyRitualHistory, totalDaysSinceBaseline) * 40;
  const checkInScore = calculateCheckInConsistency(totalDaysSinceBaseline) * 30;
  const engagementScore = calculateContentEngagement(practiceHistory, recalibrateHistory, totalDaysSinceBaseline) * 20;
  const streakScore = calculateStreakBonus() * 10;
  
  const currentScore = Math.min(100, Math.round(ritualCompletionScore + checkInScore + engagementScore + streakScore));
  
  // Calculate baseline and trend if past baseline period
  let changeFromBaseline = 0;
  let trend: 'up' | 'down' | 'stable' = 'stable';
  
  if (!isInBaselinePeriod && !baseline) {
    // Create baseline from first 7 days
    const baselineScore = calculateHistoricalScore(7);
    localStorage.setItem('mentalFitnessBaseline', JSON.stringify({ score: baselineScore, date: new Date().toISOString() }));
    changeFromBaseline = currentScore - baselineScore;
  } else if (!isInBaselinePeriod && baseline) {
    changeFromBaseline = currentScore - baseline.score;
    trend = changeFromBaseline > 3 ? 'up' : changeFromBaseline < -3 ? 'down' : 'stable';
  }
  
  // Calculate this week's ritual completion
  const ritualsThisWeek = calculateWeeklyRituals(dailyRitualHistory);
  
  // Calculate current streak
  const currentStreak = calculateCurrentStreak(dailyRitualHistory);
  
  return {
    score: currentScore,
    trend,
    changeFromBaseline: Math.round(changeFromBaseline),
    currentStreak,
    ritualsThisWeek,
    isInBaselinePeriod,
    daysInBaseline: isInBaselinePeriod ? totalDaysSinceBaseline : 7
  };
}

function calculateRitualCompletion(history: DailyRitualRecord[], totalDays: number): number {
  const completedRituals = history.filter(r => r.completionStatus === 'full').length;
  return Math.min(1, completedRituals / totalDays);
}

function calculateCheckInConsistency(totalDays: number): number {
  const checkIns = getAllCheckIns();
  const uniqueDays = new Set(checkIns.map(c => c.timestamp.split('T')[0])).size;
  return Math.min(1, uniqueDays / totalDays);
}

function calculateContentEngagement(practiceHistory: any[], recalibrateHistory: any[], totalDays: number): number {
  const totalSessions = practiceHistory.length + recalibrateHistory.length;
  const idealSessions = totalDays * 3; // 1 daily ritual (3 components) + extras
  return Math.min(1, totalSessions / idealSessions);
}

function calculateStreakBonus(): number {
  const dailyRitualHistory = JSON.parse(localStorage.getItem('dailyRitualHistory') || '[]') as DailyRitualRecord[];
  const streak = calculateCurrentStreak(dailyRitualHistory);
  return Math.min(1, streak / 30); // Max bonus at 30-day streak
}

function calculateCurrentStreak(history: DailyRitualRecord[]): number {
  if (history.length === 0) return 0;
  
  const sortedHistory = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (let i = 0; i < sortedHistory.length; i++) {
    const recordDate = new Date(sortedHistory[i].date);
    recordDate.setHours(0, 0, 0, 0);
    
    const expectedDate = new Date(today);
    expectedDate.setDate(expectedDate.getDate() - i);
    
    if (recordDate.getTime() === expectedDate.getTime() && sortedHistory[i].componentsCompleted > 0) {
      streak++;
    } else {
      break;
    }
  }
  
  return streak;
}

function calculateWeeklyRituals(history: DailyRitualRecord[]): { completed: number; total: number } {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  const thisWeek = history.filter(r => {
    const date = new Date(r.date);
    return date >= weekAgo && date <= today;
  });
  
  const completed = thisWeek.filter(r => r.completionStatus === 'full').length;
  
  return { completed, total: 7 };
}

function calculateHistoricalScore(days: number): number {
  // Simplified version for baseline calculation
  const dailyRitualHistory = JSON.parse(localStorage.getItem('dailyRitualHistory') || '[]') as DailyRitualRecord[];
  const practiceHistory = JSON.parse(localStorage.getItem('practiceHistory') || '[]');
  const recalibrateHistory = JSON.parse(localStorage.getItem('recalibrateHistory') || '[]');
  
  const ritualScore = calculateRitualCompletion(dailyRitualHistory, days) * 40;
  const checkInScore = calculateCheckInConsistency(days) * 30;
  const engagementScore = calculateContentEngagement(practiceHistory, recalibrateHistory, days) * 20;
  
  return Math.min(100, Math.round(ritualScore + checkInScore + engagementScore));
}

function getAllCheckIns(): CheckInRecord[] {
  const checkIns: CheckInRecord[] = [];
  
  // Get daily check-ins
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('dailyCheckIn-')) {
      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        if (data.timestamp) {
          checkIns.push(data);
        }
      } catch (e) {
        // Skip invalid entries
      }
    }
  });
  
  // Also check for latest dailyCheckIn
  try {
    const latest = JSON.parse(localStorage.getItem('dailyCheckIn') || '{}');
    if (latest.timestamp) {
      checkIns.push(latest);
    }
  } catch (e) {
    // Skip invalid entry
  }
  
  return checkIns;
}
