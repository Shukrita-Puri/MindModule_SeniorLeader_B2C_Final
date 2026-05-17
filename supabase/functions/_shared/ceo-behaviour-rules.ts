/**
 * DEPRECATED shim. Source of truth moved to ./ceo-behaviour/*.ts in Phase 1.5
 * Batch 1 (cluster restructure).
 *
 * Existing consumers (behaviour-evaluator.ts, ceo-behaviour-rules.test.ts) import
 * from this path and continue to work unchanged. New code MUST import from
 * "./ceo-behaviour/index.ts" directly. This shim will be removed one release
 * after Batch 3 ships.
 */

export * from "./ceo-behaviour/index.ts";