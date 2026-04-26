## Cause & Effect — Redesign as "Performance Causality"

One card. Four lenses revealed via chevrons. Every line passes the **CEO test**: cause → measured effect → magnitude → recovery → "would I change behaviour?"

---

### 1. The CEO Contract (locked rules)

Every finding rendered MUST contain:
1. **Cause** — a named, leader-controllable input (event type, sleep tier, consecutive-load streak, behavior).
2. **Effect** — a *quantified delta* on a measured signal (HRV, RHR, clarity, sharpness, confidence, PRS) vs the user's own 30-day baseline.
3. **Magnitude** — `% delta` or `absolute Δ` with sample size `n`.
4. **Recovery window** — how many days/slots until the signal returns to ±5% of baseline.
5. **Confidence** — `n ≥ 3 occurrences` AND `|delta| ≥ 10% of baseline` (or ≥ 0.5 tier on 1-5 scales).

Findings that don't pass all five gates are **dropped, not shown**. No correlation-only fluff. No coach signals (per `mem://features/coach/suppression-standard`).

---

### 2. Single Card, 4 Chevron Lenses

Replace `CauseEffectPanel.tsx` and delete `CauseEffectInsights.tsx`. The new component `PerformanceCausalityCard.tsx` renders:

**Always visible (top of card):**
- Title: **"Cause & Effect"** + info modal
- **Top 1 finding** (highest-impact across all 4 lenses) rendered as a hero row with an inline sparkline/bar visual.

**Collapsed by default, chevron-toggled (matches existing `Collapsible` pattern from `PerformanceRhythmCard`):**
- **Lens A — Events That Cost You Physiologically** (icon: heart pulse)
- **Lens B — Events That Cost You Cognitively** (icon: brain)
- **Lens C — Sleep → Next-Day Decision Quality** (icon: moon)
- **Lens D — Recovery After Consecutive High-Load Days** (icon: layers)

Each lens shows 1–3 findings max, all visualised (not text walls).

---

### 3. Visual-First Rendering (per finding)

Each finding row is a **horizontal mini-chart**, not a paragraph:

```
[Event-type label]              ▼ HRV  -14%   (n=4)
████████████░░░░░░░░░░░░░░       Recovers in ~2 days
 Baseline 58ms       Event days 50ms
```

Components used:
- A **single-bar delta** (red if negative, emerald if positive, amber if mixed) showing % vs baseline.
- **2 small numerical anchors** (baseline value, event-day value).
- **Recovery chip** (e.g., `~2d to recover`) when applicable.
- **n badge** (sample count) so users see this is real data, not noise.

No paragraphs. No sub-headings. One row = one finding. Strict 60-char text budget per finding.

---

### 4. Data Sources (per lens)

#### Lens A — Physiological Cost of Events
- **Cause source:** `calendar_events` clustered into event-types via heuristics (already implemented logic in `historicalPatternEngine.ts` + new keyword expansion: `board|investor|review|1:1|all-hands|deep-work|interview`).
- **Effect source:** `wearable_data` daily `hrv`, `resting_heart_rate`, `heart_rate` (avg bpm).
- **Method:** For each event-type with ≥3 occurrence days, compute mean `hrv` / `rhr` on event-days vs mean on non-event-days within the same 30-day window. Recovery window = number of days post-event for `hrv` to return to ±5% of baseline (using the next 3 days after each occurrence).
- **Output:** `"Board reviews → HRV −14% (n=4) · recovers in ~2d"`.

#### Lens B — Cognitive Cost of Events
- **Cause source:** Same calendar event clustering.
- **Effect source:** `daily_checkins.clarity_level`, `mental_sharpness_level`, `confidence_level`, plus `brief_snapshots.score` (PRS).
- **Method:** Compare check-in slot **immediately after** (same-day later slot OR next-morning) the event's slot vs the user's 30-day mean for that slot. Pick the **most-impacted dimension** per event-type.
- **Output:** `"Investor calls → Sharpness −1.2 tiers (n=3) · rebounds next morning"`.

#### Lens C — Sleep → Decision Quality
- **Cause source:** `wearable_data.sleep_score` and/or `total_sleep_minutes` from prior night, bucketed into **Low / Mid / High** tiers vs the user's 30-day median.
- **Effect source:** Next-day morning `daily_checkins` (clarity, sharpness, confidence) + `brief_snapshots.score`.
- **Method:** Bucketed mean comparison. Show only the **largest tier-vs-baseline delta** (e.g., low-sleep nights).
- **Output:** `"Low-sleep nights (<6h) → PRS −18 pts (n=5)"`.

#### Lens D — Consecutive High-Load Days
- **Cause source:** Calendar load = sum(meeting minutes) per day. "High-load" = top-third of user's 30-day daily load.
- **Effect source:** PRS from `brief_snapshots`, plus `hrv` from `wearable_data`.
- **Method:** Detect runs of ≥2 consecutive high-load days. Compare PRS / HRV on day N+1 (day after the run) vs baseline. Recovery = days until PRS returns to ±5%.
- **Output:** `"3+ back-to-back heavy days → PRS −22 pts · 2-day recovery (n=3)"`.

---

### 5. Backend — New Edge Function `cause-effect-engine`

