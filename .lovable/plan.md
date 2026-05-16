
## Scope

Two-file taxonomy split (state vs event-protocol), three new behaviour rules in the existing rules module, scope-tagged rule registry, plus a `PRACTICE_TYPE_TO_COMBO` migration note and a Phase 2 classification-path audit captured in the ownership memory doc. Phase 1 only — no edge function wiring.

## Files

NEW:
- `supabase/functions/_shared/event-protocol-taxonomy.ts`
- `supabase/functions/_shared/event-protocol-taxonomy.test.ts`

EDIT:
- `supabase/functions/_shared/brief-context.ts` — extend `BehaviourRule` union; add `RuleScope`, `ScopedRule`; add optional `dayOfWeek`, `backToBackHoursToday`, `historicalAppOpenRateLow`, `conferenceDayNumber` to `RuleContext`; add optional `protocol` + `mode` to `SlotBoost`.
- `supabase/functions/_shared/ceo-behaviour-rules.ts` — add `sundayReset`, `notificationIsProduct`, `conferenceDepletion`; convert `ALL_RULES` to `ScopedRule[]` with `scopes` metadata.
- `supabase/functions/_shared/ceo-behaviour-rules.test.ts` — tests for the three new rules + scope filtering.
- `supabase/functions/_shared/behaviour-evaluator.ts` — `evaluate(ctx, { scope? })` filters by `ScopedRule.scopes`.
- `mem/architecture/ceo-behaviour-shared-module-ownership.md` — document the two-file taxonomy split, the `PRACTICE_TYPE_TO_COMBO` migration rule, and the Phase 2 classification-path audit.

NOT TOUCHED in Phase 1:
- `executive-state-taxonomy.ts` — zero edits. Audit deferred to Phase 2.
- All edge functions. Phase 2 owns wiring.

## 1. `event-protocol-taxonomy.ts` (new file)

Different change pressure from `executive-state-taxonomy.ts`: this file moves on coaching/clinical decisions (new protocol, new event category, new trigger keyword), not on product copy decisions (pillar names, stakes vocabulary). Co-located internally because the §3 matrix is typed against §2 combo keys — that's a compile-time safety net.

```ts
// OWNERSHIP: engineering + coaching. Trigger logic / phase prescriptions
// change via code review only. Do not edit in a chat-driven session without
// an explicit human request.
//
// §2 Six protocol combinations + §3 Eight CEO Event Categories from the
// CEO Self-Regulation Framework v1.0. Pure data + pure deterministic
// classifiers. No IO, no fetches.

// --- §2 Protocol combinations -------------------------------------------
export type Protocol = "mindset" | "somatic";
export type ProtocolMode = "pause" | "flow" | "reenergise";
export type ComboKey = `${Protocol}.${ProtocolMode}`;

export interface ProtocolCombo {
  protocol: Protocol;
  mode: ProtocolMode;
  whenToUse: string;   // doc §2 verbatim
  outcome: string;     // doc §2 verbatim
}

export const PROTOCOL_COMBOS: Record<ComboKey, ProtocolCombo>;

// Legacy SlotBoost.practiceType → preferred (protocol, mode).
// SINGLE SOURCE OF TRUTH for this mapping. generate-mastery-plan must
// import from here in Phase 2 — do not duplicate the mapping anywhere.
export const PRACTICE_TYPE_TO_COMBO = {
  regulate:  { protocol: "somatic",  mode: "pause"      },
  align:     { protocol: "mindset",  mode: "pause"      },
  prepare:   { protocol: "mindset",  mode: "flow"       },
  integrate: { protocol: "mindset",  mode: "reenergise" },
} as const satisfies Record<string, { protocol: Protocol; mode: ProtocolMode }>;

export function comboFor(
  practiceType: keyof typeof PRACTICE_TYPE_TO_COMBO,
): ProtocolCombo;

// --- §3 Eight CEO Event Categories --------------------------------------
export type EventCategoryId = "A"|"B"|"C"|"D"|"E"|"F"|"G"|"H";

export interface EventPhase {
  timing: string;
  combo: ComboKey;
  goal: string;
  prevents: string;
}

export interface EventCategory {
  id: EventCategoryId;
  name: string;                     // "HIGH-STAKES GOVERNANCE", …
  triggers: string[];               // doc §3 title keywords
  selfRegulationFocus: string;
  phases: {
    pre?:    EventPhase;
    during?: EventPhase;
    post?:   EventPhase;
  };
}

export const EVENT_CATEGORIES: Record<EventCategoryId, EventCategory>;

export function classifyEvent(
  title: string,
  stakesLevel?: string,
): EventCategoryId | null;

export function protocolsForEvent(
  title: string,
  phase: "pre" | "during" | "post",
): ProtocolCombo | null;
```

