// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Window-Mode Domain Engine.
// Resolves the current window, execution mode, and quiet hours.
// Source: Part 2 Layer 2 (Section 5.4, WN-06, WN-07).

import {
  DEFAULT_QUIET_HOURS_LOCAL_HOUR,
  DEFAULT_QUIET_HOURS_LOCAL_MINUTE,
  QUIET_HOURS_LEAD_MINUTES,
} from "./constants.ts";
import type { WindowExecutionMode, WindowModeFacts, WindowName } from "./types.ts";

export interface WindowModeEngineInput {
  localHour: number; // 0–23
  localMinute?: number; // 0–59
  hasPendingJitRemaining?: boolean;
  wearableBedtime?: string | null; // e.g. "22:30"
}

export class WindowModeEngine {
  public evaluate(input: WindowModeEngineInput): WindowModeFacts {
    const minute = input.localMinute ?? 0;
    const currentTotalMinutes = input.localHour * 60 + minute;

    // 1. Determine Window
    let window: WindowName = "morning";
    if (input.localHour >= 18) {
      window = "evening";
    } else if (input.localHour >= 12) {
      window = "afternoon";
    } else {
      window = "morning";
    }

    // 2. Determine Execution Mode
    let mode: WindowExecutionMode = "set_up";
    if (window === "morning") {
      mode = "set_up";
    } else if (window === "afternoon") {
      mode = "execute_and_hold";
    } else {
      // Evening window
      if (input.hasPendingJitRemaining) {
        mode = "jit_remaining"; // WN-07
      } else {
        mode = "close"; // WN-06
      }
    }

    // 3. Determine Quiet Hours Start Time (WN-06)
    let quietTotalMinutes =
      DEFAULT_QUIET_HOURS_LOCAL_HOUR * 60 + DEFAULT_QUIET_HOURS_LOCAL_MINUTE;

    if (input.wearableBedtime) {
      const parts = input.wearableBedtime.split(":");
      if (parts.length === 2) {
        const bedHour = parseInt(parts[0], 10);
        const bedMin = parseInt(parts[1], 10);
        if (!isNaN(bedHour) && !isNaN(bedMin)) {
          quietTotalMinutes = bedHour * 60 + bedMin - QUIET_HOURS_LEAD_MINUTES;
        }
      }
    }

    const qHour = Math.floor(quietTotalMinutes / 60) % 24;
    const qMin = quietTotalMinutes % 60;
    const quietHoursStart = `${String(qHour).padStart(2, "0")}:${String(qMin).padStart(2, "0")}`;

    // Quiet hours active if current time is at or past quiet hours start
    const quietHoursActive = currentTotalMinutes >= quietTotalMinutes;

    return {
      window,
      mode,
      quietHoursStart,
      quietHoursActive,
      hasPendingJit: input.hasPendingJitRemaining ?? false,
    };
  }
}

export const windowModeEngine = new WindowModeEngine();

export function evaluateWindowMode(input: WindowModeEngineInput): WindowModeFacts {
  return windowModeEngine.evaluate(input);
}
