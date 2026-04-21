

## Plan: Brief → Plan handoff CTA

### Problem
On `/executive-home`, after the Performance Readiness Brief renders (and especially after the user submits feedback), there is no signal that the actionable next step — the 3 prioritised practices derived from this Brief — lives at `/plan`. Users finish the Brief and stop there.

### Solution
Add a clear, executive-styled CTA at the bottom of the Brief card that hands the user off to `/plan`. The CTA appears in two states so it's discoverable without being pushy:

1. **Always-visible footer link** inside the Brief card, just under the "How to show up" section and above the feedback row:
   - Label: **"View today's 3 priorities →"**
   - Subtext underneath, smaller: **"Built from this brief"**
   - Right-aligned, taupe accent, executive minimal.
   - On click: `navigate('/plan')`.

2. **Post-feedback confirmation upgrade.** When `BriefFeedbackRow` flips to its `submitted` state, replace the current quiet `✓ Feedback noted` line with a slightly richer confirmation that nudges forward:
   - `✓ Noted — your 3 priorities are ready` rendered as a button-styled link to `/plan`.
   - Same animation, same compact footprint.

### Why this placement
- Inside the Brief card (not below it) so the cause-and-effect is unmistakable: *this brief → these priorities*.
- Footer slot keeps the Brief card visually intact; doesn't disrupt the existing "How to show up" / chip flow.
- Two surfaces — passive (always there) + reactive (after feedback) — covers both the user who scans and the user who engages.

### Files touched

| File | Change |
|---|---|
| `src/components/home/DecisionReadinessBrief.tsx` | Add `BriefToPlanHandoff` element above `BriefFeedbackRow` (always visible). Update `BriefFeedbackRow` submitted-state to render a clickable "Noted — your 3 priorities are ready →" linking to `/plan`. |

No DB, no edge function, no route changes. Pure presentation.

### Visual spec (executive minimal)

```text
…How to show up (collapsible)
─────────────────────────────────────────
                       View today's 3 priorities →
                       Built from this brief
─────────────────────────────────────────
                  Was this brief useful?  👍 ⚌ 👎
```

After submit:
```text
                  ✓ Noted — your 3 priorities are ready →
```

- Handoff link: `text-[13px] font-body text-taupe-foreground/90 hover:text-taupe-foreground`, arrow uses subtle translate-x on hover.
- Subtext: `text-[10px] uppercase tracking-[0.08em] text-muted-foreground/45`.
- Submitted-state link: same taupe tone, inline `Check` icon, matches existing `text-[11px]` cadence so the row height doesn't jump.

### Verification

1. Load `/executive-home`. Brief card shows new "View today's 3 priorities →" footer link with "Built from this brief" subtext.
2. Click it → routes to `/plan`.
3. Submit brief feedback (👍 / ⚌ / 👎 → Send). Submitted row now reads "✓ Noted — your 3 priorities are ready →". Click → routes to `/plan`.
4. Refresh `/executive-home` after feedback was submitted — submitted-state link is still present and still routes to `/plan`.
5. Mobile (375px): handoff link wraps cleanly, no overflow, taps comfortable (≥32px hit area).
6. Regression: `/plan` page itself, the inner feedback modal, and the `entryRoute` flow are untouched.

### Out of scope

- Changing the Brief content, signals, or any edge function logic.
- Persistent banner/toast outside the Brief card.
- Auto-navigating after feedback (rejected — too aggressive for executive UX).

