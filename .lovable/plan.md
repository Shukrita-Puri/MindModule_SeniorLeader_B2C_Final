# Release-Blocking Plan: 24h Rule + Week-Ahead Leakage + Coach Hard-Coding

Four stacked bugs are visible across the two screenshots. All four are root-cause-confirmed in the code.

## What the two screenshots prove

**Screenshot A — `/executive-home`, Sat 20 Jun, evening**
- Header reads "Today's Performance Priorities" (day-of surface).
- Slot 2 anchor is a Monday event (`AI for Climate: Who Benefits,`) → 24h rule appears violated.
- Slot 2 step card is an SM Coach card (`Tiny Win and Reflection`, `SM COACH` thumbnail) → coach is hard-coded into the slot even though coach has been suppressed as a feature.
- Only 1 should exist on Saturday per the light-day rule; instead there are 2.

**Screenshot B — `/plan?expand=reflection`, Sat 20 Jun, evening**
- Header reads "Week-Ahead Priorities" → Week-Ahead surface is rendered on Saturday, contradicting the SSOT (Sunday + last-day-PTO/holiday/long-weekend only).
- The surface then fails to load (`list-week-ahead-priorities` errors) — separate, dependent bug.

---

## Root-cause map

### Bug 1 — 24h rule bypassed via the Pass 7 "upcoming week lead event" anchor

The JIT pipeline correctly enforces 24h:

- `generate-mastery-plan/index.ts:3183` — `filteredEvents = filteredEvents.filter(e => (e.minutesUntil ?? 0) <= MVP_JIT_HORIZON_MINUTES /* 1440 */)`.
- `preEventPlan` is built only from `filteredEvents`, so Monday's event is correctly excluded from JIT modules.

But a **second anchor selector** has no 24h cap and is what produced the Saturday-evening slot:

- `upcomingWeekLeadEvent` (lines 5441–5448) selects the highest-stakes event in `[startOfTomorrow, +7d)`.
- `composeStateLabel` (lines 5660–5697):
  ```ts
  const promoteWeekLead =
    upcomingWeekLeadEvent && (isWeekend || isPersonalHolidayToday || wasPersonalHolidayYesterday);
  if (promoteWeekLead && upcomingWeekLeadEvent) {
    anchorEventId = upcomingWeekLeadEvent.id;
    anchor = truncateTitle(upcomingWeekLeadEvent.title) || "this week's lead event";
  }
  ```
  with `isWeekend = dow === 0 || dow === 6` (line 5589). On Saturday this fires and Monday's event becomes the slot's *named* anchor → title and why-line both reference it.

**5-change preservation check — all preserved by the fix below**:
1. Scoring/ranking — untouched.
2. Tags/memory/cancellation/relationship — untouched.
3. Slot allocation — count math intact; only the *anchor input* to slot 2 narrows.
4. Practice selection — untouched (Saturday practice is generic "Steady the system").
5. Why-line logic — composition unchanged; the leak is in the *input* it receives.

### Bug 2 — Week-Ahead surface leaks onto Saturday

`evaluateWeekAheadMode` (server, `_shared/plan/week-ahead-mode.ts:84–90`) is explicit: **Saturday is NOT a Week-Ahead day** — only Sunday + manual override + last-day-PTO/holiday/long-weekend.

But the client hook `src/hooks/useWeekAheadMode.ts` is out of sync:
```ts
if (dow === 6) return { active: true, reason: "saturday", ... };
if (dow === 0) return { active: true, reason: "sunday", ... };
```
→ Saturday activates the surface on the client even though the server treats it as a normal day. That is exactly Screenshot B. The reason key `saturday` is even hard-coded in `WeekAheadPriorities.tsx:46` (`SUBTITLE_BY_REASON.saturday`), confirming the drift.

Then on `/executive-home` the opposite happens — there is **no** Week-Ahead routing at all (`src/pages/ExecutiveHome.tsx:300` renders `<TodayThreePriorities />` unconditionally). So Sunday week-ahead never reaches the home surface either. Two halves of the same drift class.

