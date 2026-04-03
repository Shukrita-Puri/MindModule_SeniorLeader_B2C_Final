

# Four-Part UX Improvement Plan

## 1. Button Colour Strategy — Define Clear Roles

**Current problem**: The app uses `critical` (saffron/orange), `default` (taupe gradient), `secondary` (glass white), `outline`, `ghost`, `forest` (green), and `glass` variants inconsistently. Primary CTAs, onboarding actions, and secondary actions all use the same saffron orange.

**Proposed colour role system** (using existing palette — no new colours):

| Role | Variant | Colour | Usage |
|------|---------|--------|-------|
| **Primary CTA** | `critical` (saffron) | Orange #FF8C42 | One per screen. The single most important action: "Let's Go", "Start Sequence", "Unlock", payment CTAs |
| **Standard Action** | `default` (taupe gradient) | Warm taupe | Secondary buttons, "Continue", navigation actions, form submits |
| **Tertiary / Ghost** | `outline` or `ghost` | Transparent + border | "Skip", "Cancel", "Update anyway", low-priority actions |
| **Contextual Accent** | `forest` (green) | Kairos green | Active states, success confirmations, toggle-on states |
| **Destructive** | `destructive` | Red | Delete, sign out confirmations |

**Files to change**: Audit all `variant="critical"` usages. Keep `critical` only for the single hero CTA per screen (landing "Let's Go", onboarding "Let's begin", payment "Start Trial"). Downgrade mid-flow "Continue" buttons (e.g., Stage7ContextConnection, Stage7GrowthIntention) to `default`.

---

## 2. Landing Page — Add Breathing Room

**Current state** (Front.tsx): Logo, brand name, "Executive Edition", tagline, CTA, login link, and privacy footer are all stacked tightly in a single column.

**Changes**:
- Increase vertical spacing between the brand block and the tagline (`mt-6` → `mt-10 sm:mt-8`)
- Add more space between tagline and CTA buttons (`mt-auto` stays, but add `gap-5` instead of `gap-3`)
- Increase the gold divider margin (`mb-2` → `mb-4`)
- Give the privacy footer more top breathing room (`pt-2` → `pt-6`)
- Slightly reduce the "Executive Edition" subtitle density (increase letter-spacing)
- On mobile, nudge the top content block down slightly more so the illustration has more visual presence

Net effect: same content, more whitespace between sections, feels calmer. No content removed.

**File**: `src/pages/Front.tsx` — spacing class adjustments only.

---

## 3. Daily Check-In Cards — Make Them Obviously Tappable

**Current problem**: The five state cards look like a passive carousel. Users scroll but don't realise tapping selects a state.

**Proposed solution**:
- Add a clear instruction line above the carousel: **"Tap your state to begin"** in muted text
- Add a subtle pulsing ring/glow on the active (centred) card to signal interactivity
- Add a small "Tap to select" label at the bottom of the active card (appears only on the centred card)
- Keep the existing gradient colours exactly as-is (they map to the Week at a Glance heatmap)

**File**: `src/pages/DailyCheckIn.tsx` — add instruction text, add conditional label on active card, add a subtle `ring-2 ring-white/40 animate-pulse` to the active card.

---

## 4. Tour Restart — Add a "Retake Tour" Option

**Current problem**: If a user dismisses the tour, there's no way to restart it.

**Proposed placement**: Add a "Retake Tour" menu item in the **UserSettingsPopover** (sidebar footer profile menu) — this is where Profile, Upgrade, Refer, and Sign Out already live. It's discoverable but not intrusive.

**Behaviour**:
- Clicking "Retake Tour" sets `sessionStorage` flags to restart the tour, then navigates to `/daily-check-in` (where the tour begins)
- Does NOT reset the DB `first_session_walkthrough_at` — that stays as-is; the sessionStorage flag overrides it for one session
- Uses a simple "compass" or "map" icon to signal guidance

**File**: `src/components/navigation/UserSettingsPopover.tsx` — add one menu item before "Sign Out".

---

## Technical Summary

| File | Change Type |
|------|-------------|
| `src/components/ui/button.tsx` | No changes needed — variants already defined |
| `src/pages/Front.tsx` | Spacing class adjustments |
| `src/pages/onboarding/stages/Stage7ContextConnection.tsx` | `variant="critical"` → `variant="default"` |
| `src/pages/onboarding/stages/Stage7GrowthIntention.tsx` | `variant="critical"` → `variant="default"` |
| `src/pages/DailyCheckIn.tsx` | Add instruction text + active card tap affordance |
| `src/components/navigation/UserSettingsPopover.tsx` | Add "Retake Tour" menu item |

All changes are CSS/copy/component-level. No database migrations. No edge function changes. Build-safe.

