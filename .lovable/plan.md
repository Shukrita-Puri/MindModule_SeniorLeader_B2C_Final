
## Goal

Make `executive-state-taxonomy.ts` the single source of truth for the 8-pillar CEO Self-Regulation Framework, and apply only the protocol/JIT/copy implications that fall out of it. MVP scope = Self-Regulation only. No changes to: weekend nudge cadence (Sat AM, Sun AM, Sun PM stay), DND/quiet-hours behaviour, multi-calendar load logic, wearable-less logic, attendee-count gating (already removed), long-haul wifi handling.

## In scope

### 1. Taxonomy alignment (`supabase/functions/_shared/executive-state-taxonomy.ts`)

Re-label the 8 EventGroups to match the framework's pillars A–H exactly:

```text
A_governance         → High-Stakes Governance
B_influence          → Influence & Persuasion          (renamed from B_investor; investor stays inside)
C_visibility         → Visibility & Communication      (renamed from D_visibility)
D_people             → People & Difficult Conversations (renamed from E_leadership)
E_deepwork           → Deep Work & Strategy            (renamed from C_strategic)
F_conferences        → Conferences & External Events   (NEW pillar; absorbs vis.speaking, keynote, off-site, awards, multi-day customer summit, networking event)
G_travel             → Travel
H_rhythm             → Daily Rhythm & Baseline         (renamed from H_recovery; PTO + baseline live here)
```

Event-level updates:

- Move `vis.keynote`, `vis.speaking` (conference/summit/panel/roundtable/webinar), off-sites/retreats, award events, multi-day customer summit into pillar F. Keynote remains visibility-flavoured but its protocol map switches to the conference template (see §2).
- Add `conf.networking_event` to pillar F BUT mark it as classification-only: `timingMatrix:{pre:false,during:false,post:false}`, `regulationObjective:'PROTECT'`, no JIT, no nudges, no mastery modules. It will surface in Insights cause-effect cards but never trigger a protocol/notification.
- Add new keywords for roundtables/panels/summits already covered by `vis.speaking`; ensure `roundtable`, `panel discussion`, `fireside` are present.
- Job interviews (giving or attending one's own — explicitly NOT media): keep classified under pillar D (`lead.hiring_committee`) and broaden keywords (`job interview`, `final round interview`, `screening interview`). Self-regulation focus = pre-event Pause for composure. No new pillar.
- 1:1 detection improvements are explicitly out of scope (no reliable boss/peer/junior signal, titles often just names) — leave `lead.executive_1on1` keywords as-is and document in a code comment.
- Pillar F (Conferences & External) protocol contract:
  - PRE (morning of): Mindset Pause for social/emotional load priming.
  - DURING: notification-only micro-reframe (no in-app exercise; user is between chats).
  - POST: Somatic Reenergise for social-depletion recovery.

### 2. Protocol orchestration (`supabase/functions/generate-jit-events/index.ts`, `supabase/functions/generate-mastery-plan/index.ts`, `supabase/functions/smart-nudges/index.ts`)

- Read pillar/group from the taxonomy and switch protocol templates by pillar instead of inline keyword maps where this is still happening.
- For pillar F events:
  - Morning Plan slot 1 = Pause variant tagged `social_load_prep`.
  - Generated JIT slot is suppressed; emit `nudge_two` only (notification = the intervention, deep_link omitted or pointed at `/executive-home` informational).
  - Evening Plan slot 3 = Reenergise variant tagged `post_event_recovery`.
- Stacking rule (Board + Layoff or any two pillar A/D high-stakes events same day):
  - If start-time gap ≥ 90 min → keep two independent JIT protocols (current behaviour).
  - If gap < 90 min OR back-to-back → emit ONE consolidated JIT covering both, with copy that names both events and uses a single combined Pause+Flow practice. Add helper `consolidateAdjacentHighStakes(events)` in `generate-jit-events`. MVP comment: revisit when other meta-skills exist.
- `findEventPattern` and pillar-aware copy in `smart-nudges` already pull from the taxonomy; only update the small switch that hard-codes group ids.

### 3. Insights cause-effect labels

`bucket` strings on EventType already feed `causality_findings.signal_summary`. Re-map buckets so the eight pillar names show through verbatim in the Insights cause-effect card (e.g. `Conferences & External Events`, `People & Difficult Conversations`). No DB migration — values are stored as text on write going forward; historical rows keep their old labels.

### 4. Confirmations on already-correct behaviour (no code change)

- DND/quiet-hours: confirmed via `apns-expiration` + `apns-collapse-id` per family — stale nudges expire and only the next family-fresh one is delivered after DND ends. Add a one-line code comment in `smart-nudges/index.ts` referencing this contract.
- Weekend cadence (Sat AM, Sun AM, Sun PM week-prep) — unchanged.
- Long-haul wifi — explicitly not engineered.
- Attendee-count gating — confirmed removed; re-deferred to relational-navigation feature.

## Out of scope

- 1:1 boss/peer/junior detection (no reliable signal).
- Multi-calendar load distortion changes.
- Wearable-less behavioural rules.
- Long-haul wifi during-flight prompts.
- New mastery scenarios for new event types (still deferred — no `EVENT_TYPE → scenarioId` table).

## Verification

- Unit: classify representative titles (`Q4 Board Meeting`, `Layoff comms`, `SaaStr Summit`, `Final round interview — Priya`, `Networking dinner`) → expect correct pillar.
- Manual: simulate same-day Board 09:00 + Layoff 10:00 → expect single consolidated JIT; Board 09:00 + Layoff 16:00 → two JITs.
- Smoke: run `generate-mastery-plan` for a fixture user with a conference day → morning Pause, no JIT, evening Reenergise.
- Insights cause-effect card: spot-check that new pillar names render.

## Files touched

- `supabase/functions/_shared/executive-state-taxonomy.ts`
- `supabase/functions/generate-jit-events/index.ts`
- `supabase/functions/generate-mastery-plan/index.ts`
- `supabase/functions/smart-nudges/index.ts`
- `.lovable/plan.md` (changelog entry only)
- `mem/features/notifications/smart-nudges-mvp-framework.md` (one-line note: pillar F protocol contract; weekend cadence unchanged)
