

## Full Audit: Time Accuracy and Per-Step Timestamp Design

### Time Adequacy Assessment for Senior Executives

Evaluated each practice asking: "Does a time-strapped C-suite leader have enough time to think, process, and act within the allocated duration — without feeling rushed?"

#### PAUSE (Somatic Protocols)

| Practice | Total | Steps | Assessment |
|---|---|---|---|
| **Fudōshin** | 1.5 min | 30+30+30 | **Adequate** — each step is a single physical action (ground feet, soften eyes, declare). 30 sec is right for somatic cues. |
| **Eye of Storm** | 2 min | 30+45+30+15 | **Adequate** — cognitive triage. Step 4 at 15 sec is just stating one sentence. |
| **Presence Grounding** | 1.5 min | 30+30+30 | **Adequate** — each step is one simple awareness shift. |
| **Release Exhale** | 1.5 min | 30+40+20 | **Adequate** — Step 2 is 3 breath cycles (4-in, 8-out = 12 sec × 3 = 36 sec). Math checks out. |
| **Stillness Gap** | 2 min | 40+60+20 | **Tight** — Step 2 asks execs to find silence between thoughts for 60 sec. Challenging for racing minds. But acceptable as a micro-practice entry point. |
| **Detachment Observer** | 2 min | 40+40+40 | **Tight** — Step 2 (separating fact from story) requires real cognitive work. Could benefit from 50-60 sec. But works as-is. |
| **Softness Release** | 2 min | 40+40+40 | **Adequate** — physical release in Step 3 anchors the pace. |

#### POWER-UP (Mindset Protocols)

| Practice | Total | Steps | Assessment |
|---|---|---|---|
| **Buddhist Phoenix** | 3 min | 40+50+40+40 | **Adequate** — Step 2 (finding what failure revealed) is the deepest and gets the most time. |
| **Energy Reframe** | 1.5 min | 30+30+30 | **Adequate** — each step is a single question/reframe. |
| **Courage Future Self** | 3 min | 45+45+45+45 | **Slightly tight** — Step 1 asks to visualize future self (45 sec is fast for deep imagination). Could be 4 min total. But acceptable. |
| **Confidence Evidence** | 2 min | 40+40+40 | **Adequate** — recalling wins is quick for experienced leaders. |
| **Energy Completion** | 2 min | 45+60+15 | **Tight** — Step 1 brain dump at 45 sec is fast if someone has 15+ open loops. Step 2 triaging at 60 sec is also tight. Could benefit from 3 min total. |
| **Courage Arena** | 2 min | 40+40+40 | **Adequate** — each step is one declaration. |

#### PRESENCE/FLOW (Mindset Protocols)

| Practice | Total | Steps | Assessment |
|---|---|---|---|
| **Single Thread** | 2 min | 30+30+30+30 | **Adequate** — environmental setup steps are quick declarations. |
| **First Move** | 1.5 min | 30+30+30 | **Adequate** — anti-procrastination. Steps are deliberately tiny. |
| **Depth Subtraction** | 2 min | 30+45+30+15 | **Tight** — Step 1 (list demands) at 30 sec is very fast. Step 2 (eliminate) at 45 sec is tight. Could benefit from 2.5 min. |
| **Eternal Now** | 1.5 min | 30+30+30 | **Adequate** — simple presence anchors. |
| **Rhythm Pulse** | 2 min | 30+45+30+15 | **Adequate** — designing work rhythm is a clear decision. |
| **Mastery Constraint** | 2.5 min | 40+50+40+40 | **Adequate** — close to actual sum of 2.8 min. |
| **Wu Wei** | 2 min | 30+10+1min+ongoing | **Adequate** — Steps 3-4 flow into action. |
| **Mushin** | 1 min | 15+5+moment+ongoing | **Adequate** — designed for pre-performance, deliberately ultra-short. |
| **Jobs Simplicity** | 2 min | 0.5min+10sec+ongoing+end-of-day | **Adequate** — timed portion is ~40 sec, rest is ongoing application. |
| **Ikigai** | 3 min | 2min+30sec+ongoing+weekly | **Adequate** — Step 1 gets generous 2 min for meaning-connection. |
| **Stoic Reflection** | 10 min | 2+2+2+2+2 | **Adequate** — ample time per reflection step. |

### Summary: Practices That Could Benefit From More Time

These 3 are slightly tight for executive cognitive processing but are acceptable as micro-practices:

| Practice | Current | Suggested | Reason |
|---|---|---|---|
| Energy Completion | 2 min | 3 min | Brain dump + triage of 10+ items in 105 sec is fast |
| Depth Subtraction | 2 min | 2.5 min | Listing + eliminating demands needs breathing room |
| Courage Future Self | 3 min | 3.5 min | Deep visualization in 45 sec is ambitious |

**Recommendation**: These are borderline. They work as "micro" practices. If users report feeling rushed, bump them up. No urgent fix needed now.

---

### Design Question: Should Each Step Card Show a Timestamp?

**Current state**: Every step card displays a duration badge (e.g., "30 sec", "40 sec", "ongoing").

**Analysis for senior executives**:

**Arguments against per-step timestamps**:
1. **Creates pressure** — A visible "30 sec" counter turns a calming practice into a timed test. Executives already live under time pressure. The practice should feel like relief from that, not more of it.
2. **Counter to mindfulness intent** — Especially for Pause/Presence practices (grounding, stillness, release), clock-watching disrupts the very state the practice is trying to create.
3. **Inconsistent values** — Many steps already say "ongoing", "moment of action", "end of day", "weekly" — these aren't timestamps, they're context cues. Mixing "40 sec" with "ongoing" on the same cards is confusing.
4. **Best-in-class apps don't do this** — Headspace, Calm, Waking Up show total duration upfront but never per-step timers. The guide paces you, you don't pace yourself.
5. **The overview card already sets time expectations** — Executives see "2 min" on the overview. That's enough information to decide if they have time.

**Arguments for keeping them**:
1. Executives want to know total time commitment (already handled by overview card)
2. Helps self-pacing if no audio guide exists

**Recommendation**: **Remove per-step timestamps from step cards. Keep the total duration on the overview card only.**

The overview card gives the executive the time commitment info they need to say "yes" to the practice. Once they're in, the steps should flow without a clock. The step number badge (①, ②, ③) already communicates progress and pacing.

### Implementation Plan

**File**: `src/pages/MicroPracticePlayerCards.tsx`

1. In the step card rendering section (~line 2151-2281), remove the duration badge display from step cards. The data can keep `duration` for internal reference, but the UI won't show it on step cards.
2. Keep the duration badge visible on overview cards (no change there).
3. This is a template-level change — affects all card-based practices at once.

No data file changes needed. No content changes. Just hide the duration display on step card UI.

