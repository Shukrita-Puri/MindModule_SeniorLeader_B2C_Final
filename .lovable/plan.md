

# Fix Google Calendar OAuth and Apple Watch HealthKit Integration

## Problems Identified

1. **Google Calendar OAuth redirect is broken**: After Google OAuth completes, the edge function redirects to a hardcoded fallback URL (`https://ibrvatszexahdqwejahc.lovable.app`) from an old project. The `FRONTEND_URL` secret needs updating to the correct preview URL. Also, the redirect always goes to `/onboarding/context-connection` even when connecting from Settings.

2. **Apple Watch toggle is a placeholder**: It just saves a preference and shows a toast. Since you have the mobile app built with HealthKit, it should attempt to request HealthKit permissions via the Capacitor plugin when running natively.

3. **No Capacitor dependency in the codebase**: The `@capacitor/core` and `@perfood/capacitor-healthkit` packages are not installed in the project. HealthKit integration code needs to gracefully detect whether it's running in a native context.

---

## Plan

### 1. Update FRONTEND_URL Secret
- Update the `FRONTEND_URL` secret to `https://id-preview--eb63fb97-dcc8-4fc5-8148-517646438c6d.lovable.app` (the current preview URL).

### 2. Fix Calendar OAuth Redirect (Edge Function)
**File: `supabase/functions/calendar-auth/index.ts`**

- **Pass a `redirect_path` in the OAuth state** so the callback knows where to send the user back (onboarding vs settings).
- Change the state parameter from just `authenticatedUserId` to a JSON-encoded object: `{ userId, redirectPath }`.
- In the callback handler, parse the state to extract both `userId` and `redirectPath`.
- Use `redirectPath` (defaulting to `/onboarding/context-connection`) when building the final redirect URL.
- Keep `FRONTEND_URL` env var usage (no more hardcoded fallback to old domain).

### 3. Pass Redirect Context from Frontend
**Files: `src/pages/onboarding/stages/Stage7ContextConnection.tsx`, `src/components/CalendarConnectionSettings.tsx`**

- When calling the `calendar-auth` edge function with `action: 'connect'`, include a `redirectPath` in the body (e.g., `/onboarding/context-connection` from onboarding, `/settings` or `/connected-data` from settings).
- The edge function will encode this into the OAuth state.

### 4. Handle `calendar_connected` Query Param
**File: `src/pages/onboarding/stages/Stage7ContextConnection.tsx`**

- On mount, check for `?calendar_connected=true` in URL params.
- If present, set `calendarEnabled` to true, show a success toast, and clean the URL.

### 5. Apple Watch / HealthKit Toggle
**File: `src/utils/healthKitCapacitor.ts` (new)**

- Create a utility that dynamically imports `@perfood/capacitor-healthkit` (try/catch for web).
- Export `requestHealthKitPermissions()` -- requests read access to HRV, Resting HR, Sleep Analysis, Active Energy, Steps; and write access for Mindful Sessions.
- Export `isNativeApp()` -- checks if running in Capacitor context via `window.Capacitor?.isNativePlatform`.
- Export `queryHealthKitData()` -- reads latest HRV, resting HR, and sleep data and returns a `HealthKitWearableData` object.

**File: `src/pages/onboarding/stages/Stage7ContextConnection.tsx`**

- Update `handleWatchToggle`: if `isNativeApp()` returns true, call `requestHealthKitPermissions()`. On success, save preference. On failure, show error toast and revert toggle.
- If not native, keep the current behavior (save preference, show info toast about mobile app).

**File: `src/components/IntegrationSettings.tsx`**

- Same pattern for the wearable toggle in settings: detect native and request HealthKit permissions when available.

### 6. Install Capacitor Dependencies
- Add `@capacitor/core` and `@perfood/capacitor-healthkit` as dependencies so the dynamic imports resolve in the native build.

---

## Technical Details

### Edge Function State Encoding
```text
Current:  state = userId (plain string)
Proposed: state = base64(JSON({ userId, redirectPath }))
```

The callback handler will decode this, validate the userId format, and use the redirectPath for the final redirect.

### HealthKit Native Detection Pattern
```text
function isNativeApp(): boolean {
  return !!(window as any).Capacitor?.isNativePlatform;
}
```

This returns false on web (graceful degradation) and true in the Capacitor shell.

### Files to Create
- `src/utils/healthKitCapacitor.ts` -- native HealthKit bridge

### Files to Modify
- `supabase/functions/calendar-auth/index.ts` -- state encoding, dynamic redirect path
- `src/pages/onboarding/stages/Stage7ContextConnection.tsx` -- redirect context, calendar_connected param handling, native HealthKit toggle
- `src/components/CalendarConnectionSettings.tsx` -- pass redirectPath to edge function
- `src/components/IntegrationSettings.tsx` -- native HealthKit toggle in settings

### Secrets to Update
- `FRONTEND_URL` -- set to `https://id-preview--eb63fb97-dcc8-4fc5-8148-517646438c6d.lovable.app`
