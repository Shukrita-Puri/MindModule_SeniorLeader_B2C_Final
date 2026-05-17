// ═════════════════════════════════════════════════════════════════════════
// Re-export shim. The Executive State Operating System now lives in the
// layered ./events/* modules (see plan in .lovable/plan.md):
//
//   ./events/event-categories.ts  — SINGLE A–H pillar source (was FRAMEWORK_PILLARS)
//   ./events/event-subtypes.ts    — 30 granular EVENT_TYPES + EVENT_TYPE_TO_SCENARIO_ID
//   ./events/event-classifier.ts  — classifyEvent / scoring / dedupe / day-kind
//   ./events/state-engines.ts     — detect* / morning + evening context / consolidate
//   ./events/event-phase-map.ts   — §4 per-category Pre/During/Post detail
//
// This file is a transitional re-export so the 11 existing consumers keep
// working with their original import paths. New code should import from
// `./events/*` directly. Slated for deletion in the next release.
// ═════════════════════════════════════════════════════════════════════════

export * from "./events/event-categories.ts";
export * from "./events/event-subtypes.ts";
export * from "./events/event-classifier.ts";
export * from "./events/state-engines.ts";
