interface Engagement {
  type: 'check_in' | 'daily_ritual_soundscape' | 'daily_ritual_practice' | 'daily_ritual_micro' | 'flow_session' | 'pause_session' | 'renew_session' | 'micro_intervention';
  timestamp: string;
}

interface PeakWindow {
  startHour: number;
  endHour: number;
  type: 'morning' | 'afternoon' | 'evening';
  label: string;
  percentage: number;
  sessionCount: number;
}

interface HourBucket {
  hour: number;
  count: number;
  density: number;
  smoothed: number;
}

export function trackEngagement(type: Engagement['type'], timestamp?: string): void {
  const engagements = JSON.parse(localStorage.getItem('allEngagements') || '[]') as Engagement[];
  
  engagements.push({
    type,
    timestamp: timestamp || new Date().toISOString()
  });
  
  localStorage.setItem('allEngagements', JSON.stringify(engagements));
}

export function getEngagementsByHour(): HourBucket[] {
  const engagements = JSON.parse(localStorage.getItem('allEngagements') || '[]') as Engagement[];
  
  if (engagements.length === 0) {
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: 0,
      density: 0,
      smoothed: 0
    }));
  }
  
  // Step 1: Create 24-hour buckets
  const hourBuckets = Array(24).fill(0);
  
  engagements.forEach(engagement => {
    const hour = new Date(engagement.timestamp).getHours();
    hourBuckets[hour] += 1;
  });
  
  // Step 2: Calculate density
  const totalEngagements = engagements.length;
  const densityPerHour = hourBuckets.map(count => (count / totalEngagements) * 100);
  
  // Step 3: Smooth the curve (3-point moving average)
  const smoothedCurve = densityPerHour.map((value, index) => {
    const prev = densityPerHour[index - 1] || densityPerHour[23];
    const next = densityPerHour[index + 1] || densityPerHour[0];
    return (prev + value + next) / 3;
  });
  
  // Step 4: Return structured data
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: hourBuckets[hour],
    density: densityPerHour[hour],
    smoothed: smoothedCurve[hour]
  }));
}

export function calculatePeakWindows(): PeakWindow[] {
  const hourBuckets = getEngagementsByHour();
  const engagements = JSON.parse(localStorage.getItem('allEngagements') || '[]') as Engagement[];
  
  if (engagements.length < 7) {
    return [];
  }
  
  // Calculate 75th percentile threshold
  const sortedDensities = [...hourBuckets.map(h => h.smoothed)].sort((a, b) => b - a);
  const threshold = sortedDensities[Math.floor(sortedDensities.length * 0.25)] || 0;
  
  // Identify peak hours
  const peakHours = hourBuckets.filter(h => h.smoothed >= threshold && h.count > 0);
  
  if (peakHours.length === 0) {
    return [];
  }
  
  // Group consecutive hours
  const windows: PeakWindow[] = [];
  let currentWindow: number[] = [];
  
  peakHours.forEach((hourData, index) => {
    if (currentWindow.length === 0) {
      currentWindow.push(hourData.hour);
    } else {
      const lastHour = currentWindow[currentWindow.length - 1];
      if (hourData.hour === lastHour + 1 || (lastHour === 23 && hourData.hour === 0)) {
        currentWindow.push(hourData.hour);
      } else {
        // Save current window and start new one
        if (currentWindow.length > 0) {
          windows.push(createPeakWindow(currentWindow, hourBuckets, engagements.length));
        }
        currentWindow = [hourData.hour];
      }
    }
    
    // Save last window
    if (index === peakHours.length - 1 && currentWindow.length > 0) {
      windows.push(createPeakWindow(currentWindow, hourBuckets, engagements.length));
    }
  });
  
  return windows.sort((a, b) => b.sessionCount - a.sessionCount).slice(0, 3); // Return top 3 windows
}

function createPeakWindow(hours: number[], hourBuckets: HourBucket[], totalEngagements: number): PeakWindow {
  const startHour = Math.min(...hours);
  const endHour = Math.max(...hours);
  const sessionCount = hours.reduce((sum, hour) => sum + hourBuckets[hour].count, 0);
  const percentage = Math.round((sessionCount / totalEngagements) * 100);
  
  // Determine type and label
  let type: 'morning' | 'afternoon' | 'evening';
  let label: string;
  
  if (startHour >= 6 && endHour <= 11) {
    type = 'morning';
    label = 'Morning Rituals';
  } else if (startHour >= 12 && endHour <= 17) {
    type = 'afternoon';
    label = 'Afternoon Focus';
  } else {
    type = 'evening';
    label = 'Evening Wind-down';
  }
  
  return { startHour, endHour, type, label, percentage, sessionCount };
}

