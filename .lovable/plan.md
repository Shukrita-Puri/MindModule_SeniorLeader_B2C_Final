

# Audit: iOS Logout "Oops!" Error — Root Cause & Fix

## Root Cause

**Line 472** in `src/hooks/useAuth.tsx`:

```
const logoutUrl = `https://${domain}/v2/logout?client_id=${encodeURIComponent(clientId)}&returnTo=${encodeURIComponent('app.mindmodule.me://callback')}`;
```

The `returnTo` value is `app.mindmodule.me://callback` — a **custom URL scheme**. Auth0 requires that **every `returnTo` URL used in `/v2/logout` calls must be listed in the application's Allowed Logout URLs** in the Auth0 dashboard.

If `app.mindmodule.me://callback` is not in that list, Auth0 shows: *"Oops!, something went wrong — There could be a misconfiguration in the system…"*

### Secondary issue

Even if the custom scheme were allowed, Auth0 redirecting to `app.mindmodule.me://callback` after logout would trigger the **appUrlOpen deep-link listener** in `nativeAuth.ts`, which expects `code` and `state` params (login callback). A logout redirect hitting the login callback handler would cause errors or confusion.

## Fix

### 1. Change the iOS logout `returnTo` to a web URL (code fix)

**File**: `src/hooks/useAuth.tsx`, line 472

Replace the custom scheme with a safe web URL that the app doesn't need to handle:

```typescript
// Before
const logoutUrl = `https://${domain}/v2/logout?client_id=${encodeURIComponent(clientId)}&returnTo=${encodeURIComponent('app.mindmodule.me://callback')}`;

// After
const logoutUrl = `https://${domain}/v2/logout?client_id=${encodeURIComponent(clientId)}&returnTo=${encodeURIComponent('https://app.mindmodule.me')}`;
```

Using `https://app.mindmodule.me` means:
- Auth0 redirects the in-app browser to the web landing page after logout
- The 1.5s `Browser.close()` timer dismisses the in-app browser before or shortly after the redirect completes
- No deep-link handler is triggered
- The user returns to the native app's current WebView (which has already cleaned up local state)

### 2. Auth0 Dashboard: Add to Allowed Logout URLs

In the Auth0 dashboard for application `fOlef5xSQ6JWGKM2U2HGhZrEuaCN7fCk`, add these to **Allowed Logout URLs** (if not already present):

```
https://app.mindmodule.me
https://app.mindmodule.me/
```

Also verify the existing web logout URL is present:
```
https://app.mindmodule.me
```

Remove or keep `app.mindmodule.me://callback` — it's no longer needed for logout.

### 3. No other files need changes

| Area | Status |
|------|--------|
| `capacitor.config.ts` | OK — `appId: 'app.mindmodule.me'` matches scheme |
| `Info.plist` | OK — URL scheme `app.mindmodule.me` registered |
| `nativeAuth.ts` | OK — login flow uses correct redirect URI |
| `main.tsx` Auth0Provider | OK — config is correct |
| `.env` domain/clientId | OK — `auth.mindmodule.me` / `fOlef5xSQ6JWGKM2U2HGhZrEuaCN7fCk` |
| Web logout path | OK — uses `window.location.origin` which resolves correctly |

## Summary

| Item | Current (broken) | Fixed |
|------|-------------------|-------|
| iOS logout `returnTo` | `app.mindmodule.me://callback` | `https://app.mindmodule.me` |
| Auth0 Allowed Logout URLs | Missing web URL for iOS | Add `https://app.mindmodule.me` |
| Files to change | `src/hooks/useAuth.tsx` line 472 | Single line change |
| Auth0 dashboard | Allowed Logout URLs | Add `https://app.mindmodule.me` |

## Risk

- None — the in-app browser is dismissed by the existing `setTimeout` before the user sees the web page
- Local state is already cleaned up before the `/v2/logout` call fires
- Login flow is completely unaffected

