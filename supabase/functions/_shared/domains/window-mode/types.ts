// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Types for Layer 2 Window-Mode Domain.
// Source: Part 2 Layer 2 (Section 5.4).

export type WindowName = "morning" | "afternoon" | "evening";

export type WindowExecutionMode =
  | "set_up"
  | "execute_and_hold"
  | "close"
  | "jit_remaining";

export interface WindowModeFacts {
  window: WindowName;
  mode: WindowExecutionMode;
  quietHoursStart: string; // e.g. "22:00" or ISO time
  quietHoursActive: boolean;
  hasPendingJit: boolean;
}
