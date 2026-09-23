# Project Memory

## Core
- Minimalist Executive UI: Active Calm aesthetics, strict typography, no wellness tropes or human figures.
- Supabase on Lovable Cloud. Proprietary logic (scoring, LLMs) resides strictly in Edge Functions.
- DB is the absolute canonical source of truth for all wearable/readiness data. Fallbacks are forbidden.
- RLS deny-by-default for user data. All writes are handled by Edge Functions via service role.
- Standard time windows: Morning (05-12), Afternoon (12-18), Evening (18-05). Always tied to user timezone.
- Auth0 token session persistence is 30 days. DEV_MODE bypasses Auth0 via headers for local testing.
- A–H categories resolve ONLY via resolveEvent() in _shared/events/resolve-event-category.ts; frontend mirrors src/lib/events/categories.ts.
- Calendar volume/load is factual (deduplicated count, pill vocabulary light/busy/heavy). Never say "no events" when events exist.
- Load is scored filter-first on one list; holidays (home or foreign) never add load; primary_calendar_events merges ALL providers.
- Week-Ahead fires ONLY on the last day of an off-run (last weekend/PTO/holiday/long-weekend day) — never mid-run, never after.
- A pattern may be quoted only through the shared citable-pattern gate (_shared/patterns/pattern-eligibility.ts). No other pattern citation path.

## Memories

- [Shared Citable Pattern Gate](mem://features/patterns/shared-citable-pattern-gate) — one 365-day gate for quoted patterns in nudges/Plan/Brief: 3+ occurrences, latest included, negative, same event type today/tomorrow
- [Week-Ahead Last-Day-Only](mem://features/notifications/week-ahead-last-day-only) — tomorrowIsOffDay guard in evaluateWeekAheadMode; wired through nudges, plan, brief, home cards
- [Calendar Load Truth SSOT](mem://architecture/calendar/load-truth-ssot) — filter-first day-level load, FYI holiday exclusion by feed name, same-slot collapse, all-provider view, holiday framing overlay
- [Single A–H Entry Point](mem://architecture/events/single-a-h-entry-point) — resolveEvent() is the only allowed resolver; legacy shim deleted
- [Frontend Home Rule + Title SSOT](mem://features/content/frontend-home-rule-and-title-ssot) — plan only sources practices visible on the frontend; one canonical name per practice across list, plan, page, deck, DB
- [Deterministic Brief Quality v7.7](mem://features/performance-readiness/deterministic-brief-quality-v7-7) — calendar-load honesty, window-context sourcing, generic-branch copy invariants, validator gating, manual refresh
- [Two-Party Title Inference](mem://architecture/events/two-party-title-inference) — 1:1 from title only; attendee count and duration are never evidence
