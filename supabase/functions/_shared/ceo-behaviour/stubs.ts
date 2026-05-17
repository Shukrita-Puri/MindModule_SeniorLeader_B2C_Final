/**
 * CLUSTER: Stubs (return null; lock API surface)
 * SOURCE: doc §5.2 backlog + senior-engineer probes confirmed by user.
 *
 * Each stub returns null until the relevant detector lands in brief-signal-coverage.ts
 * or upstream UI/native bridge. The flag shape and downstream consumers stay identical
 * when the detector ships — only this file changes.
 *
 * STUBS (Batch 3):
 *   interpersonalMeetingContext  // needs upcomingEvents[].attendeeCount + isInterpersonal
 *   emptySlotProtection          // needs hasUpcomingEmptyBlock detector (gap >= 90min)
 *   upwardReporting              // needs userMarkedPriorities (UI dependency)
 *   stackedStakes                // same-day board + emotional; needs joint stakes detector
 *   crisisInjection              // ctx.crisisEvent set by user UI "unplanned high-stakes in N min"
 *   contextSwitchingCost         // back-to-back across different topic domains; needs classifier
 *   preEventSleepTarget          // tonight's evening nudge references tomorrow's high-stakes
 *   timeSinceLastRecovery        // ctx.minutesSinceLastPractice > 36h + active stakes today
 */

// Batch 3 will implement these as null-returning typed functions and add them to ALL_RULES.

export {};