Create `supabase/functions/cause-effect-engine/index.ts`:
- **Auth:** Auth0 JWT via `verifyAuth0JWT` (mirrors `level-trend-calendar`).
- **Service-role** Supabase client.
- **Input:** `{ days?: 30 }` (default 30, max 90).
- **Reads:** `calendar_events`, `wearable_data`, `daily_checkins`, `brief_snapshots`, `behavior_logs`, `calendar_connections` (to gate Lens A/D when no calendar).
- **Computes** all 4 lenses with the gating rules above.
- **Returns:**
  ```ts
  {
    top: Finding | null,
    lensA: Finding[],
    lensB: Finding[],
    lensC: Finding[],
    lensD: Finding[],
    coverage: { hasCalendar, hasWearable, checkinCount, briefCount, wearableDayCount },
    generatedAt: string
  }
  ```
- **`Finding` shape:**
  ```ts
  { lens: 'A'|'B'|'C'|'D',
    cause: string,           // e.g. "Board reviews"
    effectSignal: string,    // e.g. "HRV"
    deltaPct: number,        // -14
    deltaAbs: number,        // -8 (ms / pts / tiers)
    baseline: number,        // 58
    observed: number,        // 50
    n: number,
    recoveryDays: number|null,
    direction: 'negative'|'positive',
    longText: string }       // for weekly email use only
  ```
- **DEV_MODE bypass:** mirror existing edge-function pattern; in DEV the client may call Supabase directly via `effectiveUserId = DEV_USER.id`.

---

### 6. Caching Layer — New Table `causality_findings`

Patterns are stable for ~24h, so cache to keep the Insights page snappy and reduce LLM-free compute.

Migration:
```sql
CREATE TABLE public.causality_findings (
  user_id text NOT NULL,
  computed_for_date date NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, computed_for_date)
);
ALTER TABLE public.causality_findings ENABLE ROW LEVEL SECURITY;
-- Deny-by-default: only service role writes/reads. Per mem://security/rls-auth0-access-protocol.
```
Edge function checks for today's row first; if missing, computes + inserts. Forced refresh via `?force=1`.

---

### 7. Frontend Wiring

- **Delete** `src/components/insights/CauseEffectInsights.tsx` (legacy duplicate).
- **Replace** `src/components/insights/CauseEffectPanel.tsx` → `PerformanceCausalityCard.tsx` (keep the old export name as a re-export shim so `Insights.tsx` import stays one-line).
- **New sub-components:**
  - `CausalityFindingRow.tsx` — the visual delta-bar row.
  - `CausalityLensSection.tsx` — collapsible lens with chevron, mirrors `Collapsible` usage in `PerformanceRhythmCard.tsx`.
- **Production fetch:** `supabase.functions.invoke('cause-effect-engine', { headers: { Authorization: \`Bearer ${token}\` } })`.
- **DEV fetch:** direct Supabase queries replicating the engine logic (same pattern as `PerformanceRhythmCard`'s DEV branch).

---

### 8. Empty / Honesty States

Per `mem://features/performance-readiness/data-honesty-standards`:
- **No calendar connected:** Lens A and D collapsed and labeled `"Connect calendar to unlock"`.
- **<5 wearable days:** Lens A and Lens C show `"Need 5+ wearable days — currently X"` instead of fake findings.
- **<7 check-ins:** Lens B shows `"Need 7+ check-ins — currently X"`.
- **No findings clear the gates:** the entire card collapses to a single line: `"Patterns are still forming — keep checking in."` (no fake findings, no "everything looks fine" filler).

---

### 9. Memory Updates

Create `mem/features/insights/performance-causality.md` documenting:
- The 5-gate CEO contract.
- The 4-lens taxonomy + which DB columns feed each.
- The `causality_findings` cache contract.
- The visual-row rendering rule (no paragraph findings).
- Forbidden inputs: coach signals, manually-typed wins, mood-only patterns without a measured effect.

Update `mem://index.md` to add this entry under **Features: Mastery & Performance**.

---

### 10. Files to Create / Edit / Delete

**Create:**
- `supabase/functions/cause-effect-engine/index.ts`
- `supabase/migrations/<timestamp>_causality_findings.sql`
- `src/components/insights/PerformanceCausalityCard.tsx`
- `src/components/insights/CausalityFindingRow.tsx`
- `src/components/insights/CausalityLensSection.tsx`
- `mem/features/insights/performance-causality.md`

**Edit:**
- `src/pages/Insights.tsx` — swap `<CauseEffectPanel />` for `<PerformanceCausalityCard />`.
- `mem/index.md` — register the new memory file.

**Delete:**
- `src/components/insights/CauseEffectInsights.tsx` (legacy unused duplicate).
- `src/components/insights/CauseEffectPanel.tsx` (replaced).

---

### 11. Validation Plan

1. Deploy `cause-effect-engine`; verify auth + service-role read paths via `supabase--curl_edge_functions`.
2. Run engine for the test user — assert at least Lens C (sleep→PRS) returns a finding given current data volume (10 wearable days, 35 briefs).
3. Confirm gating: temporarily set thresholds high to verify the card renders the honest empty state instead of garbage.
4. Confirm visual rows render correctly across viewports (target 0×801 mobile + desktop).
5. Confirm chevron behaviour matches `PerformanceRhythmCard` (Energy visible, others collapsed).
