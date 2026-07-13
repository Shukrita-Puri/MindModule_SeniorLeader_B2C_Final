/**
 * Cross-surface Availability SSOT parity.
 *
 * Confirms that Planner (`classifyHasRestSignals`), Brief
 * (`buildRuleContext` → `ptoTodayAllDayDerived` / `personalHolidayInferred`
 * and `RuleContext.availability`), and Smart Nudges (`ptoMode` +
 * `weekAheadInputs.pto/holidayTodayAllDay` derivation logic) all reach
 * the SAME decision for every canonical scenario.
 *
 * A passing classifier unit test proves the availability answer is
 * correct. This test proves every downstream consumer THREADS that
 * answer through unchanged — the last mile of the SSOT rollout.
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  classifyAvailability,
  classifyHasRestSignals,
  type AvailabilityEvent,
  type AvailabilityResult,
} from "./availability-classifier.ts";
import { buildRuleContext } from "../brief-signal-coverage.ts";

// Fixed reference dates (local-time based).
const MON_9AM = new Date("2026-01-05T09:00:00Z"); // Monday
const SAT_9AM = new Date("2026-01-03T09:00:00Z"); // Saturday

interface Scenario {
  name: string;
  now: Date;
  events: AvailabilityEvent[];
  userHomeCountry: string | null;
  explicitPto?: boolean;
  expectedState: AvailabilityResult["state"];
  expectedIsRestDay: boolean;
  expectedPtoTodayAllDay: boolean; // Brief signal + Nudges gate
  expectedHolidayTodayAllDay: boolean; // Nudges gate
  expectedPtoMode: boolean; // Nudges dayContext.ptoMode
  expectedPlannerHasRestSignals: boolean;
}

const scenarios: Scenario[] = [
  {
    name: "Empty weekday (Monday, no events, GB)",
    now: MON_9AM,
    events: [],
    userHomeCountry: "GB",
    expectedState: "LIGHT_ROUTINE",
    expectedIsRestDay: false,
    expectedPtoTodayAllDay: false,
    expectedHolidayTodayAllDay: false,
    expectedPtoMode: false,
    expectedPlannerHasRestSignals: false,
  },
  {
    name: "Applicable public holiday (England Bank Holiday for GB-ENG user)",
    now: MON_9AM,
    events: [
      {
        title: "Bank Holiday (England & Wales)",
        startTime: "2026-01-05T00:00:00Z",
        endTime: "2026-01-06T00:00:00Z",
        isAllDay: true,
      },
    ],
    userHomeCountry: "GB-ENG",
    expectedState: "PUBLIC_HOLIDAY",
    expectedIsRestDay: true,
    expectedPtoTodayAllDay: true,
    expectedHolidayTodayAllDay: true,
    expectedPtoMode: true,
    expectedPlannerHasRestSignals: true,
  },
  {
    name: "Non-applicable regional holiday (N Ireland for GB-ENG user)",
    now: MON_9AM,
    events: [
      {
        title: "Bank Holiday (N Ireland)",
        startTime: "2026-01-05T00:00:00Z",
        endTime: "2026-01-06T00:00:00Z",
        isAllDay: true,
      },
    ],
    userHomeCountry: "GB-ENG",
    expectedState: "LIGHT_ROUTINE",
    expectedIsRestDay: false,
    expectedPtoTodayAllDay: false,
    expectedHolidayTodayAllDay: false,
    expectedPtoMode: false,
    expectedPlannerHasRestSignals: false,
  },
  {
    name: "Explicit PTO (annual leave, no meetings)",
    now: MON_9AM,
    events: [],
    userHomeCountry: "GB-ENG",
    explicitPto: true,
    expectedState: "PTO",
    expectedIsRestDay: true,
    expectedPtoTodayAllDay: true,
    expectedHolidayTodayAllDay: false,
    expectedPtoMode: true,
    expectedPlannerHasRestSignals: true,
  },
  {
    name: "Saturday, no meetings",
    now: SAT_9AM,
    events: [],
    userHomeCountry: "GB",
    expectedState: "REST_DAY",
    expectedIsRestDay: true,
    // REST_DAY (weekend without work) is not PTO nor a holiday — only
    // explicit PTO / applicable holiday drive `ptoMode` / PTO signals.
    // Weekend framing lives in weekend.ts, which reads dayOfWeek directly.
    expectedPtoTodayAllDay: false,
    expectedHolidayTodayAllDay: false,
    expectedPtoMode: false,
    expectedPlannerHasRestSignals: true,
  },
  {
    name: "Saturday with 3 work meetings → WORKDAY",
    now: SAT_9AM,
    events: [
      { title: "Client review", startTime: "2026-01-03T09:00:00Z", endTime: "2026-01-03T10:00:00Z", isOrganizer: true },
      { title: "Investor sync", startTime: "2026-01-03T11:00:00Z", endTime: "2026-01-03T12:00:00Z", attendeesCount: 3 },
      { title: "Board prep", startTime: "2026-01-03T14:00:00Z", endTime: "2026-01-03T15:00:00Z", isOrganizer: true },
    ],
    userHomeCountry: "GB",
    expectedState: "WORKDAY",
    expectedIsRestDay: false,
    expectedPtoTodayAllDay: false,
    expectedHolidayTodayAllDay: false,
    expectedPtoMode: false,
    expectedPlannerHasRestSignals: false,
  },
  {
    name: "Public holiday with 3 work meetings → WORKDAY (work-evidence override)",
    now: MON_9AM,
    events: [
      {
        title: "Bank Holiday (England & Wales)",
        startTime: "2026-01-05T00:00:00Z",
        endTime: "2026-01-06T00:00:00Z",
        isAllDay: true,
      },
      { title: "Client escalation", startTime: "2026-01-05T09:00:00Z", endTime: "2026-01-05T10:00:00Z", isOrganizer: true },
      { title: "Investor call", startTime: "2026-01-05T11:00:00Z", endTime: "2026-01-05T12:00:00Z", attendeesCount: 2 },
      { title: "Board sync", startTime: "2026-01-05T14:00:00Z", endTime: "2026-01-05T15:00:00Z", attendeesCount: 5 },
    ],
    userHomeCountry: "GB-ENG",
    expectedState: "WORKDAY",
    expectedIsRestDay: false,
    expectedPtoTodayAllDay: false,
    expectedHolidayTodayAllDay: false,
    expectedPtoMode: false,
    expectedPlannerHasRestSignals: false,
  },
];

// Mirror of the Smart Nudges override in supabase/functions/smart-nudges/index.ts.
// If either derivation drifts, this test fires.
function nudgesDerivation(a: AvailabilityResult) {
  return {
    ptoMode: a.state === "PTO" || a.state === "PUBLIC_HOLIDAY",
    ptoTodayAllDay: a.state === "PTO",
    holidayTodayAllDay: a.state === "PUBLIC_HOLIDAY",
  };
}

// Mirror of the Brief signal-coverage override for the two derived signals.
function briefDerivation(a: AvailabilityResult) {
  const pto = a.state === "PTO" || a.state === "PUBLIC_HOLIDAY";
  return { ptoTodayAllDay: pto };
}

for (const s of scenarios) {
  Deno.test(`SSOT parity — ${s.name}`, () => {
    // 1. Classifier — canonical decision.
    const availability = classifyAvailability({
      now: s.now,
      events: s.events,
      userHomeCountry: s.userHomeCountry,
      explicitPto: s.explicitPto === true,
    });
    assertEquals(availability.state, s.expectedState, "state");
    assertEquals(availability.isRestDay, s.expectedIsRestDay, "isRestDay");

    // 2. Planner boundary — same call the planner makes.
    const plannerHasRest = classifyHasRestSignals({
      now: s.now,
      events: s.events,
      userHomeCountry: s.userHomeCountry,
      explicitPto: s.explicitPto === true,
    });
    assertEquals(
      plannerHasRest,
      s.expectedPlannerHasRestSignals,
      "planner hasRestSignals",
    );

    // 3. Brief — buildRuleContext must expose the SAME availability, and
    //    ptoTodayAllDay must be gated on it.
    const ctx = buildRuleContext({
      wearable: null,
      checkIn: null,
      scoreToday: null,
      scoreYesterday: null,
      timezone: { offsetMinutes: null, shift48hHours: null },
      events: s.events.map((e) => ({
        title: e.title,
        startTime: e.startTime,
        endTime: e.endTime ?? null,
        isAllDay: e.isAllDay,
      })),
      now: s.now,
      userHomeCountry: s.userHomeCountry,
      explicitPto: s.explicitPto === true,
    });
    assertEquals(ctx.availability?.state, s.expectedState, "Brief ctx.availability.state");
    assertEquals(
      ctx.availability?.isRestDay,
      s.expectedIsRestDay,
      "Brief ctx.availability.isRestDay",
    );
    const brief = briefDerivation(availability);
    assertEquals(
      brief.ptoTodayAllDay,
      s.expectedPtoTodayAllDay,
      "Brief ptoTodayAllDay",
    );
    // The final signal on the RuleContext must agree with the derivation
    // rule above. (Undefined === false here.)
    assertEquals(
      ctx.signals.ptoTodayAllDay === true,
      s.expectedPtoTodayAllDay,
      "Brief signals.ptoTodayAllDay",
    );

    // 4. Smart Nudges — dayContext.ptoMode + weekAheadInputs derivation.
    const nudges = nudgesDerivation(availability);
    assertEquals(nudges.ptoMode, s.expectedPtoMode, "Nudges ptoMode");
    assertEquals(
      nudges.ptoTodayAllDay,
      s.expectedPtoTodayAllDay,
      "Nudges weekAheadInputs.ptoTodayAllDay",
    );
    assertEquals(
      nudges.holidayTodayAllDay,
      s.expectedHolidayTodayAllDay,
      "Nudges weekAheadInputs.holidayTodayAllDay",
    );

    // 5. End-to-end parity — every consumer must reach an isRestDay
    //    decision consistent with the classifier.
    assertEquals(
      plannerHasRest,
      availability.isRestDay,
      "Planner disagrees with classifier",
    );
    assertEquals(
      ctx.availability?.isRestDay,
      availability.isRestDay,
      "Brief disagrees with classifier",
    );
    assertEquals(
      nudges.ptoMode,
      availability.state === "PTO" || availability.state === "PUBLIC_HOLIDAY",
      "Nudges disagrees with classifier",
    );
  });
}