### Bug 3 — Coach card hard-coded into the evening slot

Coach is supposed to be suppressed; in the code it is still mandatory:

- `getCoachCardForType('integrate')` (`generate-mastery-plan/index.ts:2367–2381`) returns:
  ```ts
  { protocolType: 'Self Mastery Coach', title: 'Tiny Win and Reflection',
    isCoachCard: true, prompt: "Let's close out today. …" }
  ```
  Comment on line 2369 even says **"Evening: ALWAYS included with Tiny Wins"**.
- The card is then re-asserted by the `getCoachPromptForContext` evening branch (line 2396–2400) and lifted into a slot by `strategicModule` filler (line 6062: `m.isCoachCard || m.type === 'integrate'`).
- The client's coach-suppression filter (`TodayThreePriorities.tsx:206–210`) explicitly *allow-lists* the integrate / Tiny Win practice back in (`!p.isCoachCard || isReflection(p)`), so the SM Coach thumbnail and label survive even though every other coach card is stripped.

Net effect: every evening plan ships an SM Coach card, regardless of the global coach-suppression posture.

### Bug 4 — Saturday "light day" rule not honoured

Per memory and code comments (`generate-mastery-plan/index.ts:6149` — "Saturday → 1 morning slot mandatory"), Saturday should produce one slot. Today two appear because the Pass 7 `upcomingWeekLeadEvent` provides the secondary "meaningful signal" that lets `composeStateLabel` keep slot 2 instead of returning `null` (line 5685–5689 — slot 2 is retained when `isWeekend` is true and a week-lead anchor exists). The Bug 1 fix removes the `isWeekend` arm of `promoteWeekLead`; the matching `slotIndex === 2 && isWeekend` retention exception must be removed too so slot 2 actually drops on Saturday.

### Bug 5 — `list-week-ahead-priorities` returns an error on Sat (dependent)

Visible in Screenshot B as "Couldn't load your upcoming week." This is downstream of Bug 2 (the surface should not be loading on Saturday in the first place). Still worth a quick verification once Bug 2 is shipped — the same failure will hit Sunday users if the function is broken.

---

## Fixes (small, surgical, preservation-safe)

### F1. Gate Pass 7 weekend promotion on the server-side Week-Ahead predicate

In `generate-mastery-plan/index.ts`:

1. Compute `weekAhead = evaluateWeekAheadMode({ dayOfWeek: dow, localHour, ... })` once near the top of the slot-label section.
2. Replace
   ```ts
   const promoteWeekLead = upcomingWeekLeadEvent && (isWeekend || isPersonalHolidayToday || wasPersonalHolidayYesterday);
   ```
   with
   ```ts
   const promoteWeekLead = upcomingWeekLeadEvent && (weekAhead.active || isPersonalHolidayToday || wasPersonalHolidayYesterday);
   ```
3. In the slot-2 retention guard (lines 5685–5689), drop the `slotIndex === 2 && isWeekend` exception. Slot 2 should be retained only when an actual anchor / load / wearable deficit / next-day calendar / week-ahead-promotion exists.
4. In the return at lines 5694–5697, ensure `anchorEventId` and `eventTitle` are `null` whenever `promoteWeekLead` is false, so the why-line composer cannot rediscover the Monday title.
5. Keep `weekend` weekend-fallback strings (`'the day ahead'`, `"next week\u2019s load"`) as plain text labels only — never coupled to an `anchorEventId`.

Result: Saturday evening day-of plan returns 1 slot (Steady the system). Sunday/last-day-PTO/etc. keep the named lead-event anchor.

### F2. Realign the client Week-Ahead predicate to the server

In `src/hooks/useWeekAheadMode.ts`:

- Remove the Saturday branch entirely. Saturday returns `{ active: false, reason: null }` unless `?mode=week-ahead` is set.
- Keep Sunday + manual override as the only local heuristics.
- (Stretch, but recommended) Accept an optional server-supplied `weekAheadDecision` (returned by `generate-mastery-plan`) and prefer it over `getDay()` — kills the drift class outright.

