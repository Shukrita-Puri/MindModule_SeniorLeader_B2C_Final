## Goal

Three related fixes inside `supabase/functions/_shared/executive-state-taxonomy.ts` and consumers:

1. Stop attendee count from filtering out genuinely high-stakes events that happen to be calendar blocks (Media/CNN, travel, board prep, deep work blocks the user has elevated to a real commitment, etc.).
2. Make calendar provider primacy **platform-aware**: iOS → Apple wins; Web → Google / Microsoft win and Apple is shown as connected but de-prioritised. Cross-provider title dedupe stays on.
3. Close the deferred Gap 3b in `generate-mastery-plan`: replace the two title-rescan loops with a deterministic `EVENT_TYPE.id → scenarioId` mapping so mastery scenario lookup goes through the shared taxonomy.

No UI changes. No DB schema changes. Attendee data is *kept* on each event so future role-play / relational-navigation features can read it as a tag.

---

## 1. Attendee gate — keyword-first, attendees as a soft signal

**File:** `supabase/functions/_shared/executive-state-taxonomy.ts`

Today `survivesAttendeeOrDurationFloor()` (line 230) drops:
- any event where `dur > 240 && att <= 1` (kills Travel / Media / long Focus blocks)
- any recurring event with `att <= 2 && dur < 45`
- any event with `att < 2 && dur < 30`

Replacement rule:
- If the title classifies to an `EventType` (i.e. `classifyEvent(title) !== null`) → **always survives**, regardless of attendee count or duration. Keyword wins.
- Else fall back to a *softer* gate: drop only obvious noise (already handled by `isNoiseTitle()` upstream) plus `dur < 15 && att === 0` micro-blocks.
- Personal-block pattern stays an automatic drop (already handled by `isNoiseTitle()` patch).

Add a new helper `attendeeTier(e)` returning `'solo' | 'small' | 'group' | 'broadcast'` based on attendee count. **Not used for gating today**, but exported and attached to `ScoredEvent` so future role-play prioritisation can consume it without re-deriving.

`stakesScore()` stays unchanged (already title-driven via `EventType.demandProfile` + pillar weight). No engine math changes.

**Smoke check:** "Media interview - CNN" (0 attendees, 60min block) and "Travel - LHR→JFK" (0 attendees, 8h) must both pass `survivesAttendeeOrDurationFloor()` and be picked by `selectLeadEvent()` over a 1:1.

---

## 2. Platform-aware calendar primacy

**File:** `supabase/functions/_shared/calendar-provider.ts`

Today `PRECEDENCE = ['apple','google','microsoft']` is global. We need it to flip by client platform:

```ts
type ClientPlatform = 'ios' | 'web' | 'unknown';
const PRECEDENCE_BY_PLATFORM = {
  ios:     ['apple','google','microsoft'],
  web:     ['google','microsoft','apple'],
  unknown: ['apple','google','microsoft'], // safe default = current behaviour
};
```

Update `getPrimaryCalendarProvider(db, userId, platform)` to take the new arg. Callers detect platform from the request (header `x-client-platform` set by the iOS Capacitor wrapper, falling back to `User-Agent` sniff for `CFNetwork`/`Capacitor`/iOS, otherwise `web`).

Add a tiny `detectClientPlatform(req: Request): ClientPlatform` helper in the same file so every consumer can call it consistently.

**Consumers to thread the platform through** (one-line edits each):
- `compute-outer-readiness/index.ts`
- `smart-nudges/index.ts`
- `generate-mastery-plan/index.ts`
- `generate-jit-events/index.ts`
- `performance-rhythm-insights/index.ts`
- `cause-effect-engine/index.ts`
- `generate-coach-summary/index.ts`
- `self-mastery-coach/index.ts`

**Dedupe behaviour:** `dedupeCalendarEvents()` already collapses by `normalizedTitle|startMs`. Keep it — but flip `PROVIDER_RANK` inside the dedupe tiebreak to be **platform-aware too** (when web context, Google/MS wins the tie; when iOS, Apple wins). Easiest: pass an optional `platform` arg into `dedupeCalendarEvents(events, { platform })` and rebuild PROVIDER_RANK accordingly. Default = current behaviour for backward compat.

iOS app (Capacitor) already sets a stable header in `nativeBackgroundSync.ts`-style fetches; we'll add `x-client-platform: ios` there so the edge functions detect it deterministically. Web fetches don't need to send anything.

**Net effect:**
- iOS user with all 3 connected → Apple feeds the brief/nudges/plan; Google/MS rows in `calendar_events` are deduped away by title+start.
- Web user with all 3 connected → Google (or MS) feeds the brief/nudges/plan; Apple rows are deduped away. Apple still shows as "connected" in the connections UI (no change there).