export function getWeeklyRitualCompletion(): Array<{
  day: string;
  date: string;
  status: 'full' | 'partial' | 'skipped';
  componentsCompleted: number;
}> {
  const dailyRitualHistory = JSON.parse(localStorage.getItem('dailyRitualHistory') || '[]');
  
  // Get last 7 days
  const today = new Date();
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (6 - i));
    return date;
  });
  
  return last7Days.map(date => {
    const dateStr = date.toISOString().split('T')[0];
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    
    const record = dailyRitualHistory.find((r: any) => r.date === dateStr);
    
    return {
      day: dayName,
      date: dateStr,
      status: record?.completionStatus || 'skipped',
      componentsCompleted: record?.componentsCompleted || 0
    };
  });
}

export function calculateStreak(): { currentStreak: number; longestStreak: number } {
  const dailyRitualHistory = JSON.parse(localStorage.getItem('dailyRitualHistory') || '[]');
  
  if (dailyRitualHistory.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }
  
  const sortedHistory = [...dailyRitualHistory].sort((a: any, b: any) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  sortedHistory.forEach((record: any, index: number) => {
    const recordDate = new Date(record.date);
    recordDate.setHours(0, 0, 0, 0);
    
    const expectedDate = new Date(today);
    expectedDate.setDate(expectedDate.getDate() - index);
    
    if (recordDate.getTime() === expectedDate.getTime() && record.componentsCompleted > 0) {
      tempStreak++;
      if (index === 0) {
        currentStreak = tempStreak;
      }
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 0;
    }
  });
  
  longestStreak = Math.max(longestStreak, tempStreak);
  
  return { currentStreak, longestStreak };
}

export function generateEnergyInsight(windows: PeakWindow[]): string {
  if (windows.length === 0) {
    return "Complete more sessions to reveal your natural energy patterns.";
  }
  
  const primaryWindow = windows[0];
  
  if (primaryWindow.type === 'morning' && primaryWindow.percentage > 50) {
    return `Morning rituals are your superpower. You complete ${primaryWindow.percentage}% of practices between ${formatHour(primaryWindow.startHour)}-${formatHour(primaryWindow.endHour)}. Protect this time.`;
  }
  
  if (primaryWindow.type === 'afternoon') {
    return `Your mental engagement peaks at ${formatHour(primaryWindow.startHour)}—schedule deep work then. ${primaryWindow.sessionCount} sessions happen in this window.`;
  }
  
  if (primaryWindow.type === 'evening') {
    return `Evening practices help you wind down. ${primaryWindow.percentage}% of your sessions happen ${formatHour(primaryWindow.startHour)}-${formatHour(primaryWindow.endHour)}.`;
  }
  
  return `Your peak practice time is ${formatHour(primaryWindow.startHour)}-${formatHour(primaryWindow.endHour)}. Build your routine around this.`;
}

export function generateWeeklyInsight(weeklyData: ReturnType<typeof getWeeklyRitualCompletion>): string {
  const completionRates = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
    const dayData = weeklyData.filter(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('en-US', { weekday: 'long' }) === day;
    });
    
    const completed = dayData.filter(d => d.status === 'full').length;
    const total = Math.max(1, dayData.length);
    
    return { day, rate: (completed / total) * 100 };
  });
  
  const sorted = [...completionRates].sort((a, b) => a.rate - b.rate);
  const worstDay = sorted[0];
  const bestDay = sorted[sorted.length - 1];
  
  if (worstDay.rate < 50) {
    return `${worstDay.day} energy dips—try setting a morning alarm or lighter ritual.`;
  }
  
  if (bestDay.rate >= 80) {
    return `You thrive on ${bestDay.day}s (${Math.round(bestDay.rate)}% completion). Protect this consistency.`;
  }
  
  const thisWeekCompleted = weeklyData.filter(d => d.status === 'full').length;
  return `${thisWeekCompleted}/7 rituals completed this week. Keep building momentum.`;
}

function formatHour(hour: number): string {
  const period = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}${period}`;
}
