

## Connected Data Page Redesign + Profile Menu Reorder

### Current Issues
1. **No actual logos** — uses Lucide icons instead of Google Calendar / Apple Watch brand logos
2. **No disconnect/remove option** — connected items show a static "Connected" button with no way to remove
3. **Connect buttons are dead** — they either navigate to onboarding or do nothing (Apple Watch has no `onConnect`)
4. **Profile settings order** — "Upgrade to Pro" is after profile card; needs reordering and renaming
5. **No 3-dot menu** for connected items (like Claude's connector pattern)

### Plan

#### 1. Add brand logos to `public/images/`
- Google Calendar logo (SVG inline or from a CDN-safe URL)
- Apple Watch / Apple Health logo (SVG inline)
- Since we can't download external assets easily, we'll use inline SVG components for both logos within the ConnectedData page

#### 2. Rewrite `ConnectedData.tsx`
- **Remove** the info card ("Why connect your data?") — user asked to simplify
- **Remove** the privacy paragraph — replace with a simple "Privacy Policy" text link
- Each connector card shows:
  - Brand logo (not icon) on the left
  - Name + description
  - If **not connected**: "Connect" button that triggers the actual OAuth flow (Google Calendar) or HealthKit request (Apple Watch)
  - If **connected**: last sync info + a 3-dot menu (`DropdownMenu`) with "Remove" option
- **Google Calendar connect**: Reuse `CalendarConnectionSettings`'s `handleConnect('google')` logic — call `calendar-auth` EF directly
- **Apple Watch connect**: Call `requestHealthKitPermissions()` from `healthKitCapacitor.ts` on native; on web show an info toast that it requires the native app

#### 3. Reorder Profile.tsx settings section
- Rename "Upgrade to Pro" / "Manage Subscription" → "Upgrade Plan" (for non-paying users)
- Move order to: **Profile card → Account Details → Settings** where Settings list is:
  1. Upgrade Plan (only if user is NOT on monthly_pro or annual_pro, links to `/onboarding/payment`)
  2. Connected Data Sources
  3. Privacy & Security
  4. Refer to Friends (add this — currently missing from profile settings)
  5. Sign Out (add this — currently missing from profile settings)
- For paying users: show "Manage Plan" instead, linking to Stripe portal

#### 4. Critical bugs identified
- **Apple Watch "Connect" button does nothing on web** — no `onConnect` handler defined. Fix: add handler that calls HealthKit on native or shows informational message on web
- **Google Calendar connect navigates to onboarding** instead of triggering OAuth directly — Fix: call `calendar-auth` EF inline
- **No disconnect flow for Apple Watch** — need to clear `wearable_data` or mark inactive. For MVP: clear localStorage wearable prefs + toast confirmation

### Files to modify
| File | Change |
|------|--------|
| `src/pages/ConnectedData.tsx` | Full rewrite: brand logos, working connect/disconnect, 3-dot menu, simplified privacy link |
| `src/pages/Profile.tsx` | Reorder settings, rename upgrade button, add Refer + Sign Out links, conditional upgrade vs manage |

### Technical Details
- Google Calendar logo: inline SVG component (the colored calendar "31" icon)
- Apple logo: inline SVG component (Apple symbol)
- 3-dot menu: use existing `DropdownMenu` from radix (`@radix-ui/react-dropdown-menu`)
- Calendar disconnect: call `supabase.functions.invoke('calendar-auth', { body: { action: 'disconnect', provider } })`
- Apple Watch disconnect: clear localStorage `contextConnections` wearable state + toast
- Sign out: call `useAuth().logout()`

