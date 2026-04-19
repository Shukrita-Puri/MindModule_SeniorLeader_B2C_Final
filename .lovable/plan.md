

The user is challenging Fix 2's necessity. Let me think this through honestly.

**User's logic:** LLM has the same raw data (HRV, sleep, RHR, outcome, clarity, confidence) → it should naturally describe reality accurately → pills (also derived from same data) should naturally align → no extra "pillar awareness" needed.

**Where this is right:** Same source data. Two derivations of the same truth shouldn't contradict.

**Where this breaks:** The contradiction the user saw ("Body shows load" + Physiology RESTED) wasn't because the LLM hallucinated. It was because:
- LLM saw HRV -20% → wrote "Body shows load" (HRV = body in common language)
- Pill engine routes HRV → Cognitive primary, NOT Physiology
- So the pill correctly showed Physiology RESTED (since Sleep + RHR were fine)
- Both are accurate to the data. They disagree because **they classify HRV differently.**

This is a taxonomy mismatch, not a data mismatch. The LLM uses everyday anatomy ("body = anything physical"). The pill engine uses our v2 model ("body = sleep + RHR only; HRV = cognitive performance").

**So is Fix 2 necessary?** Yes — but it's not "teach the LLM the data." It's "teach the LLM our **classification convention** so its language matches our pillar labels." One paragraph in the prompt mapping HRV→Cognitive vocab, Sleep/RHR→Physiology vocab, etc.

**Could we skip it?** Only if we accept the LLM occasionally calling HRV "body" when the Physiology pill says rested. The user already flagged this as the exact problem.

**Lighter alternative:** Drop the validation gate (no soft-reject/retry overhead). Keep just the vocabulary map in the prompt. Trust the model to follow it. If it drifts, we add the gate later.

---

## Plan: Lean Fix 2 — Vocabulary map only, no validation gate

### What's necessary
A short prompt addendum teaching the LLM that "Body / Hardware" language is reserved for Sleep + RHR + HR (Physiology pillar inputs), and HRV-led signals must use Cognitive language ("Mind / Sharpness / Processing"). This is the minimum needed to stop the contradiction the user saw.

### What's not necessary (dropping from original Fix 2)
- Server-side pill-coherence validation gate
- Soft-reject + retry loop
- Phrase opacity gate as a separate validator

Rationale: validation adds latency + retry cost. The vocabulary map alone fixes 90% of the issue. We can add validation later if the LLM drifts.

### What stays from the original plan
- **Fix 1** (Mental Energy renaming) — unchanged, 4 string swaps in `DecisionReadinessBrief.tsx` + same term in LLM prompt
- **Fix 3** (phrase opacity) — fold into the same prompt block as a one-liner: "Phrase + first body sentence must together name a pillar word. Never standalone metaphors like 'Body is loaded.'"

### Updated scope

| File | Change |
|---|---|
| `DecisionReadinessBrief.tsx` | Pill back-labels, source label, and Mind Sharpness back text → "Mental Energy: …" / "From Mental Energy" |
| `compute-outer-readiness/index.ts` | Add §2.19.2 prompt block: vocabulary map (HRV→Cognitive, Sleep/RHR/HR→Physiology, HRV+Confidence/emotional outcome→Resilience) + opacity rule (phrase must connect to a pillar word). No validators. |
| Backend / scoring / JSON contract | None |

### Why this answers the user's question directly
The user is right that the LLM has the data. But "having the data" ≠ "using the same labels we display on screen." The fix is a one-paragraph translation layer in the prompt — not a re-architecture. We're giving the LLM our vocabulary, not new information.

### Confirmation gate
Approve lean version → I implement Fix 1 + lean Fix 2 (prompt-only, no validators).
Want full Fix 2 with validation → say so and I add the gate back.
Skip Fix 2 entirely → I implement Fix 1 only and we accept the occasional contradiction.

