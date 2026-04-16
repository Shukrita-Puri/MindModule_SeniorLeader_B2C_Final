

# Radical Visual Simplification: Typography & Progressive Disclosure

## Problem
The brief card and supporting UI use font sizes as small as **9px** throughout — unreadable on mobile iOS. CEOs need glance-and-act, not squinting. Current violations: `text-[9px]`, `text-[10px]`, `text-[11px]`, `text-[12px]` used extensively across the Performance Readiness Brief and global CSS utilities.

## Changes

### 1. Global Minimum Font Size Floor (`src/index.css`)
- Update typography scale classes: bump `typo-supporting` from 12px → 14px, `typo-lean-value` from 13px → 14px, `typo-section-label` from 11px → 12px (labels only exception at 12px minimum for uppercase tracking-wide text which reads larger)
- Add a global comment documenting the 14px minimum rule

### 2. Performance Readiness Brief (`src/components/home/DecisionReadinessBrief.tsx`)
**Every sub-14px instance gets bumped or restructured:**

| Current | Element | New Size |
|---------|---------|----------|
| `text-[9px]` | Eyebrow "Performance Readiness Brief" | `text-xs` (12px) — uppercase + tracking makes 12px read like 14px |
| `text-[9px]` | Time/date label | `text-xs` (12px) |
| `text-[9px]` | "Based on your signals" section label | `text-xs` (12px) |
| `text-[9px]` | "How to show up" section label | `text-xs` (12px) |
| `text-[9px]` | "Lean on" / "Watch for" labels | `text-xs` (12px) |
| `text-[9px]` | Source tags (· From coach etc.) | `text-[11px]` — minimum for inline annotation |
| `text-[9px]` | Data source footer | `text-xs` (12px) |
| `text-[9px]` | "Tap for raw numbers" | `text-xs` (12px) |
| `text-[9px]` | Qualifier text under chips | `text-[11px]` |
| `text-[10px]` | Signal chips | `text-xs` (12px) |
| `text-[10px]` | Calendar pills | `text-xs` (12px) |
| `text-[10px]` | Tier label "STRONG" | `text-xs` (12px) |
| `text-[10px]` | Raw numbers panel | `text-xs` (12px) |
| `text-[11px]` | Lean on / Watch for value text | `text-sm` (14px) |
| `text-[12px]` | Body copy | `text-sm` (14px) |
| `text-[16px]` | "/100" suffix | Keep as-is (already ≥14px) |
| `text-[17px]` | Phrase | Keep as-is |

**Chip flip hint** ("Tap a pill to see the number"): Remove the persistent hint text. Instead, add a subtle shimmer animation on the first chip on mount (1-time affordance) — or keep the text but at 12px.

### 3. Progressive Disclosure: Collapse "How to show up" by default
- Wrap the "How to show up" section (Lean on + Watch for + data sources) inside a `<Collapsible>` that defaults to **closed**
- Trigger label: "How to show up ›" — tapping expands the section
- This cuts ~40% of visible text on first glance, showing only: score → calendar → phrase → signal chips
- The existing "Tap for raw numbers" collapsible stays nested inside

### 4. ExecutiveHome hero text (`src/pages/ExecutiveHome.tsx`)
- Subheadline `text-[15px]` → `text-base` (16px) — meets floor

### 5. Sidebar / Navigation — already addressed in prior changes, no sub-14px violations remain

## Files Changed

| File | Change |
|------|--------|
| `src/components/home/DecisionReadinessBrief.tsx` | Bump all font sizes to floor; collapse "How to show up" section |
| `src/index.css` | Update typography scale classes |
| `src/pages/ExecutiveHome.tsx` | Bump subheadline to 16px |

## No Changes To
- Edge functions, database schema, RLS, scoring logic, LLM prompts
- Signal chip logic, color mapping, or data flow
- Sidebar, bottom nav, or any other page

