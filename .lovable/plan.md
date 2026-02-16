

## Fix Auth0 Login — Switch from Popup to Redirect

### Problem

All login flows use `loginWithPopup()` on desktop. This gets blocked by browsers (especially incognito, iframe, and strict popup blockers). Once blocked, the `sessionStorage` flag `auth_login_triggered` is set to `'true'` and never cleared, permanently trapping the user on the spinner.

### Solution

Replace every `loginWithPopup()` call with `loginWithRedirect()` across the entire app. This is the Auth0-recommended approach for SPAs.

### Auth0 Dashboard Configuration (User Action Required)

Go to Auth0 Dashboard → Applications → Your App → Settings and set:

- **Application Type**: Single Page Application
- **Allowed Callback URLs**: `https://id-preview--eb63fb97-dcc8-4fc5-8148-517646438c6d.lovable.app/callback, https://mindmodule.me/callback, https://www.mindmodule.me/callback`
- **Allowed Logout URLs**: `https://id-preview--eb63fb97-dcc8-4fc5-8148-517646438c6d.lovable.app, https://mindmodule.me, https://www.mindmodule.me`
- **Allowed Web Origins**: `https://id-preview--eb63fb97-dcc8-4fc5-8148-517646438c6d.lovable.app, https://mindmodule.me, https://www.mindmodule.me`
- **Allowed Origins (CORS)**: `https://id-preview--eb63fb97-dcc8-4fc5-8148-517646438c6d.lovable.app, https://mindmodule.me, https://www.mindmodule.me`

### Code Changes

#### 1. `src/pages/Login.tsx`
- Remove `loginWithPopup` import and all popup logic
- Remove `popupBlocked` state, `handleManualLogin`, and the popup-blocked UI
- Remove the iframe-specific "Open in New Tab" UI
- Remove `sessionStorage` flag logic (redirect handles this natively)
- Simplify to: if not authenticated and not loading, call `loginWithRedirect()` with `redirect_uri` and `appState: { returnTo: finalDestination }`
- Keep the spinner as the only UI (user is immediately redirected to Auth0)

#### 2. `src/pages/Signup.tsx`
- Same pattern: remove `loginWithPopup`, `popupBlocked`, `handleManualSignup`
- Call `loginWithRedirect()` with `screen_hint: 'signup'` to show the signup screen
- Simplify to spinner + redirect only

#### 3. `src/components/ProtectedRoute.tsx`
- Remove `loginWithPopup` and all popup-related state (`popupBlocked`, `isLoggingIn`, `handleManualLogin`)
- Remove the popup-blocked fallback UI
- When user is not authenticated: call `loginWithRedirect()` with `appState: { returnTo: location.pathname }`
- Remove `sessionStorage` flag (unnecessary with redirect flow)
- Keep the spinner for loading/unauthenticated state

#### 4. `src/pages/AuthCallback.tsx`
- Remove cross-tab broadcast logic (`broadcastAuthSuccess`, `closeAuthWindow`)
- Simplify: when authenticated, read `appState?.returnTo` from the URL or default to `/executive-home`, then navigate
- The Auth0Provider's `onRedirectCallback` in `main.tsx` already handles the redirect via `window.history.replaceState` — the callback page just needs to wait for `isAuthenticated` then navigate

#### 5. `src/main.tsx`
- Update `redirect_uri` in Auth0Provider to use `window.location.origin + '/callback'` (already correct)
- Confirm `cacheLocation: "localstorage"` and `useRefreshTokens: true` are present (already correct)
- No other changes needed

#### 6. `src/pages/Front.tsx`
- Remove iframe check for "Sign In" button — just navigate to `/login` directly (redirect flow works everywhere)
- Keep iframe check for "Begin Your Journey" if desired, or simplify that too

#### 7. `src/utils/authRedirect.ts`
- `openAuthInNewTab`, `broadcastAuthSuccess`, `closeAuthWindow`, `listenForAuthSuccess`, `AUTH_CHANNEL_NAME` become unused — remove them
- Keep `isMobileDevice()` and `isInIframe()` if used elsewhere, otherwise clean up

### Files Modified

| File | Change |
|---|---|
| `src/pages/Login.tsx` | Replace popup with `loginWithRedirect()`, remove fallback UIs |
| `src/pages/Signup.tsx` | Replace popup with `loginWithRedirect()`, remove fallback UIs |
| `src/components/ProtectedRoute.tsx` | Replace popup with `loginWithRedirect()`, remove popup-blocked UI |
| `src/pages/AuthCallback.tsx` | Simplify to navigate on authenticated, remove cross-tab sync |
| `src/pages/Front.tsx` | Remove iframe-specific "open in new tab" logic |
| `src/utils/authRedirect.ts` | Remove unused cross-tab and popup helpers |

### What This Fixes

- Spinner stuck forever (popup silently fails, flag blocks retry)
- Incognito login broken (popups blocked by default)
- Iframe preview login broken (popups blocked in iframes)
- Unnecessary complexity (cross-tab broadcast, BroadcastChannel, manual login buttons)

### What Stays the Same

- Auth0Provider config in `main.tsx` (already correct with `cacheLocation` and `useRefreshTokens`)
- `useAuth` hook (no changes needed)
- DEV_MODE bypass (unaffected)
- Edge function auth token pattern (unaffected)

