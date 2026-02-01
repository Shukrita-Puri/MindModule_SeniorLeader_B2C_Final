
# Fix Auth0 Login/Signup for Iframe Environment

## Problem Analysis

The Auth0 login/signup is stuck on "Redirecting to..." because:

1. **Iframe Restriction**: Auth0 cannot render its login page inside an iframe (Lovable preview). Popups are blocked.
2. **Wrong Canonical URL**: `src/utils/authRedirect.ts` has `CANONICAL_APP_URL` pointing to an old project:
   - Current: `https://id-preview--5bd59ee0-ab8c-409f-bc56-72fe64069377.lovable.app`
   - Should be: `https://id-preview--eb63fb97-dcc8-4fc5-8148-517646438c6d.lovable.app`
3. **Signup Component Issues**: The `Signup` component doesn't check if it's in an iframe before trying Auth0 popup

---

## Solution

### Strategy: Open Auth0 in a New Tab When in Iframe

When running inside the Lovable preview iframe:
1. Detect iframe environment using `isInIframe()`
2. Instead of trying popup/redirect, show a UI with a button that opens the canonical app URL in a new tab
3. User completes Auth0 signup in the new tab
4. After authentication, user continues in the new tab (not inside iframe)

---

## Files to Modify

### 1. Update Canonical URL (`src/utils/authRedirect.ts`)

Update the `CANONICAL_APP_URL` to the current project preview URL:

```typescript
export const CANONICAL_APP_URL = 'https://id-preview--eb63fb97-dcc8-4fc5-8148-517646438c6d.lovable.app';
```

---

### 2. Create Dedicated Onboarding Signup Step (`src/pages/onboarding/stages/Stage8SignupStep.tsx`)

Create a new component specifically for the onboarding signup step that:
- Detects if running in iframe
- If in iframe: Shows a branded UI with "Create Your Account" button that opens new tab
- If not in iframe: Triggers Auth0 popup/redirect normally

```tsx
// Stage8SignupStep.tsx
import { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ExternalLink, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isInIframe, openAuthInNewTab, CANONICAL_APP_URL } from '@/utils/authRedirect';

const Stage8SignupStep = () => {
  const { isAuthenticated, isLoading, loginWithPopup } = useAuth0();
  const navigate = useNavigate();
  const [isSigningUp, setIsSigningUp] = useState(false);
  const inIframe = isInIframe();

  // If authenticated, continue to results
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/onboarding/results');
    }
  }, [isLoading, isAuthenticated, navigate]);

  // Handler for iframe - opens new tab
  const handleOpenInNewTab = () => {
    openAuthInNewTab('/onboarding/signup-step');
  };

  // Handler for non-iframe - direct Auth0 popup
  const handleDirectSignup = async () => {
    setIsSigningUp(true);
    try {
      await loginWithPopup({
        authorizationParams: {
          redirect_uri: `${window.location.origin}/callback?from=onboarding`,
          screen_hint: 'signup',
          scope: 'openid profile email',
        },
      });
      navigate('/onboarding/results');
    } catch (error) {
      console.error('Signup failed:', error);
      setIsSigningUp(false);
    }
  };

  if (isLoading) {
    return <LoadingState />;
  }

  // If in iframe, show "Open in New Tab" UI
  if (inIframe) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8 text-center">
          <User className="w-12 h-12 mx-auto text-kairos" />
          <h1 className="text-2xl font-headline font-semibold tracking-tight">
            Create Your Account
          </h1>
          <p className="text-sm text-muted-foreground">
            Secure signup opens in a new window
          </p>
          <Button onClick={handleOpenInNewTab} variant="critical" className="w-full gap-2">
            Continue to Signup
            <ExternalLink className="w-4 h-4" />
          </Button>
          <p className="text-xs text-muted-foreground/60">
            You'll complete your profile in the new tab
          </p>
        </div>
      </div>
    );
  }

  // If not in iframe, show direct signup button
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8 text-center">
        <User className="w-12 h-12 mx-auto text-kairos" />
        <h1 className="text-2xl font-headline font-semibold tracking-tight">
          Create Your Account
        </h1>
        <p className="text-sm text-muted-foreground">
          Secure your progress and unlock personalized insights
        </p>
        <Button 
          onClick={handleDirectSignup} 
          variant="critical" 
          className="w-full"
          disabled={isSigningUp}
        >
          {isSigningUp ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating account...
            </>
          ) : (
            'Create Account'
          )}
        </Button>
        <p className="text-xs text-muted-foreground/60">
          By continuing, you agree to our Terms of Service
        </p>
      </div>
    </div>
  );
};

export default Stage8SignupStep;
```

---

### 3. Update Route to Use New Component (`src/App.tsx`)

Replace the Signup import with the new Stage8SignupStep for the onboarding route:

```tsx
// Add import
const Stage8SignupStep = lazy(() => import("./pages/onboarding/stages/Stage8SignupStep"));

// In routes, change:
{ path: "signup-step", element: <Suspense fallback={<LoadingFallback />}><Stage8SignupStep /></Suspense> },
```

---

### 4. Update Login.tsx to Handle Iframe (`src/pages/Login.tsx`)

Similar pattern - detect iframe and show "Open in New Tab" UI:

```tsx
// Add isInIframe check at the top
const inIframe = isInIframe();

// If in iframe, show new tab button instead of auto-triggering
if (inIframe && !isAuthenticated && !isLoading) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center max-w-md space-y-4">
        <h2 className="text-xl font-heading font-semibold">Sign In</h2>
        <p className="text-muted-foreground text-sm">
          Sign in opens in a new window for security
        </p>
        <Button onClick={() => openAuthInNewTab('/login')} className="gap-2">
          Continue to Sign In
          <ExternalLink className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
```

---

## Auth0 Configuration Requirement

The new preview URL must be whitelisted in Auth0 Application Settings:
- **Allowed Callback URLs**: `https://id-preview--eb63fb97-dcc8-4fc5-8148-517646438c6d.lovable.app/callback`
- **Allowed Logout URLs**: `https://id-preview--eb63fb97-dcc8-4fc5-8148-517646438c6d.lovable.app`
- **Allowed Web Origins**: `https://id-preview--eb63fb97-dcc8-4fc5-8148-517646438c6d.lovable.app`

---

## User Flow After Fix

**In Lovable Preview (Iframe):**
1. User reaches signup step
2. Sees branded UI with "Continue to Signup" button
3. Clicks button → new tab opens with the canonical app URL
4. Auth0 login/signup works normally in new tab
5. User completes onboarding in new tab

**Outside Iframe (Direct Access):**
1. User reaches signup step
2. Sees branded UI with "Create Account" button
3. Clicks button → Auth0 popup appears
4. User signs up and continues in same window

---

## Files Summary

| File | Action |
|------|--------|
| `src/utils/authRedirect.ts` | Update `CANONICAL_APP_URL` to current preview URL |
| `src/pages/onboarding/stages/Stage8SignupStep.tsx` | **Create** new component for onboarding signup |
| `src/App.tsx` | Update route to use `Stage8SignupStep` instead of `Signup` |
| `src/pages/Login.tsx` | Add iframe detection and "Open in New Tab" UI |

