## Goal

Make `/connected-data` look and feel like `/onboarding/permissions` (parchment shell, art band, serif title, rounded provider cards with logo + name + note), while preserving all current behaviour — including connect, reconnect, disconnect, manual sync, last-synced timestamps, status pills, and the self-check-ins toggle.

No backend, edge function, or service changes. UI/presentation only.

## Scope

In:
- `src/pages/ConnectedData.tsx` — replace the current `UnifiedTopBar` + dark-card layout with the parchment shell and provider-card style used by onboarding. Keep all existing state, handlers, OAuth callback logic, debug panel, and Auth0/Supabase calls untouched.
- `src/components/connections/ProviderRowCard.tsx` (new) — shared parchment-styled provider row used by `/connected-data`. Includes logo + name + note (left), status pill + last-synced + action menu (right).

Out:
- `StagePermissions.tsx`, `ConnectionsPanel.tsx`, `CalendarProviderPicker`, `WearableProviderPicker`, `StageConnections.tsx` — untouched. Onboarding keeps its existing surfaces.
- Edge functions, sync services, RLS, hooks, telemetry.

## Visual spec (mirrors StagePermissions)

- Outer shell: reuse `ParchScreen` from `src/pages/onboarding/stages/v8/ShellV8.tsx`. Because `ParchScreen` is `fixed inset-0`, on `/connected-data` we keep app chrome by NOT importing `ParchScreen` directly. Instead, replicate its visual tokens locally in `ConnectedData.tsx`:
  - Page background `bg-[#f5f0e8]`, body text `text-[#1a1712]`.
  - Top art band (`usp-sunrise-engraved.jpg`, h-[140px], parchment scrim) with step label `CONNECTIONS` and serif title `Manage your connected data`.
  - Body content in `px-5 py-4` with `space-y-5`.
  - Section headers: `text-[10px] tracking-[2px] uppercase text-[#7a7060] font-medium` (e.g. `Calendar`, `Wearable`, `Preferences`).
- Provider row (`ProviderRowCard`):
  - Container: `flex items-center justify-between gap-3 p-3.5 rounded-[14px] border mb-2 transition-colors`. Border/bg by state:
    - connected → `border-[#1a1712]/35 bg-[#1a1712]/[0.04]`
    - needs-reconnect → `border-[#e8714a]/50 bg-[#e8714a]/[0.04]`
    - disconnected → `border-[#cfc7b8] bg-white`
  - Left: 36×36 logo `rounded-[10px] bg-white p-1 border border-[#cfc7b8]`. Title `text-[13px] font-medium text-[#1a1712]`. Subtitle `text-[11px] text-[#7a7060]` showing either the provider note (when disconnected) or `Last synced {relative}` (when connected). Tiny `text-[10px] text-[#e8714a]` line below when reconnect is needed or there's an error.
  - Right: primary action button + overflow menu.
    - Disconnected: parchment outline button `Connect` (`px-3 h-8 rounded-full border border-[#1a1712]/35 text-[12px] font-medium text-[#1a1712] hover:bg-[#1a1712]/[0.06]`). Shows `Connecting…` spinner when busy.
    - Connected: small icon `Sync` button (refresh icon, same outline pill style). Tap → existing manual-sync handler. While syncing, spin and disable.
    - Connected/error: overflow `MoreVertical` opens the existing `DropdownMenu` with `Sync now`, `Reconnect`, `Disconnect`. Coral `Reconnect` highlight when `needsReconnect`.
- Self-check-ins toggle: parchment card identical to onboarding rows, with the `Switch` replaced by the same coral pill toggle used in `StagePermissions` for visual consistency. Reuses the existing `handleToggleSelfCheckIns` handler.
- Debug panel (`AppleIntegrationsDebugPanel`) and QA helpers: keep mounted, just place them inside a collapsible `details` block at the bottom of the body so they don't break the aesthetic.

## Behaviour preserved

- All handlers stay: `triggerCalendarSync`, `syncHealthKitToBackend`, `startOuraOAuth`, `triggerOuraSync`, `requestHealthKitPermissions`, `verifyHealthKitAccess`, `disconnectAppleHealthFromBackend`, Apple Calendar permission flow, `forceNativeCalendarSync`, OAuth callback handling, online-retry of pending disconnects, app-resume refresh.
- Status source unchanged (`check-connections-status`). Last-synced uses `formatDistanceToNowStrict(parseISO(lastSync), { addSuffix: true })` with a tooltip showing `format(..., 'PP p')`.
- Toast notifications, error states, and the `self_check_ins_enabled` update logic are unchanged.

## Files touched

```
src/components/connections/ProviderRowCard.tsx   (new, presentational only)
src/pages/ConnectedData.tsx                       (refactor render layer; no logic changes)
```

## Out of scope / non-goals

- No edge function or DB changes.
- No change to onboarding flow.
- No change to `ConnectionsPanel` (still used by onboarding StageConnections).
- No change to provider picker components.

## Validation

- TS compiles.
- Manually verify on `/connected-data`:
  - First load: parchment background, art band, serif title, section headers, provider rows.
  - Connected row shows last-synced relative time + `Sync now` works (spinner state, toast).
  - Disconnect → row flips to white/disconnected state with `Connect` CTA.
  - Reconnect-needed state renders coral border + `Reconnect` action highlighted.
  - Self-check-ins toggle persists across reload.
  - OAuth callback (`?calendar_connected=true`) still runs post-connect sync.
  - Debug panel still accessible behind `Details`.
