/**
 * Moment Detection Engine v2
 * Student-focused (13-18 years) moment detection for private school context
 * Detects max 2 best moments per day based on calendar, energy state, and time
 */

import { CurrentEnergyState } from './energyStateEngine';
import type { CalendarEvent } from './historicalPatternEngine';

// Student-specific event types
export type StudentEventType = 
  | 'exam'
  | 'presentation'
  | 'interview'
  | 'performance'      // Drama, music, sports performance
  | 'sports-match'
  | 'competition'      // Debate, model UN, academic competition
  | 'leadership'       // Head boy/girl, prefect duties
  | 'networking'       // Alumni events, university fairs
  | 'social-event'     // School socials, formal dinners
  | 'tutoring'         // Tutoring session or study group
  | 'class'            // Regular class
  | 'meeting'          // Club meetings, student council
  | 'unknown';

// Moment types that can be detected
export type MomentType = 
  | 'pre-performance'       // High-stakes event TODAY (within hours)
  | 'advance-preparation'   // High-stakes event in 2-7 days
  | 'pre-social'            // Social event soon
  | 'energy-protection'     // Low energy + heavy schedule
  | 'schedule-overload'     // Too many back-to-back classes/events
  | 'between-events'        // Gap between events for reset
  | 'end-of-day'            // Evening wind-down
  | 'morning-prep';         // Start of day preparation

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface MomentSignal {
  source: 'calendar' | 'check-in' | 'circadian' | 'ritual-status';
  signal_type: string;
  description: string;
}

export interface MomentCandidate {
  id: string;
  moment_type: MomentType;
  priority_score: number;        // 0-100
  confidence: ConfidenceLevel;
  signals: MomentSignal[];
  label: string;                 // UI label like "In 45 min", "In 3 days"
  trigger_event?: CalendarEvent;
  event_context?: {
    event_type: StudentEventType;
    event_title: string;
    attendees_count: number;
    is_organizer: boolean;
    minutes_until: number;
    days_until?: number;         // For advance preparation
  };
  time_window: {
    start: Date;
    end: Date;
  };
  pack_template: string;
  mastery_focus: 'self' | 'social' | 'both';  // Self Mastery vs Social Mastery
  includes_roleplay?: boolean;   // Flag for role-play inclusion
}

// High-stakes event keywords for students
const HIGH_STAKES_KEYWORDS: Record<StudentEventType, string[]> = {
  'exam': ['exam', 'test', 'assessment', 'quiz', 'gcse', 'a-level', 'ib', 'sat', 'act', 'ap '],
  'presentation': ['presentation', 'present', 'speech', 'talk', 'assembly', 'chapel talk'],
  'interview': ['interview', 'oxbridge', 'cambridge', 'oxford', 'university', 'admissions', 'scholarship'],
  'performance': ['performance', 'concert', 'recital', 'play', 'drama', 'show', 'musical'],
  'sports-match': ['match', 'game', 'tournament', 'fixture', 'competition', 'race', 'finals'],
  'competition': ['debate', 'model un', 'mun', 'competition', 'olympiad', 'contest'],
  'leadership': ['prefect', 'head boy', 'head girl', 'captain', 'president', 'council'],
  'networking': ['alumni', 'networking', 'fair', 'careers', 'university visit', 'open day'],
  'social-event': ['formal', 'dinner', 'ball', 'prom', 'social', 'house event', 'party'],
  'tutoring': ['tutoring', 'study group', 'revision', 'prep'],
  'class': ['class', 'lesson', 'lecture', 'seminar'],
  'meeting': ['meeting', 'club', 'society', 'committee'],
  'unknown': []
};

// Classify event type from title
export function classifyEventType(title: string): StudentEventType {
  const lowerTitle = title.toLowerCase();
  
  for (const [eventType, keywords] of Object.entries(HIGH_STAKES_KEYWORDS)) {
    if (keywords.some(keyword => lowerTitle.includes(keyword))) {
      return eventType as StudentEventType;
    }
  }
  
  return 'unknown';
}

// Check if event is high-stakes (requires Self Mastery or Social Mastery preparation)
export function isHighStakesEvent(eventType: StudentEventType): boolean {
  const highStakesTypes: StudentEventType[] = [
    'exam', 'presentation', 'interview', 'performance', 
    'sports-match', 'competition', 'leadership'
  ];
  return highStakesTypes.includes(eventType);
}

// Check if event supports role-play practice
export function supportsRoleplay(eventType: StudentEventType): boolean {
  const roleplayTypes: StudentEventType[] = [
    'interview', 'presentation', 'networking', 'leadership', 
    'competition', 'exam', 'sports-match', 'performance'
  ];
  return roleplayTypes.includes(eventType);
}

