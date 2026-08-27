# Redeploy taxonomy-consuming edge functions

The A–H taxonomy change (`acronym-dictionary.ts` RFP → competitive pitch, `conf.speaking` speaker-cue gating, new `conf.attendance`) lives in shared modules that are bundled into each edge function at deploy time. Until each consumer is redeployed, live behaviour still runs the old classification.

## What to deploy

Direct taxonomy consumers (import `_shared/events/*`):

- cause-effect-engine
- compute-outer-readiness
- generate-coach-summary
- generate-jit-events
- generate-mastery-plan
- list-week-ahead-priorities
- performance-rhythm-insights
- record-event-priority-signal
- self-mastery-coach
- smart-nudges

Indirect consumers that bundle the same shared tree (signal-engine / personas) and should stay in lockstep:

- build-executive-home-cards
- compute-inner-readiness
- content-feedback
- travel-notifications
- travel-state-sync

## Verification after deploy

1. Run the shared Deno taxonomy suite once more before shipping (expect green).
2. Smoke-test `compute-outer-readiness` and `list-week-ahead-priorities` via a direct function call and confirm no runtime/import errors.
3. Confirm a speaker-cue title still resolves to C (`conf.speaking`) and a bare "Summit" title resolves to F (`conf.attendance`) in the returned payload/logs.
4. Check edge function logs for errors immediately after deploy.

No code changes are part of this plan — deployment and verification only.
