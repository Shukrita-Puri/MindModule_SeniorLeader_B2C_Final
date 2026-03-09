// Sanctuary Event Tracking - Memory and Context System

import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { getAuthToken } from '@/services/authTokenService';

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
  partOfRitual?: boolean;
  metadata?: Record<string, any>;
}

// Zod schema for input validation
const sanctuaryEventSchema = z.object({
  userId: z.string().uuid().optional(),
  eventType: z.enum(['session_start', 'session_complete', 'session_pause', 'session_skip']),
  contentId: z.string().min(1).max(100),
  contentType: z.enum(['soundbath', 'guided-practice', 'micro-practice']),
  category: z.enum(['pause', 'power-up', 'presence']),
  tags: z.array(z.string().max(50)).max(10),
  duration: z.number().positive().max(86400).optional(),
  timestamp: z.string().datetime(),
  contextData: z.object({
    timeOfDay: z.string(),
    dayOfWeek: z.string(),
    checkInOutcome: z.string().optional(),
    ouraReadiness: z.number().optional(),
    calendarEvents: z.array(z.any()).optional(),
    energyState: z.string().optional(),
    recommendationReason: z.string().optional(),
  }),
  effectivenessRating: z.number().min(1).max(5).optional(),
});

// Queue for offline events
let offlineQueue: SanctuaryEventData[] = [];

export async function trackSanctuaryEvent(event: SanctuaryEventData) {
  try {
    // Validate input before processing
    const validatedEvent = sanctuaryEventSchema.parse(event) as SanctuaryEventData;
    
    // DEV_MODE: Direct database insert
    if (DEV_MODE) {
      console.log('[sanctuaryEventTracking] DEV_MODE: Direct DB insert');
      
      const { data, error } = await supabase
        .from('sanctuary_events')
        .insert({
          user_id: DEV_USER.id,
          event_type: validatedEvent.eventType === 'session_complete' ? 'completed' : validatedEvent.eventType,
          content_id: validatedEvent.contentId,
          content_type: validatedEvent.contentType,
          category: validatedEvent.category,
          tags: validatedEvent.tags,
          duration_seconds: validatedEvent.duration,
          timestamp: validatedEvent.timestamp,
          context_data: validatedEvent.contextData,
          effectiveness_rating: validatedEvent.effectivenessRating,
        })
        .select()
        .single();
      
      if (error) {
        console.error('[sanctuaryEventTracking] DEV_MODE insert error:', error);
        return { success: false, error };
      }
      
      console.log('[sanctuaryEventTracking] DEV_MODE: Event tracked successfully');
      return { success: true, data };
    }
    
    // Get Auth0 token for edge function auth
    const accessToken = await getAuthToken();
    
    const eventWithUser: SanctuaryEventData = {
      ...validatedEvent,
      timestamp: validatedEvent.timestamp || new Date().toISOString()
    };
    
    // Send to edge function with Auth0 token
    const { data, error } = await supabase.functions.invoke('track-sanctuary-event', {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: eventWithUser
    });
    
    if (error) {
      if (import.meta.env.DEV) {
        console.error('Error tracking sanctuary event:', error);
      }
      // Add to in-memory offline queue (no localStorage backup — retry on reconnect)
      offlineQueue.push(eventWithUser);
    } else {
      if (import.meta.env.DEV) {
        console.log('Event tracked successfully');
      }
    }
    
    return { success: !error, data, error };
  } catch (err) {
    if (import.meta.env.DEV) {
      console.error('Exception tracking sanctuary event:', err);
    }
    // For validation errors, don't queue invalid data
    if (err instanceof z.ZodError) {
      return { success: false, error: new Error('Invalid event data') };
    }
    // Add to offline queue for network errors (no userId needed — EF handles auth)
    const eventWithUser: SanctuaryEventData = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString()
    };
    offlineQueue.push(eventWithUser);
    return { success: false, error: err };
  }
}

export async function uploadOfflineEvents() {
  if (offlineQueue.length === 0) return;
  
  if (import.meta.env.DEV) {
    console.log(`Uploading ${offlineQueue.length} offline events...`);
  }
  
  const events = [...offlineQueue];
  offlineQueue = [];
  
  for (const event of events) {
    await trackSanctuaryEvent(event);
  }
}

// checkInOutcome: pass already-fetched check-in outcome from server. Callers have this from energy state or React Query.
// calendarEvents: pass pre-fetched calendar events from DB. No more localStorage read.
export function getEnrichedContextData(checkInOutcome?: string, calendarEvents?: any[]): {
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
  
  // Get Oura data (ephemeral signal — acceptable in localStorage)
  const ouraData = JSON.parse(localStorage.getItem('ouraData') || '{}');
  const ouraReadiness = ouraData.readiness;
  
  // Calendar events: use provided param (from DB fetch) or empty array
  const resolvedCalendarEvents = calendarEvents || [];
  
  return {
    timeOfDay,
    dayOfWeek,
    checkInOutcome,
    ouraReadiness,
    calendarEvents: resolvedCalendarEvents.slice(0, 3), // Next 3 events
    energyState: checkInOutcome
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