Tests in `event-protocol-taxonomy.test.ts`:
- Every `practiceType` round-trips to a valid `ProtocolCombo` via `comboFor`.
- One canonical title per category (A–H) classifies correctly.
- `protocolsForEvent("Board meeting", "pre")` returns the §3 PRE combo for category A.
- Unknown title returns `null` for both classifiers.

## 2. Rule scoping in `brief-context.ts`

```ts
export type RuleScope = "brief" | "nudge" | "plan";

export interface ScopedRule {
  scopes: readonly RuleScope[];
  fn: (ctx: RuleContext) => BehaviourFlag | null;
}

export type BehaviourRule =
  | "vetoRisk" | "secondWind" | "circadianPriority"
  | "decisionLeakageGuard" | "postPeakHangover"
  | "personalFrictionInference" | "boardLevelOutcome"
  | "sundayReset"            // NEW — all three surfaces
  | "notificationIsProduct"  // NEW — nudge only
  | "conferenceDepletion";   // NEW — stub now, lights up when schema lands

export interface RuleContext {
  // …existing fields…
  dayOfWeek?: number;                  // 0 = Sun … 6 = Sat (local)
  backToBackHoursToday?: number;
  historicalAppOpenRateLow?: boolean;
  conferenceDayNumber?: number;        // undefined until schema lands
}

export interface SlotBoost {
  // …existing fields…
  protocol?: Protocol;
  mode?: ProtocolMode;
}
```

## 3. Three new rules in `ceo-behaviour-rules.ts`

```ts
// §5.2 Sunday Reset Non-Negotiable — shared across brief/plan/nudge
export function sundayReset(ctx: RuleContext): BehaviourFlag | null {
  if (ctx.dayOfWeek !== 0) return null;
  if (ctx.localHour < 18 || ctx.localHour >= 21) return null;
  return {
    rule: "sundayReset",
    severity: "medium",
    evidence: ["Sunday evening reset window"],
    stake: "Operational Drive",
    copyHint:
      "orient to week-ahead as a readiness asset; prime Monday, do not invite Sunday-anxiety spiral",
  };
}

// §5.2 Notification IS the Product — nudge only
export function notificationIsProduct(ctx: RuleContext): BehaviourFlag | null {
  const dense = (ctx.backToBackHoursToday ?? 0) >= 4;
  if (!dense || !ctx.historicalAppOpenRateLow) return null;
  return {
    rule: "notificationIsProduct",
    severity: "medium",
    evidence: [`back-to-back ${ctx.backToBackHoursToday}h`, "low historical open rate"],
    stake: "Mental Bandwidth",
    copyHint:
      "the nudge IS the value — write a complete micro-reframe in the body; do not invite app open",
  };
}

// Conference depletion — STUB. Returns null until conferenceDayNumber is
// populated. Same pattern as personalFrictionInference.
// When the schema field arrives, only brief-signal-coverage.ts needs to
// populate ctx.conferenceDayNumber. This rule, the flag shape, and every
// downstream consumer remain unchanged.
export function conferenceDepletion(ctx: RuleContext): BehaviourFlag | null {
  const day = ctx.conferenceDayNumber;
  if (typeof day !== "number" || day < 2) return null;
  const severity: Severity = day >= 3 ? "high" : "medium";
  return {
    rule: "conferenceDepletion",
    severity,
    evidence: [`conference day ${day}`],
    stake: "Physical Recovery",
    copyHint:
      "name the cumulative cost of multi-day on-stage time; orient to recovery protection, not output expansion",
  };
}
```

Scoped registry:

