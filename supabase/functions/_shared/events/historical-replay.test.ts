// Stage D: Historical Replay Test (Step 15)
// Runs the replay engine over a full realistic historical event sample (covering rare and common events)
// Verifies metrics calculation, parity logging, and divergence reporting.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runHistoricalReplay, type ReplayEventInput } from "./historical-replay.ts";

const HISTORICAL_SAMPLE_EVENTS: ReplayEventInput[] = [
  // Governance (rare: quarterly/annual)
  { id: "hist_01", title: "Annual General Meeting (AGM) of Shareholders", start_time: "2025-05-15T10:00:00Z", durationMinutes: 180 },
  { id: "hist_02", title: "Q3 Supervisory Board Strategy Conclave", start_time: "2025-08-20T09:00:00Z", durationMinutes: 240 },
  { id: "hist_03", title: "Audit & Risk Oversight Committee", start_time: "2025-11-12T14:00:00Z", durationMinutes: 90 },

  // Deals & Pitches
  { id: "hist_04", title: "Series B Pitch: Sequoia Capital & General Catalyst", start_time: "2025-06-10T15:00:00Z", durationMinutes: 60 },
  { id: "hist_05", title: "Global Enterprise SaaS Renewal Terms Negotiation", start_time: "2025-09-02T16:00:00Z", durationMinutes: 45 },

  // Visibility & Stage (rare)
  { id: "hist_06", title: "Opening Keynote: Web Summit Lisbon", start_time: "2025-11-04T10:30:00Z", durationMinutes: 45 },
  { id: "hist_07", title: "Bloomberg TV Live Executive Interview", start_time: "2025-07-18T11:00:00Z", durationMinutes: 30 },
  { id: "hist_08", title: "Press Conference: Global Autonomous AI Platform Launch", start_time: "2025-10-15T14:00:00Z", durationMinutes: 60 },

  // People & Leadership
  { id: "hist_09", title: "David / Manoj Bi-weekly 1:1 Sync", start_time: "2025-04-10T11:00:00Z", durationMinutes: 30 },
  { id: "hist_10", title: "Engineering VP Annual Compensation & Performance Review", start_time: "2025-12-15T15:00:00Z", durationMinutes: 60 },

  // Strategy & Deep Work
  { id: "hist_11", title: "Solo Deep Work: Q1 Product Roadmap Architecture", start_time: "2025-03-25T08:00:00Z", durationMinutes: 120 },
  { id: "hist_12", title: "Advisory Board Working Group Session", start_time: "2025-05-20T16:00:00Z", durationMinutes: 90 },

  // External Conferences & Offsites
  { id: "hist_13", title: "SaaStr Annual 2025 Conference Day 1", start_time: "2025-09-10T09:00:00Z", durationMinutes: 480 },
  { id: "hist_14", title: "Executive Leadership Team Offsite Workshop", start_time: "2025-07-22T09:00:00Z", durationMinutes: 360 },

  // Travel (rare & logistical)
  { id: "hist_15", title: "Flight BA178: JFK to LHR", start_time: "2025-10-01T20:00:00Z", durationMinutes: 420 },
  { id: "hist_16", title: "Heathrow Express Transit to Airport", start_time: "2025-10-01T17:00:00Z", durationMinutes: 30 },
  { id: "hist_17", title: "The Savoy London Hotel Reservation & Check-in", start_time: "2025-10-02T14:00:00Z", durationMinutes: 30 },

  // Renewal & Health
  { id: "hist_18", title: "Comprehensive Executive Health & Biomarker Screening", start_time: "2025-06-05T08:30:00Z", durationMinutes: 120 },
  { id: "hist_19", title: "Family Weekend: Leo's Soccer Championship", start_time: "2025-06-07T10:00:00Z", durationMinutes: 180 },

  // Operations (Category I - newly isolated)
  { id: "hist_20", title: "Weekly Cross-Functional Operating Review", start_time: "2025-04-14T09:00:00Z", durationMinutes: 60 },
  { id: "hist_21", title: "Monthly Financial Close & P&L Signoff Review", start_time: "2025-04-30T16:00:00Z", durationMinutes: 60 },
  { id: "hist_22", title: "Admin: Expensify Processing & Calendar Housekeeping", start_time: "2025-05-02T17:00:00Z", durationMinutes: 45 },

  // Crises & Disruptions (Category J - newly isolated)
  { id: "hist_23", title: "SEV-1 Production Database Outage War Room", start_time: "2025-08-14T21:00:00Z", durationMinutes: 120 },
  { id: "hist_24", title: "Urgent GDPR Data Privacy Breach Response Bridge", start_time: "2025-09-18T22:00:00Z", durationMinutes: 90 },
  { id: "hist_25", title: "Emergency Crisis PR: Reputational Leak Mitigation", start_time: "2025-11-20T19:00:00Z", durationMinutes: 60 },
];

Deno.test("Stage D: Run Historical Replay over historical event sample (Step 15)", async () => {
  const report = await runHistoricalReplay(HISTORICAL_SAMPLE_EVENTS, { writeParityLog: true });

  console.log("\n=======================================================");
  console.log("STAGE D: HISTORICAL REPLAY SUMMARY REPORT (Step 15)");
  console.log(`Total Events Replayed: ${report.metrics.totalEvents}`);
  console.log(`Identical Matches:     ${report.metrics.identicalMatches}`);
  console.log(`Subtype Refinements:   ${report.metrics.categoryMatchesSubtypeRefined}`);
  console.log(`Category Divergences:  ${report.metrics.categoryDivergences} (${report.metrics.divergenceRatePercent}%)`);
  console.log("-------------------------------------------------------");
  console.log(`New Category I (Operations) Detected: ${report.metrics.newPillarsDetected.categoryI_operations}`);
  console.log(`New Category J (Crises) Detected:     ${report.metrics.newPillarsDetected.categoryJ_crisis}`);
  console.log("-------------------------------------------------------");
  console.log("V3 Confidence Breakdown:");
  console.log(`  inferred_high:   ${report.metrics.v3StatusDistribution.inferred_high}`);
  console.log(`  inferred_medium: ${report.metrics.v3StatusDistribution.inferred_medium}`);
  console.log(`  confirmed:       ${report.metrics.v3StatusDistribution.confirmed}`);
  console.log(`  uncertain:       ${report.metrics.v3StatusDistribution.uncertain}`);
  console.log("=======================================================\n");

  assertEquals(report.metrics.totalEvents, HISTORICAL_SAMPLE_EVENTS.length);
  // Verify that new operational (I) and crisis (J) events were accurately identified in historical replay
  assertEquals(report.metrics.newPillarsDetected.categoryI_operations >= 3, true);
  assertEquals(report.metrics.newPillarsDetected.categoryJ_crisis >= 3, true);
  // Verify high confidence rate (at least 80% high or medium confidence)
  const confidentCount = report.metrics.v3StatusDistribution.inferred_high + report.metrics.v3StatusDistribution.inferred_medium;
  assertEquals(confidentCount >= 20, true);
  // Parity log records created
  assertEquals(report.records.length, HISTORICAL_SAMPLE_EVENTS.length);
});
