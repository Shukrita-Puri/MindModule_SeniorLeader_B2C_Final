/**
 * Local device storage for calendar and wearable data.
 * Uses localStorage as the storage backend (works on web + Capacitor).
 * This is an additional cache layer — cloud DB remains canonical.
 */

const CALENDAR_KEY = 'local_calendar_events';
const WEARABLE_KEY = 'local_wearable_data';

export interface LocalCalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  isHighStakes: boolean;
  eventType: string;
}

export interface LocalWearableEntry {
  hrv: number | null;
  restingHeartRate?: number | null;
  heartRate?: number | null;
  totalSleepMinutes?: number | null;
  deepSleepMinutes?: number | null;
  remSleepMinutes?: number | null;
  sleepScore?: number | null;
  syncedAt: string;
  summaryDate: string;
}

// ── Calendar ──

export function saveCalendarEventsLocally(events: LocalCalendarEvent[]): void {
  try {
    localStorage.setItem(CALENDAR_KEY, JSON.stringify({
      events,
      savedAt: new Date().toISOString(),
    }));
  } catch (err) {
    console.warn('[localDataStore] Failed to save calendar events locally:', err);
  }
}

export function getLocalCalendarEvents(): LocalCalendarEvent[] {
  try {
    const raw = localStorage.getItem(CALENDAR_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.events || [];
  } catch {
    return [];
  }
}

export function clearLocalCalendarData(): void {
  localStorage.removeItem(CALENDAR_KEY);
}

// ── Wearable ──

export function saveWearableDataLocally(entry: LocalWearableEntry): void {
  try {
    const existing = getLocalWearableData();
    // Keep last 30 entries, dedupe by summaryDate
    const filtered = existing.filter(e => e.summaryDate !== entry.summaryDate);
    filtered.push(entry);
    const trimmed = filtered.slice(-30);
    localStorage.setItem(WEARABLE_KEY, JSON.stringify({
      entries: trimmed,
      savedAt: new Date().toISOString(),
    }));
  } catch (err) {
    console.warn('[localDataStore] Failed to save wearable data locally:', err);
  }
}

export function getLocalWearableData(): LocalWearableEntry[] {
  try {
    const raw = localStorage.getItem(WEARABLE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.entries || [];
  } catch {
    return [];
  }
}

export function clearLocalWearableData(): void {
  localStorage.removeItem(WEARABLE_KEY);
}

// ── Combined ──

export function clearAllLocalData(): void {
  clearLocalCalendarData();
  clearLocalWearableData();
}

export function getLocalDataSummary(): { calendarCount: number; wearableCount: number } {
  return {
    calendarCount: getLocalCalendarEvents().length,
    wearableCount: getLocalWearableData().length,
  };
}