// Format days into readable label
function formatDaysLabel(daysUntil: number): string {
  if (daysUntil === 1) return 'Tomorrow';
  if (daysUntil <= 7) return `In ${daysUntil} days`;
  return `In ${Math.floor(daysUntil / 7)} weeks`;
}

// Check if event is social/networking (requires Social Mastery preparation)
function isSocialEvent(eventType: StudentEventType): boolean {
  const socialTypes: StudentEventType[] = ['networking', 'social-event', 'leadership'];
  return socialTypes.includes(eventType);
}

// Get time of day context
function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// Get energy tier from check-in or balance score
function getEnergyTier(balance: number): 'depleted' | 'managing' | 'strong' | 'peak' {
  if (balance < 35) return 'depleted';
  if (balance < 55) return 'managing';
  if (balance < 75) return 'strong';
  return 'peak';
}

// Format minutes into readable label
function formatTimeLabel(minutesUntil: number): string {
  if (minutesUntil <= 0) return 'Now';
  if (minutesUntil < 60) return `In ${minutesUntil} min`;
  const hours = Math.floor(minutesUntil / 60);
  const mins = minutesUntil % 60;
  if (mins === 0) return `In ${hours}h`;
  return `In ${hours}h ${mins}m`;
}

// Detect gaps between events
function detectEventGaps(events: CalendarEvent[]): { gap: number; after: CalendarEvent; before: CalendarEvent }[] {
  const gaps: { gap: number; after: CalendarEvent; before: CalendarEvent }[] = [];
  
  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];
    
    const gapMs = new Date(next.startTime).getTime() - new Date(current.endTime).getTime();
    const gapMinutes = Math.floor(gapMs / (1000 * 60));
    
    if (gapMinutes >= 20 && gapMinutes <= 90) {
      gaps.push({
        gap: gapMinutes,
        after: current,
        before: next
      });
    }
  }
  
  return gaps;
}

// Count back-to-back events (less than 15 min gap)
function countBackToBack(events: CalendarEvent[]): number {
  let maxConsecutive = 0;
  let currentConsecutive = 1;
  
  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];
    
    const gapMs = new Date(next.startTime).getTime() - new Date(current.endTime).getTime();
    const gapMinutes = Math.floor(gapMs / (1000 * 60));
    
    if (gapMinutes < 15) {
      currentConsecutive++;
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
    } else {
      currentConsecutive = 1;
    }
  }
  
  return maxConsecutive;
}

/**
 * Main moment detection function
 * Returns max 2 best moments, scanning up to 7 days ahead for advance preparation
 */