```ts
export const ALL_RULES: ScopedRule[] = [
  { scopes: ["brief","plan","nudge"], fn: vetoRisk },
  { scopes: ["brief","plan"],         fn: secondWind },
  { scopes: ["brief","plan","nudge"], fn: circadianPriority },
  { scopes: ["brief","plan","nudge"], fn: decisionLeakageGuard },
  { scopes: ["brief","plan"],         fn: postPeakHangover },
  { scopes: ["brief"],                fn: personalFrictionInference },
  { scopes: ["brief","plan","nudge"], fn: boardLevelOutcome },
  { scopes: ["brief","plan","nudge"], fn: sundayReset },          // NEW
  { scopes: ["nudge"],                fn: notificationIsProduct },// NEW
  { scopes: ["brief","plan","nudge"], fn: conferenceDepletion },  // NEW (stub)
];
```

## 4. `behaviour-evaluator.ts`

```ts
export function evaluate(
  ctx: RuleContext,
  opts: { scope?: RuleScope } = {},
): BehaviourFlag[] {
  const flags: BehaviourFlag[] = [];
  for (const r of ALL_RULES) {
    if (opts.scope && !r.scopes.includes(opts.scope)) continue;
    const f = r.fn(ctx);
    if (f) flags.push(f);
  }
  return flags.sort((a,b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}
```

`deriveSlotBoosts` continues populating `SlotBoost.practiceType` and additionally sets `protocol` + `mode` via `PRACTICE_TYPE_TO_COMBO`. Non-breaking: existing consumers ignore the new fields.

## 5. Tests (extend `ceo-behaviour-rules.test.ts`)

- `sundayReset` fires Sun 19:00; null Sun 12:00; null Mon 19:00.
- `notificationIsProduct` fires with `backToBackHoursToday: 5 + historicalAppOpenRateLow: true`; null when either missing or false.
- `conferenceDepletion`: null when undefined; medium on day 2; high on day 3+.
- `evaluate(ctx, { scope: "nudge" })` includes `notificationIsProduct`.
- `evaluate(ctx, { scope: "brief" })` excludes `notificationIsProduct`.
- `evaluate(ctx, { scope: "plan" })` excludes `personalFrictionInference` (scoped brief-only).
- Sunday-window context with `scope: "nudge"` returns `sundayReset`.

## 6. Memory doc — `mem/architecture/ceo-behaviour-shared-module-ownership.md`

Append:

- **Two-file taxonomy split.** `executive-state-taxonomy.ts` owns pillar/stakes/keyword vocabulary (product/copy cadence). `event-protocol-taxonomy.ts` owns §2 combos + §3 event matrix + `classifyEvent` (coaching/clinical cadence). Consumers never import from either directly for behaviour decisions — they call `behaviour-evaluator.evaluate(ctx, { scope })`.
- **`PRACTICE_TYPE_TO_COMBO` is the single source of truth** for the legacy practiceType → (protocol, mode) mapping. In Phase 2, `generate-mastery-plan` must import this constant and stop using string literals. Do not duplicate the mapping in plan-side code. If a second copy appears in review, reject the PR.
- **Phase 2 audit (write down now, execute later).** Before wiring `compute-outer-readiness`, `smart-nudges`, and `generate-mastery-plan` to `event-protocol-taxonomy`, grep consumer edge functions for direct imports of `executive-state-taxonomy.ts`. Any consumer using stakes/keyword lookups to make event classification decisions that `classifyEvent()` now handles must migrate to the new function. Do not leave two classification paths running in parallel — that's how silent drift starts.
- **Stub-rule pattern.** `personalFrictionInference` and `conferenceDepletion` return `null` today. They reserve the BehaviourFlag API surface so Phase 2 wiring is reviewed once. When the underlying data lands (≥3 weeks per-user history; `conference_day_number` field), only `brief-signal-coverage.ts` changes — the rules, flags, and consumers do not.
- **Scoped rules.** Every entry in `ALL_RULES` declares `scopes: RuleScope[]`. Add behaviours by tagging existing files, not by creating new rule files per surface.

## Out of scope (deferred per doc)

- Multi-Calendar Load Distortion.
- Good Stress vs Bad Stress.
- The `conference_day_number` schema migration itself (rule ships as stub; schema lands in a separate, focused PR).
- All Phase 2 edge-function wiring behind `SHARED_MODULES_ENABLED`.

## Verification

- `deno test` green on `ceo-behaviour-rules.test.ts` (extended) and `event-protocol-taxonomy.test.ts` (new).
- Type-check clean across `_shared/`. `ScopedRule` is the only structural change; everything else is additive.
- Zero edits to `executive-state-taxonomy.ts`. Zero edits to consumer edge functions.
