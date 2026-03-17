

## Copy Updates — Front Page + Onboarding Welcome

Two files need text-only changes (no layout or UI modifications).

---

### File 1: `src/pages/Front.tsx`

**Line 84-86** — Hero title: keep "MIND MODULE" as-is (already correct)

**Line 87-89** — Subtitle: keep "Executive Edition" as-is (already correct)

**Lines 92-96** — Replace tagline h2:
- From: "The World's First Proactive Performance System For Your Inner Game. Built for Leaders, By Leaders."
- To: "A New Inner Operating System for Leaders."

**Lines 102-107** — Replace description + motto:
- From: "It understands your day, learns your patterns..." + "Calibrate. Clarify. Renew."
- To: "It understands your day. Learns your patterns. Prepares how you show up before the stakes arrive." + "Built by leaders. For leaders."

**Line 111** — CTA button text:
- From: "Begin Your Journey"
- To: "Let's Go"

**Lines 121-131** — Privacy badge: simplify to just "Privacy by Design" (remove the Lock/Local-First item, keep Shield icon only)

---

### File 2: `src/pages/onboarding/stages/Stage1Welcome.tsx`

**Lines 17-24** — Replace header block:
- From: "Welcome to MIND MODULE" + "Proactive Self Mastery for Peak Performers"
- To: "Welcome to MIND MODULE" (keep) — remove the subtitle h2 entirely

**Lines 26-30** — Replace the glass card body. New copy (structured with visual breaks):
1. Opening hook: "Most leaders don't fail because they lack strategy." then "They fail because they showed up scattered. Ruminated instead of deciding. Burned out when it mattered most."
2. Transition: "This system changes that." + "Three minutes. Five questions."
3. Profile areas intro: "Your answers build your performance profile across three areas:" then three labeled items — RECALIBRATE, CLARITY, RENEWAL with their descriptions
4. Personalization list: "Everything personalizes from this:" then four items (Daily Brief, Proactive Mastery Plan, AI Coach, Just-In-Time Prep)
5. Closing: "The more honest you are, the smarter the system gets."

**Line 51** — CTA button text:
- From: "Begin"
- To: "Start Questions"

**Lines 33-43** — Privacy footer: simplify to just "Privacy by Design" (single line, no Lock icon)

---

**Files changed:** 2 (`Front.tsx`, `Stage1Welcome.tsx`). No logic, routing, or component changes.

