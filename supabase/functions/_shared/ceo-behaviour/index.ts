/**
 * Barrel for the CEO behaviour cluster files.
 *
 * Add a new behaviour by:
 *   1. Implementing it in the appropriate cluster file.
 *   2. Re-exporting the function from this barrel.
 *   3. Adding it to ALL_RULES with the correct scope tags.
 *
 * Do NOT create new rule files per surface (brief/plan/nudge). Surface gating is
 * the scope-tag's job, not the file's.
 */

import type { ScopedRule } from "../brief-context.ts";

// --- Workweek cluster ---
import {
  vetoRisk,
  secondWind,
  circadianPriority,
  decisionLeakageGuard,
  personalFrictionInference,
  boardLevelOutcome,
  sundayReset,
  notificationIsProduct,
} from "./workweek.ts";

// --- Post-peak cluster ---
import { postPeakHangover } from "./post-peak.ts";

// --- Conference cluster ---
import { conferenceDepletion } from "./conference.ts";

// --- Batch 2/3 cluster placeholders (no exports yet; referenced for traceability) ---
import "./weekend.ts";
import "./pto-holiday.ts";
import "./travel.ts";
import "./high-stakes-prep.ts";
import "./back-to-back.ts";
import "./multi-calendar.ts";
import "./decision-density.ts";
import "./stubs.ts";

export {
  vetoRisk,
  secondWind,
  circadianPriority,
  decisionLeakageGuard,
  postPeakHangover,
  personalFrictionInference,
  boardLevelOutcome,
  sundayReset,
  notificationIsProduct,
  conferenceDepletion,
};

/**
 * All rules + the surfaces each is allowed to fire on. Order does NOT imply
 * priority — severity does. behaviour-evaluator sorts the output.
 */
export const ALL_RULES: ScopedRule[] = [
  { scopes: ["brief", "plan", "nudge"], fn: vetoRisk },
  { scopes: ["brief", "plan"],          fn: secondWind },
  { scopes: ["brief", "plan", "nudge"], fn: circadianPriority },
  { scopes: ["brief", "plan", "nudge"], fn: decisionLeakageGuard },
  { scopes: ["brief", "plan"],          fn: postPeakHangover },
  { scopes: ["brief"],                  fn: personalFrictionInference },
  { scopes: ["brief", "plan", "nudge"], fn: boardLevelOutcome },
  { scopes: ["brief", "plan", "nudge"], fn: sundayReset },
  { scopes: ["nudge"],                  fn: notificationIsProduct },
  { scopes: ["brief", "plan", "nudge"], fn: conferenceDepletion },
];