export function detectMoments(
  calendarEvents: CalendarEvent[],
  energyState: CurrentEnergyState,
  ritualCompleted: boolean = false,
  completedPracticeIds: string[] = []
): MomentCandidate[] {
  const now = new Date();
  const candidates: MomentCandidate[] = [];
  const timeOfDay = getTimeOfDay();
  const energyTier = getEnergyTier(energyState.overallBalance);
  
  // Filter to today's future events only
  const todayEvents = calendarEvents.filter(event => {
    const eventStart = new Date(event.startTime);
    return eventStart > now && eventStart.toDateString() === now.toDateString();
  });

  // Filter to upcoming 7 days (excluding today)
  const upcomingEvents = calendarEvents.filter(event => {
    const eventStart = new Date(event.startTime);
    const daysUntil = Math.floor((eventStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntil >= 1 && daysUntil <= 7;
  });

  // 0. ADVANCE PREPARATION (High-Stakes in 2-7 Days) - Priority 80
  // Encourage practice days before the event
  for (const event of upcomingEvents) {
    const eventStart = new Date(event.startTime);
    const daysUntil = Math.floor((eventStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const eventType = classifyEventType(event.title);
    
    if (isHighStakesEvent(eventType) && daysUntil >= 2 && daysUntil <= 5) {
      const hasRoleplay = supportsRoleplay(eventType);
      
      candidates.push({
        id: `advance-prep-${event.id}`,
        moment_type: 'advance-preparation',
        priority_score: 80 + (5 - daysUntil) * 2, // Closer events get higher priority
        confidence: 'medium',
        signals: [
          { source: 'calendar', signal_type: 'upcoming-high-stakes', description: `${event.title} in ${daysUntil} days` }
        ],
        label: formatDaysLabel(daysUntil),
        trigger_event: event,
        event_context: {
          event_type: eventType,
          event_title: event.title,
          attendees_count: 0,
          is_organizer: false,
          minutes_until: daysUntil * 24 * 60,
          days_until: daysUntil
        },
        time_window: { start: now, end: eventStart },
        pack_template: getAdvancePackTemplate(eventType),
        mastery_focus: isSocialEvent(eventType) ? 'social' : 'self',
        includes_roleplay: hasRoleplay
      });
    }
  }

  // 1. PRE-PERFORMANCE (High-Stakes Academic/Performance Soon) - Priority 95
  for (const event of todayEvents) {
    const eventStart = new Date(event.startTime);
    const minutesUntil = Math.floor((eventStart.getTime() - now.getTime()) / (1000 * 60));
    
    if (minutesUntil <= 90 && minutesUntil > 0) {
      const eventType = classifyEventType(event.title);
      
      if (isHighStakesEvent(eventType)) {
        const hasRoleplay = supportsRoleplay(eventType) && minutesUntil >= 15;
        
        candidates.push({
          id: `pre-performance-${event.id}`,
          moment_type: 'pre-performance',
          priority_score: 95,
          confidence: 'high',
          signals: [
            { source: 'calendar', signal_type: 'high-stakes-event', description: `${event.title} in ${minutesUntil}m` }
          ],
          label: formatTimeLabel(minutesUntil),
          trigger_event: event,
          event_context: {
            event_type: eventType,
            event_title: event.title,
            attendees_count: 0,
            is_organizer: false,
            minutes_until: minutesUntil
          },
          time_window: { start: now, end: eventStart },
          pack_template: getPackTemplateForEvent(eventType, 'self'),
          mastery_focus: 'self',
          includes_roleplay: hasRoleplay
        });
      }
    }
  }

  // 2. PRE-SOCIAL (Alumni Networking, Social Events) - Priority 88
  for (const event of todayEvents) {
    const eventStart = new Date(event.startTime);
    const minutesUntil = Math.floor((eventStart.getTime() - now.getTime()) / (1000 * 60));
    
    if (minutesUntil <= 90 && minutesUntil > 0) {
      const eventType = classifyEventType(event.title);
      
      if (isSocialEvent(eventType)) {
        candidates.push({
          id: `pre-social-${event.id}`,
          moment_type: 'pre-social',
          priority_score: 88,
          confidence: 'high',
          signals: [
            { source: 'calendar', signal_type: 'social-event', description: `${event.title} in ${minutesUntil}m` }
          ],
          label: formatTimeLabel(minutesUntil),
          trigger_event: event,
          event_context: {
            event_type: eventType,
            event_title: event.title,
            attendees_count: 0,
            is_organizer: false,
            minutes_until: minutesUntil
          },
          time_window: { start: now, end: eventStart },
          pack_template: 'pre-social-pack',
          mastery_focus: 'social'
        });
      }
    }
  }

  // 3. ENERGY PROTECTION (Low Energy + Heavy Schedule) - Priority 90
  // Skip if ritual not completed (Daily Ritual handles energy management)
  if (energyTier === 'depleted' && todayEvents.length >= 3 && ritualCompleted) {
    const firstEvent = todayEvents[0];
    const eventStart = new Date(firstEvent.startTime);
    
    candidates.push({
      id: 'energy-protection',
      moment_type: 'energy-protection',
      priority_score: 70, // Reduced priority since ritual handles baseline
      confidence: 'medium',
      signals: [
        { source: 'check-in', signal_type: 'low-energy', description: 'Energy depleted' },
        { source: 'calendar', signal_type: 'busy-day', description: `${todayEvents.length} events ahead` }
      ],
      label: 'Before first class',
      trigger_event: firstEvent,
      time_window: { start: now, end: eventStart },
      pack_template: 'energy-protection-pack',
      mastery_focus: 'self'
    });
  }

  // 4. SCHEDULE OVERLOAD (Back-to-back classes/events) - Priority 85
  // Only show if ritual completed (Daily Ritual handles baseline energy)
  const backToBackCount = countBackToBack(todayEvents);
  if ((backToBackCount >= 3 || todayEvents.length >= 5) && ritualCompleted) {
    candidates.push({
      id: 'schedule-overload',
      moment_type: 'schedule-overload',
      priority_score: 65, // Reduced priority
      confidence: 'medium',
      signals: [
        { source: 'calendar', signal_type: 'overload', description: `${todayEvents.length} events today` }
      ],
      label: timeOfDay === 'morning' ? 'Morning reset' : 'Mid-day reset',
      time_window: { start: now, end: new Date(now.getTime() + 60 * 60 * 1000) },
      pack_template: 'overload-recovery-pack',
      mastery_focus: 'self'
    });
  }

  // 5. BETWEEN EVENTS (Gap Detected) - Priority 70
  const gaps = detectEventGaps(todayEvents);
  for (const gap of gaps.slice(0, 1)) { // Only first gap
    const gapStart = new Date(gap.after.endTime);
    const minutesUntilGap = Math.floor((gapStart.getTime() - now.getTime()) / (1000 * 60));
    
    if (minutesUntilGap >= 0 && minutesUntilGap <= 120) {
      candidates.push({
        id: `between-events-${gap.after.id}`,
        moment_type: 'between-events',
        priority_score: 70,
        confidence: 'medium',
        signals: [
          { source: 'calendar', signal_type: 'gap', description: `${gap.gap}min gap until ${gap.before.title}` }
        ],
        label: 'Between classes',
        trigger_event: gap.before,
        time_window: { 
          start: gapStart, 
          end: new Date(gap.before.startTime) 
        },
        pack_template: 'gap-reset-pack',
        mastery_focus: 'self'
      });
    }
  }

  // 6. END-OF-DAY (Evening + No More Events) - Priority 60
  if (timeOfDay === 'evening' && todayEvents.length === 0) {
    candidates.push({
      id: 'end-of-day',
      moment_type: 'end-of-day',
      priority_score: 60,
      confidence: 'medium',
      signals: [
        { source: 'circadian', signal_type: 'evening', description: 'Evening wind-down' }
      ],
      label: 'Evening wind-down',
      time_window: { 
        start: now, 
        end: new Date(now.getTime() + 2 * 60 * 60 * 1000) 
      },
      pack_template: 'downshift-pack',
      mastery_focus: 'self'
    });
  }

  // 7. MORNING PREP (Start of Day) - Priority 55
  if (timeOfDay === 'morning' && todayEvents.length > 0 && !ritualCompleted) {
    candidates.push({
      id: 'morning-prep',
      moment_type: 'morning-prep',
      priority_score: 55,
      confidence: 'low',
      signals: [
        { source: 'circadian', signal_type: 'morning', description: 'Morning preparation' },
        { source: 'ritual-status', signal_type: 'incomplete', description: 'Daily ritual not completed' }
      ],
      label: 'Morning prep',
      time_window: { 
        start: now, 
        end: new Date(todayEvents[0].startTime) 
      },
      pack_template: 'morning-activation-pack',
      mastery_focus: 'self'
    });
  }

  // If ritual is completed and energy is strong, reduce priorities
  if (ritualCompleted && energyTier === 'strong') {
    candidates.forEach(c => {
      if (c.moment_type !== 'pre-performance' && c.moment_type !== 'pre-social') {
        c.priority_score = Math.max(30, c.priority_score - 30);
      }
    });
  }

  // Sort by priority and return max 2
  candidates.sort((a, b) => b.priority_score - a.priority_score);
  
  return candidates.slice(0, 2);
}

// Get appropriate pack template based on event type (same-day events)
function getPackTemplateForEvent(eventType: StudentEventType, mastery: 'self' | 'social'): string {
  if (mastery === 'social') {
    return 'pre-social-pack';
  }
  
  switch (eventType) {
    case 'exam':
      return 'pre-exam-pack';
    case 'interview':
      return 'pre-interview-pack';
    case 'presentation':
    case 'performance':
      return 'pre-presentation-pack';
    case 'sports-match':
    case 'competition':
      return 'pre-competition-pack';
    case 'leadership':
      return 'pre-leadership-pack';
    default:
      return 'pre-performance-pack';
  }
}

// Get advance preparation pack template (2-7 days before)
function getAdvancePackTemplate(eventType: StudentEventType): string {
  switch (eventType) {
    case 'exam':
      return 'advance-exam-pack';
    case 'interview':
      return 'advance-interview-pack';
    case 'presentation':
    case 'performance':
      return 'advance-presentation-pack';
    case 'sports-match':
    case 'competition':
      return 'advance-competition-pack';
    case 'networking':
    case 'social-event':
      return 'advance-social-pack';
    case 'leadership':
      return 'advance-leadership-pack';
    default:
      return 'advance-performance-pack';
  }
}

// Format event context for display
export function formatEventContext(moment: MomentCandidate): string {
  if (!moment.event_context) return '';
  
  const { event_type, event_title, minutes_until } = moment.event_context;
  
  const typeLabels: Record<StudentEventType, string> = {
    'exam': 'Exam',
    'presentation': 'Presentation',
    'interview': 'Interview',
    'performance': 'Performance',
    'sports-match': 'Match',
    'competition': 'Competition',
    'leadership': 'Leadership',
    'networking': 'Networking',
    'social-event': 'Social Event',
    'tutoring': 'Tutoring',
    'class': 'Class',
    'meeting': 'Meeting',
    'unknown': 'Event'
  };
  
  return `${typeLabels[event_type]}: ${event_title}`;
}
