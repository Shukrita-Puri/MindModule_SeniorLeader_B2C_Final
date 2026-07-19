# Persist Week Ahead "saved" confirmation across refreshes

## Problem
`WeekAheadPriorities.tsx` holds `saved` in local state and resets it to `false` on every mount (line 156 in `load()`). After a refresh the user sees the "Save Week Ahead Priorities" CTA again — even though their Star/Cancel/Never selections did rehydrate from the server — making it feel like the save didn't stick.

## Fix (UI-only, no backend change)
Persist a lightweight "confirmed for this ISO week" marker in `localStorage` and rehydrate `saved` from it on load. Selections themselves already persist server-side via `event_priority_memory` and rehydrate through `priorSignal` — this change only restores the *confirmation receipt* UI state.

### Changes in `src/components/home/WeekAheadPriorities.tsx`

1. Add a small helper at module scope:
   ```ts
   const SAVED_KEY_PREFIX = "mm.weekAhead.saved.";
   const isoWeekKey = (d = new Date()) => {
     // YYYY-Www of the target planning week (current week's Mon..Sun)
     const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
     const day = t.getUTCDay() || 7;
     t.setUTCDate(t.getUTCDate() + 4 - day);
     const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
     const week = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
     return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
   };
   ```
2. In `load()`, after `setDecisions(hydrated)`, replace `setSaved(false)` with:
   ```ts
   const wasSaved =
     Object.keys(hydrated).length > 0 &&
     typeof window !== "undefined" &&
     window.localStorage.getItem(SAVED_KEY_PREFIX + isoWeekKey()) === "1";
   setSaved(wasSaved);
   ```
   (Gated on `hydrated` having at least one decision so a stale marker from a prior week with no signals doesn't produce a misleading banner.)
3. In `handleSave()`, right after `setSaved(true)`, write the marker:
   ```ts
   try { window.localStorage.setItem(SAVED_KEY_PREFIX + isoWeekKey(), "1"); } catch {}
   ```
4. In `recordSignal()`, when the user edits after saving (existing `setSaved(false)` on line 182), also clear the marker so the CTA correctly reappears until they re-confirm:
   ```ts
   try { window.localStorage.removeItem(SAVED_KEY_PREFIX + isoWeekKey()); } catch {}
   ```

### Behaviour after change
- User saves → banner shows, marker written for this ISO week.
- User refreshes same week → decisions rehydrate from server, marker read from localStorage, banner shows again (no CTA nag).
- User edits any Star/Cancel/Never after refresh → banner hides, CTA returns, marker cleared. Re-saving re-writes the marker.
- New ISO week → different key, marker naturally absent, CTA shows as intended for the new planning cycle.

### Out of scope
- No edge-function change, no schema change, no change to `record-event-priority-signal` or `list-week-ahead-priorities`.
- Not cross-device: the "confirmation" is a UX receipt, so per-browser localStorage is acceptable. If you want it cross-device later, we can persist a per-user/per-week flag on the server (small follow-up), but it isn't needed for the reported issue.

### Validation
- Extend `src/components/home/__tests__/WeekAheadPriorities.test.tsx` (or the existing test file) with two cases:
  1. After clicking Save, remount the component with the same mocked `list-week-ahead-priorities` response — banner should render without another click.
  2. After remount with the saved marker present, changing a decision hides the banner and re-shows the CTA.
