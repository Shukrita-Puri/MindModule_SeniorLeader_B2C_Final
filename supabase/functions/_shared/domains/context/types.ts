// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Context Assembler Types.
// Source: Part 2 Layer 2 (Section 1.1, Section 5).

import type { DayProfile } from "../day-profile/types.ts";
import type { StateProfile } from "../state-profile/types.ts";
import type { WindowProfile } from "../window-profile/types.ts";
import type { ImportanceFacts } from "../importance/types.ts";
import type { WindowName } from "../window-mode/types.ts";

export interface ContextBundle {
  userId: string;
  localDate: string;
  windowName: WindowName;
  dayProfile: DayProfile;
  stateProfile: StateProfile;
  windowProfile: WindowProfile;
  importance: ImportanceFacts;
  assembledAt: string;
  isCached: boolean;
}

export interface RawDatabaseContextBundle {
  userId: string;
  localDate: string;
  windowName: WindowName;
  profile?: Record<string, unknown> | null;
  calendarEvents?: Array<Record<string, unknown>>;
  wearableReadings?: Record<string, unknown> | null;
  wearableBaselines?: Record<string, unknown> | null;
  checkIns?: Array<Record<string, unknown>>;
  storedMemory?: Record<string, unknown> | null;
  previousWindowSnapshot?: Record<string, unknown> | null;
  hasWearable?: boolean;
  hasCalendar?: boolean;
}