In `src/components/home/WeekAheadPriorities.tsx`:
- Delete the `saturday` entry from `SUBTITLE_BY_REASON` — it is unreachable after the hook fix and only invites regression.

### F3. Mirror the Plan-page routing on `/executive-home`

In `src/pages/ExecutiveHome.tsx`:

- Import `useWeekAheadMode` + `WeekAheadPriorities` and apply the same conditional swap used in `src/pages/PlanPage.tsx:71–93`:
  - Header eyebrow flips between "Today's Performance Priorities" and "Week-Ahead Priorities".
  - Body renders `<WeekAheadPriorities reason=… manualOverride=… />` when active, else `<TodayThreePriorities … />`.
- No other ExecutiveHome behaviour changes.

After F2 + F3, Saturday on either route stays on the day-of surface, and Sunday on either route reaches Week-Ahead.

### F4. Strip the hard-coded coach card from the evening integrate slot

In `generate-mastery-plan/index.ts`:

- In `getCoachCardForType('integrate')` (lines 2367–2381) remove `isCoachCard: true` and `protocolType: 'Self Mastery Coach'`. Keep `type: 'integrate'`, the title, and the prompt so the inline Reflection Corner UX still mounts — but the card no longer renders as an SM Coach card.
- In the `strategicModule` filler at line 6062, drop `m.isCoachCard` from the predicate (`(m: any) => !usedIds.has(m.contentId) && m.type === 'integrate'`). The slot still fills via the integrate practice, just not via the coach card.
- In `getCoachPromptForContext` (line 2396) the evening "ALWAYS include" branch should return `null` unless a feature flag explicitly re-enables coach. Easiest: gate behind the same coach-suppression feature flag used elsewhere; if no such flag is wired yet, simply return `null` to enforce suppression.

In `src/components/home/TodayThreePriorities.tsx`:

- Remove the `isReflection`-based allow-list re-entry at lines 200–210. The filter becomes `slot.filter((p) => !p.isCoachCard)` with no exceptions. The Reflection Corner is then driven purely by the practice's `type === 'integrate'` (still mounted via the existing temporal-gate path inside the component) — no coach card needed to host it.

Result: no SM Coach card on the evening slot. Reflection Corner still appears at 18–23 local via the practice card, per the temporal-gating memory.

### F5. Verify `list-week-ahead-priorities` (post-F2 sanity)

After F2 lands, exercise `/plan` on Sunday (or with `?mode=week-ahead`) and confirm the endpoint returns 200 with priorities. If it still fails, separate ticket — likely auth or zero-events handling.

---

## Order of execution (release-blocking minimum)

1. **F1** — gate the Pass 7 promotion (kills the Monday-on-Saturday anchor + naturally drops Saturday to 1 slot).
2. **F4** — strip the hard-coded coach card from evening (kills the SM Coach leak).
3. **F2 + F3** — align client predicate with the server and mirror the routing on `/executive-home` (kills the Saturday→Week-Ahead leak; makes Sunday Week-Ahead reachable from home).
4. **F5** — verify the upcoming-week endpoint after the surface stops loading on Saturday.

## Preservation invariants — explicit confirmation

- Change 1 (scoring/ranking) — preserved. Only the anchor *selection* gate changes; scoring is untouched.
- Change 2 (tags/memory/cancellation/relationship) — preserved. No edits to skipped-types, slot-replacements, or relationship paths.
- Change 3 (slot allocation) — preserved at the count level. `_minSlots` math unchanged; Saturday correctly converges to 1 because the secondary signal disappears.
- Change 4 (practice selection) — preserved. The integrate practice spec is the same; only the `isCoachCard`/`protocolType` framing on it is removed.
- Change 5 (why-line logic) — preserved. The composer is untouched; the leak is purely upstream (anchor input).

## Out of scope

- Any change to the 24h JIT ceiling itself (already correct in `filteredEvents`).
- Any change to Week-Ahead Sunday/last-day-PTO behaviour (only Saturday is being removed from the predicate).
- Any restoration of the coach card to slots (it is being suppressed, per the user's product decision).
