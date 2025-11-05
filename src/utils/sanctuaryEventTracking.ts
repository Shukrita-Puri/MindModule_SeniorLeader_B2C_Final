// Sanctuary Event Tracking - Memory and Context System

import { supabase } from "@/integrations/supabase/client";

export interface SanctuaryEventData {
  userId?: string;
  eventType: 'session_start' | 'session_complete' | 'session_pause' | 'session_skip';
  contentId: string;
  contentType: 'soundbath' | 'guided-practice' | 'micro-practice';
  category: 'pause' | 'power-up' | 'presence';
  tags: string[];
  duration?: number;
  timestamp: string;
  contextData: {
    timeOfDay: string;
    dayOfWeek: string;
    checkInOutcome?: string;
    ouraReadiness?: number;
    calendarEvents?: any[];
    energyState?: string;
    recommendationReason?: string;
  };
  effectivenessRating?: number;
}

// Queue for offline events
let offlineQueue: SanctuaryEventData[] = [];

export async function trackSanctuaryEvent(event: SanctuaryEventData) {
  try {
    // Get user ID from supabase auth
    const { data: { user } } = await supabase.auth.getUser();
    
    const eventWithUser = {
      ...event,
      userId: user?.id,
      timestamp: event.timestamp || new Date().toISOString()
    };
    
    // Try to send to edge function
    const { data, error } = await supabase.functions.invoke('track-sanctuary-event', {
      body: eventWithUser
    });
    
    if (error) {
      console.error('Error tracking sanctuary event:', error);
      // Add to offline queue
      offlineQueue.push(eventWithUser);
      // Store in localStorage as backup
      const existing = JSON.parse(localStorage.getItem('sanctuaryEvents') || '[]');
      localStorage.setItem('sanctuaryEvents', JSON.stringify([...existing, eventWithUser]));
    } else {
      console.log('Sanctuary event tracked successfully:', data);
    }
    
    return { success: !error, data, error };
  } catch (err) {
    console.error('Exception tracking sanctuary event:', err);
    // Add to offline queue
    offlineQueue.push(event);
    return { success: false, error: err };
  }
}

export async function uploadOfflineEvents() {
  if (offlineQueue.length === 0) return;
  
  console.log(`Uploading ${offlineQueue.length} offline events...`);
  
  const events = [...offlineQueue];
  offlineQueue = [];
  
  for (const event of events) {
    await trackSanctuaryEvent(event);
  }
}

export function getEnrichedContextData(): {
  timeOfDay: string;
  dayOfWeek: string;
  checkInOutcome?: string;
  ouraReadiness?: number;
  calendarEvents?: any[];
  energyState?: string;
} {
  const now = new Date();
  const hour = now.getHours();
  
  // Time of day
  let timeOfDay = 'afternoon';
  if (hour >= 5 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
  else timeOfDay = 'night';
  
  // Day of week
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = daysOfWeek[now.getDay()];
  
  // Get check-in data
  const checkInData = JSON.parse(localStorage.getItem('dailyCheckIn') || '{}');
  const checkInOutcome = checkInData.outcome;
  
  // Get Oura data (if connected)
  const ouraData = JSON.parse(localStorage.getItem('ouraData') || '{}');
  const ouraReadiness = ouraData.readiness;
  
  // Get calendar events
  const calendarEvents = JSON.parse(localStorage.getItem('calendarEvents') || '[]');
  
  // Get energy state from check-in
  const energyState = checkInData.displayOutcome || checkInOutcome;
  
  return {
    timeOfDay,
    dayOfWeek,
    checkInOutcome,
    ouraReadiness,
    calendarEvents: calendarEvents.slice(0, 3), // Next 3 events
    energyState
  };
}

// Helper to create session event
export function createSessionEvent(
  eventType: SanctuaryEventData['eventType'],
  contentId: string,
  contentType: SanctuaryEventData['contentType'],
  category: SanctuaryEventData['category'],
  tags: string[],
  duration?: number,
  effectivenessRating?: number
): SanctuaryEventData {
  return {
    eventType,
    contentId,
    contentType,
    category,
    tags,
    duration,
    timestamp: new Date().toISOString(),
    contextData: getEnrichedContextData(),
    effectivenessRating
  };
}
