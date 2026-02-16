

## Fix Post-Auth Redirect, Context Connection Flow, and Edge Function Errors

### Problem Summary

Three separate issues:

1. **Post-signup redirect goes to executive-home instead of /onboarding/results** -- The `onRedirectCallback` in `main.tsx` uses `window.history.replaceState()` which changes the browser URL but does NOT trigger React Router navigation. Then `AuthCallback` reads the already-replaced URL (missing `?from=onboarding`) and defaults to `/executive-home`.

2. **Context Connection skips daily check-in** -- Stage7ContextConnection already navigates to `/daily-check-in` on completion, so this may be a routing issue or the page isn't rendering properly due to the edge function errors causing a blank screen.

3. **Edge function 500 errors** -- `compute-outer-readiness` and `daily-rituals` both look for `Deno.env.get('AUTH0_DOMAIN')`, but the configured secret is named `VITE_AUTH0_DOMAIN`. The name mismatch means the functions get `undefined`.

---

### Fix 1: AuthCallback redirect logic

**File: `src/main.tsx`**

- In `onRedirectCallback`, save `appState.returnTo` to `sessionStorage` instead of using `replaceState` to change the URL (which breaks React Router).

**File: `src/pages/AuthCallback.tsx`**

- Read the saved `returnTo` from `sessionStorage` (set by `onRedirectCallback`) and navigate there.
- Remove the fragile `?from=onboarding` query-param approach.
- Clear the sessionStorage value after reading.

```text
Auth0 redirect -> /callback
  -> onRedirectCallback saves returnTo to sessionStorage
  -> AuthCallback reads sessionStorage, navigates to /onboarding/results (or /executive-home)
```

### Fix 2: Edge function secret name mismatch

**Files: `supabase/functions/compute-outer-readiness/index.ts` and `supabase/functions/daily-rituals/index.ts`**

- Change `Deno.env.get('AUTH0_DOMAIN')` to `Deno.env.get('VITE_AUTH0_DOMAIN')` in both functions, matching the actual configured secret name.
- Add a null guard in `daily-rituals` (it currently lacks one, producing `https://undefined/userinfo`).

### Fix 3: Audit other edge functions

- Search all edge functions for `AUTH0_DOMAIN` references and update them to `VITE_AUTH0_DOMAIN` to prevent the same error elsewhere.

---

### Technical Details

**main.tsx change:**
```typescript
onRedirectCallback={(appState) => {
  const returnTo = appState?.returnTo || '/executive-home';
  sessionStorage.setItem('auth0_return_to', returnTo);
  // Remove auth params from URL without navigating
  window.history.replaceState({}, document.title, window.location.pathname);
}}
```

**AuthCallback.tsx change:**
```typescript
if (isAuthenticated) {
  const returnTo = sessionStorage.getItem('auth0_return_to') || '/executive-home';
  sessionStorage.removeItem('auth0_return_to');
  toast.success(`Welcome back${user?.given_name ? `, ${user.given_name}` : ''}!`);
  navigate(returnTo);
}
```

**Edge functions change (both files):**
```typescript
const auth0Domain = Deno.env.get('VITE_AUTH0_DOMAIN');
if (!auth0Domain) throw new Error('VITE_AUTH0_DOMAIN not configured');
```

