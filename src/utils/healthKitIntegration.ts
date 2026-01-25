/**
 * HealthKit Integration Utilities
 * Provides types and functions for Apple Watch / Apple Health data integration
 * 
 * Note: Actual HealthKit API calls require a native app or HealthKit web API.
 * This module provides the data structures and readiness score calculations
 * that would be used when HealthKit data is synced to the backend.
 */

export interface HealthKitWearableData {
  source: 'apple-watch';
  heartRateVariability?: number; // ms (SDNN)
  restingHeartRate?: number; // bpm
  sleepAnalysis?: {
    inBedMinutes: number;
    asleepMinutes: number;
    sleepEfficiency: number; // 0-100%
    deepSleepMinutes?: number;
    remSleepMinutes?: number;
  };
  activityRings?: {
    movePercent: number; // 0-100+
    exercisePercent: number; // 0-100+
    standPercent: number; // 0-100+
  };
  lastSynced: string; // ISO timestamp
}

/**
 * Calculate readiness score from Apple Watch / HealthKit data
 * Mirrors Oura's readiness concept but based on Apple Health metrics
 */
export function calculateAppleWatchReadiness(data: HealthKitWearableData): number {
  let score = 50; // Baseline neutral score
  
  // HRV contribution (higher = better parasympathetic recovery)
  // Elite athletes: 60-100ms, Average: 30-60ms, Stressed: <30ms
  if (data.heartRateVariability !== undefined) {
    if (data.heartRateVariability > 60) {
      score += 20; // Excellent recovery
    } else if (data.heartRateVariability > 45) {
      score += 10; // Good recovery
    } else if (data.heartRateVariability > 30) {
      score += 0; // Baseline
    } else {
      score -= 10; // Stress indicator
    }
  }
  
  // Resting heart rate contribution (lower = better fitness/recovery)
  // Elite: <50, Fit: 50-60, Average: 60-80
  if (data.restingHeartRate !== undefined) {
    if (data.restingHeartRate < 55) {
      score += 10;
    } else if (data.restingHeartRate < 65) {
      score += 5;
    } else if (data.restingHeartRate > 75) {
      score -= 5; // Elevated, possible stress/fatigue
    }
  }
  
  // Sleep contribution
  if (data.sleepAnalysis) {
    const efficiency = data.sleepAnalysis.sleepEfficiency;
    const duration = data.sleepAnalysis.asleepMinutes / 60; // hours
    
    // Efficiency score (target: >85%)
    if (efficiency >= 90) {
      score += 15;
    } else if (efficiency >= 80) {
      score += 10;
    } else if (efficiency >= 70) {
      score += 5;
    } else {
      score -= 5; // Poor sleep quality
    }
    
    // Duration score (target: 7-9 hours)
    if (duration >= 7 && duration <= 9) {
      score += 10;
    } else if (duration >= 6) {
      score += 5;
    } else if (duration < 5) {
      score -= 10; // Significant sleep debt
    }
    
    // Deep sleep bonus
    if (data.sleepAnalysis.deepSleepMinutes && data.sleepAnalysis.deepSleepMinutes > 60) {
      score += 5;
    }
  }
  
  // Activity rings contribution (balanced approach)
  // High activity can indicate either good fitness OR overtraining
  if (data.activityRings) {
    const avgRing = (
      data.activityRings.movePercent + 
      data.activityRings.exercisePercent + 
      data.activityRings.standPercent
    ) / 3;
    
    if (avgRing >= 80 && avgRing <= 120) {
      score += 5; // Healthy activity level
    } else if (avgRing > 150) {
      score -= 5; // Possible overtraining
    }
  }
  
  // Clamp to 0-100
  return Math.max(0, Math.min(100, score));
}

/**
 * Get the wearable function (readiness tier) from HealthKit data
 */
export function getHealthKitFunction(data: HealthKitWearableData): 'optimal' | 'good' | 'medium' | 'low' | 'recovery' {
  const readiness = calculateAppleWatchReadiness(data);
  
  if (readiness >= 85) return 'optimal';
  if (readiness >= 70) return 'good';
  if (readiness >= 50) return 'medium';
  if (readiness >= 30) return 'low';
  return 'recovery';
}

/**
 * Convert HealthKit data to the format expected by the energy state engine
 */
export function healthKitToWearableData(data: HealthKitWearableData): {
  readiness: number;
  hrv: number;
  source: string;
} {
  return {
    readiness: calculateAppleWatchReadiness(data),
    hrv: data.heartRateVariability || 0,
    source: 'apple-watch'
  };
}

/**
 * Check if HealthKit data is stale (more than 6 hours old)
 */
export function isHealthKitDataStale(data: HealthKitWearableData): boolean {
  if (!data.lastSynced) return true;
  
  const syncedAt = new Date(data.lastSynced);
  const now = new Date();
  const hoursDiff = (now.getTime() - syncedAt.getTime()) / (1000 * 60 * 60);
  
  return hoursDiff > 6;
}
