

# Side Panel Recent Activity: 3 Changes

## 1. Remove Coach Sessions
Delete the entire coach sessions fetch block from `useRecentActivity.ts` and remove coach-related icon/navigation from `RecentActivity.tsx`.

## 2. Rename Check-in → Assessment with Clarity & Confidence
**Title format**: `Assessment: Focused, High Clarity, Low Confidence`

**Edge function change required**: The `GET_RECENT_CHECKINS` action in `supabase/functions/daily-checkins/index.ts` currently only selects `id, checkin_date, outcome, energy_balance`. We need to add `clarity_level, confidence_level` to the select so the client can build the full title.

**Client formatting logic** in `useRecentActivity.ts`:
- Capitalise outcome
- If clarity_level exists: append `, ${clarity >= 4 ? 'High' : clarity <= 2 ? 'Low' : 'Moderate'} Clarity`
- Same pattern for confidence_level
- Example: `Assessment: Focused, High Clarity, Low Confidence`

## 3. Add Brief Views (Brief: {Phrase})
**Track brief views**: In `ExecutiveHome.tsx`, when the brief phrase is available, call `trackEngagement` with `event_type: 'brief_view'` and store the phrase in `metadata.phrase`. Uses a `useEffect` that fires once per phrase load (deduplicated by a ref).

**Fetch in Recent Activity**: Add a new fetch in `useRecentActivity.ts` using the existing `user-events` EF with `GET_ENGAGEMENTS` action (last 30 days), filter client-side for `event_type === 'brief_view'`, and display as `Brief: {metadata.phrase}` (truncated). Icon: `FileText` from lucide.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/daily-checkins/index.ts` | Add `clarity_level, confidence_level` to GET_RECENT_CHECKINS select |
| `src/hooks/useRecentActivity.ts` | Remove coach block, rename checkin→assessment with clarity/confidence labels, add brief fetch |
| `src/components/navigation/RecentActivity.tsx` | Update types, icons, navigation handlers |
| `src/pages/ExecutiveHome.tsx` | Track brief view with phrase metadata |
| `src/utils/engagementTracking.ts` | Add `trackBriefView(phrase)` helper |

## No Changes To
- LLM prompts, scoring logic, RLS policies, database schema
- Coach route/page (preserved, just hidden from nav already)
- Bottom nav, any other page component

