

## Fix Onboarding Signup Step: Dev Mode Bypass and Iframe Detection

### Problem
The `/onboarding/signup-step` page calls `loginWithRedirect()` which fails inside the Lovable editor iframe because Auth0 blocks rendering with `X-Frame-Options: DENY`, leaving users stuck on a broken spinner.

### Changes

**File: `src/pages/onboarding/stages/Stage8SignupStep.tsx`**

1. **Dev Mode bypass** -- when `DEV_MODE = true`, skip Auth0 entirely and navigate straight to `/onboarding/results`
2. **Iframe detection** -- when running inside an iframe, show a styled message with an "Open in new tab" link (matching the pattern already used in `Login.tsx`) instead of attempting a redirect that will fail
3. **Standalone browser / Capacitor** -- keep existing `loginWithRedirect()` behavior unchanged (it works correctly there)

### Logic Flow

```text
Component mounts
  |
  +--> DEV_MODE enabled?
  |      YES --> navigate('/onboarding/results') immediately
  |
  +--> Running in iframe?
  |      YES --> Render "Open in new tab" UI with link to
  |              preview URL + /onboarding/signup-step
  |
  +--> Already authenticated?
  |      YES --> navigate('/onboarding/results')
  |
  +--> Call loginWithRedirect() with screen_hint: 'signup'
```

### Technical Detail

- Import `DEV_MODE` from `@/config/devMode`
- Reuse the `isInIframe()` helper pattern from `Login.tsx`
- The "Open in new tab" link points to `https://id-preview--eb63fb97-dcc8-4fc5-8148-517646438c6d.lovable.app/onboarding/signup-step`
- Uses `ExternalLink` icon from lucide-react, consistent with existing Login page styling
- No other files need changes

