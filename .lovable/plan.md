

## Fix: Disable DEV_MODE to Enable Auth0 Login

### Root Cause

`src/config/devMode.ts` has `DEV_MODE = true`. This tells `main.tsx` to skip the `Auth0Provider` entirely. Without it, every call to `useAuth0()` (in Login, Signup, ProtectedRoute, etc.) gets stuck because the SDK has no provider context.

### The Fix

**One line change:**

In `src/config/devMode.ts`, change line 2:
```
export const DEV_MODE = true;
```
to:
```
export const DEV_MODE = false;
```

This re-enables the `Auth0Provider` in `main.tsx`, allowing `loginWithRedirect()` to function.

### Important: Testing in the Lovable Editor

After this change, the spinner will still appear **inside the Lovable editor preview iframe**. This is expected -- Auth0 blocks its login page from loading inside iframes (`X-Frame-Options: DENY`). The redirect fires but Auth0 refuses to render.

**To test login:** Open the preview URL directly in a new browser tab:
`https://id-preview--eb63fb97-dcc8-4fc5-8148-517646438c6d.lovable.app`

You should be redirected to the Auth0 login screen. After authenticating, you will land on `/executive-home`.

### Files Modified

| File | Change |
|---|---|
| `src/config/devMode.ts` | Set `DEV_MODE = false` |

### What This Enables

- Auth0Provider wraps the entire app
- `loginWithRedirect()` can reach Auth0's authorization server
- Callback flow completes and sets session in localStorage
- All 28 files referencing DEV_MODE will switch from mock/direct-DB paths to production Auth0 token paths

### Prerequisite (Already Done)

Your Auth0 Dashboard must have the cleaned URLs configured (callbacks, logout, web origins, CORS) as discussed previously.