---

## 3. Mastery-plan scenario lookup via shared taxonomy

**Files:**
- `supabase/functions/_shared/executive-state-taxonomy.ts` — add an exported map.
- `supabase/functions/generate-mastery-plan/index.ts` — consume it.

### 3a. New shared export

```ts
// EVENT_TYPE.id → mastery scenarioId
// One-way mapping. Multiple EVENT_TYPE ids can fold into one scenario.
export const EVENT_TYPE_TO_SCENARIO_ID: Record<string, string> = {
  'gov.board_meeting':           'pre-board-meeting',
  'gov.board_committee':         'pre-board-meeting',
  'gov.board_prep':              'pre-board-meeting',
  'inv.investor_meeting':        'pre-investor-meeting',
  'inv.fundraising':             'pre-investor-meeting',
  'inv.earnings_call':           'pre-budget-review',
  'inv.budget_review':           'pre-budget-review',
  'inv.ma_discussion':           'pre-negotiations',
  'str.strategy_planning':       'pre-strategic-planning',
  'str.qbr':                     'pre-quarterly-review',
  'str.deep_work':               null as any, // intentionally no scenario (PROTECT, no prep)
  'vis.keynote':                 'pre-investor-meeting',
  'vis.speaking':                'pre-media',
  'vis.media':                   'pre-media',
  'vis.all_hands':               'pre-all-hands',
  'vis.client_presentation':     'pre-client-presentation',
  'lead.executive_1on1':         null as any,
  'lead.leadership_sync':        'pre-all-hands',
  'lead.performance_review':     'pre-performance-review',
  'lead.difficult_conversation': 'pre-difficult-conversation',
  'lead.layoff':                 'pre-difficult-conversation',
  // ... fill remainder by inspecting EVENT_TYPES rows
};

export function scenarioIdFor(title: string | null | undefined): string | null {
  const et = classifyEvent(title);
  if (!et) return null;
  return EVENT_TYPE_TO_SCENARIO_ID[et.id] ?? null;
}
```

The mapping table lives next to `EVENT_TYPES` so any future scenario / event-type addition is a one-line update in one file. Entries with `null` are intentional (no prep scenario applies — e.g. deep work, 1:1).

### 3b. Consume it in `generate-mastery-plan`

Replace both `for (const scenario of EXECUTIVE_SCENARIOS) { /* keyword scan */ }` blocks (lines 1191 and 1369) with:

```ts
const scenarioId = scenarioIdFor(evt.title);
if (!scenarioId) continue;
const scenario = EXECUTIVE_SCENARIOS.find(s => s.id === scenarioId);
if (!scenario) continue;
// existing hoursAhead / module logic stays exactly as-is
```

`EXECUTIVE_SCENARIOS` and its bespoke `ModuleSpecs` stay in `generate-mastery-plan` — only the *match step* moves to the shared taxonomy. This unblocks Gap 3b without forcing the bespoke ModuleSpec table into the shared module.

Drop the inline `NOISE_KEYWORDS` constant (line 1045) and call `isNoiseTitle()` instead — closes the last bit of Gap 3.

---

## 4. Validation

1. Write a Deno test in `_shared/executive-state-taxonomy.test.ts` covering:
   - "Media Interview – CNN" with 0 attendees, 60min, non-recurring → survives, `selectLeadEvent` picks it over a 5-attendee 1:1.
   - "Travel – LHR → JFK" 8h, 0 attendees → survives.
   - "Lunch" personal block → still drops.
   - `dedupeCalendarEvents` with same Apple+Google "Board Meeting AXA" → on `platform:'web'`, Google wins; on `platform:'ios'`, Apple wins.
   - `scenarioIdFor('Board meeting with AXA')` → `'pre-board-meeting'`.
2. Tail logs for `compute-outer-readiness`, `generate-mastery-plan`, `generate-jit-events`, `smart-nudges` for one cycle after deploy. Confirm no TypeScript errors and no regressions in event counts.
3. Manual check on `/`: brief NEXT UP for an iOS user with a CNN media block today shows "Media Interview – CNN", not the next 1:1.

---

## Out of scope

- No UI changes to pills, brief, plan cards, or connections page.
- No DB / schema changes — `calendar_events.attendees_count` stays on every row for future role-play features.
- No new `EVENT_TYPES` entries; only the EVENT_TYPE → scenarioId mapping is new.
- No changes to scoring math, JIT bucket math, or signal-summary store.
