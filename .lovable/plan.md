

## Plan: v6.1 Refinement — Emotional Self-Declared Signal + Pattern-Aware Body Copy

Surgical addendum to the approved v6 plan. Same two-stage delivery. Same surgical scope.

---

### What changes

**1. Signal Coverage Matrix — add Emotional/Energy self-declared signal**

The `/daily-check-in` outcome already captures an emotional/energy state (e.g., "depleted", "managing", "peak"). Surface this explicitly as an **Emotional Self-Declared** signal in the prompt's signal block, separate from wearable-derived emotional proxies (HR elevated, HRV drop).

Used by:
- §2.14 **Decision Leakage Guard** — primary trigger when wearable is missing or weak
- Any rule needing emotional state confirmation (Veto Risk, Personal Friction Inference)

Triangulation hierarchy (tightened):
```
Emotional state = (wearable HR/HRV proxy) × (self-declared /daily-check-in outcome) × (calendar drain type)
```
If wearable is null, self-declared carries the load — never block the rule.

**2. §2.19 — Pattern-Aware Body Copy (Relevance-Gated)**

Body copy may now reference historical patterns when they are **directly relevant** to today's signal + today's calendar event. Reuses v5's existing pattern library (HRV-event correlations, recurring DOW outcomes, consecutive-day streaks — already computed by `compute-outer-readiness`).

**Pattern reference rule:**
> "Reference a past pattern ONLY when it sharpens today's directive. Generic pattern-dropping is forbidden. The pattern must connect to (a) today's signal AND (b) today's named event or context."

Examples (templates, not copy bank):
- ✅ Strong: `"HRV down 18%. Resilience compressed. Risk of Decision Leakage in the Town Hall — HR has spiked in your last 3 Town Halls."`
- ✅ Strong: `"Sharpness 2/5. Cognition narrow. Pattern: Tuesday mornings consistently low — front-load recovery before the 11 AM strategy review."`
- ❌ Weak (rejected): `"You've had low HRV before. Today is a Town Hall."` (no causal connection drawn)
- ❌ Weak (rejected): `"HRV down 18%. Your average week has 4 high-stakes events."` (irrelevant pattern)

**Validation addition:** if body cites a pattern, it must also cite (a) a today-signal AND (b) a today-context anchor. Otherwise reject pattern reference (body still passes if other criteria met).

**3. Proactive Framing — explicit in system prompt**

Add to the voice/persona block:
> "Your purpose is **proactive preparation**, not retrospective reporting. Every brief should help the leader walk into what's next more prepared than they would be without you."

This is a tone constraint, not a new validator — but it shapes how the LLM weights "what should I say" toward forward-looking directives.

---

### Updated deliverables

**Stage 1 doc (`Decision_Readiness_Brief_LLM_Prompt_v2.docx` — overwrite same file):**
- §Signal Coverage Matrix → add `Emotional/Energy Self-Declared` row, source: `/daily-check-in` outcome
- §2.14 Decision Leakage Guard → expand trigger to `(wearable emotional proxy OR self-declared depleted/managing) AND (emotional/diplomatic calendar drain)`
- §2.19 → add Pattern-Aware Body Copy subsection with relevance gate + examples
- §Voice block → add proactive-preparation tagline
- Appendix v5→v6 diff → append v6.1 delta line

**Stage 2 code (deferred until doc approved):**
- `=== KEY SIGNALS ===` block adds `emotionalSelfDeclared: <outcome label>` field
- `=== PATTERNS ===` block (already present in v5) gets explicit relevance-gate instruction in system prompt
- Decision Leakage Guard logic engine text updated to reflect dual-source trigger
- Body validator: if pattern-reference keywords detected ("previously", "pattern", "last", "consistently", "spiked in"), require co-occurrence of today-signal AND today-context anchor; else strip pattern claim or fail

**Untouched (still):** scoring, signal pills, calendar math, deterministic `getTheme()`, hook, client component, output JSON shape, all other edge functions, output contract.

---

### Confirmation gate
Approve → I regenerate Stage 1 doc with v6.1 additions baked in (same filename, supersedes current v2). After your sign-off, Stage 2 surgical code edit proceeds.

