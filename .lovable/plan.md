
# Enhancements: Context Connection, Auth Tab Sync, and Logo Update

## Overview

This plan addresses four key issues:
1. **Context Connection page needs OAuth integration** - Currently toggles only save preferences to localStorage, but need to trigger actual OAuth flows for Google Calendar and Apple Watch
2. **Auto-close auth tab after signup** - After Auth0 signup in a new tab, that tab should close and user continues in the original app
3. **Sidebar logo update** - Replace the "K" with either the KAIROS wordmark or the Lambda/Arrow icon when sidebar is collapsed
4. **Capacitor compatibility** - Ensure the implementation works for future mobile app conversion

---

## Part 1: Context Connection - Trigger Actual OAuth Flows

### Current State
The `Stage7ContextConnection.tsx` page only saves preferences to localStorage. The actual calendar connection component (`CalendarConnectionSettings.tsx`) exists but requires the user to be authenticated first.

### Problem
The toggles appear to work but don't actually connect to anything. The user expects that when they toggle "Google Calendar" ON, the OAuth flow initiates.

### Solution
Move the Context Connection stage to AFTER signup (it's currently before signup in the flow). This way:
1. User completes onboarding questionnaire
2. User signs up via Auth0
3. User sees results page
4. User goes to payment page
5. User reaches Context Connection page (NOW AUTHENTICATED)
6. Toggle ON triggers actual OAuth flow via `CalendarConnectionSettings` component
7. User continues to the app

### Files to Modify

**src/pages/onboarding/stages/Stage7ContextConnection.tsx**
- Import and use `CalendarConnectionSettings` for Google Calendar
- For Apple Watch: Show informational toggle (actual HealthKit integration requires native app)
- Check authentication status - if not authenticated, show message to complete signup first
- Add useAuth hook to verify user is logged in

### Flow Change (Onboarding Order)
Current order in `OnboardingFlow.tsx`:
```
1. /onboarding (welcome)
2. /onboarding/identity
3. /onboarding/emotional-awareness
4. /onboarding/stress-response
5. /onboarding/recovery-patterns
6. /onboarding/mental-clarity
7. /onboarding/growth-intention
8. /onboarding/signup-step       <-- Auth0
9. /onboarding/results
10. /onboarding/payment
11. /onboarding/context-connection  <-- NOW with OAuth
```

This order is already correct - Context Connection comes AFTER signup. The issue is the component isn't using the actual OAuth components.

---

## Part 2: Auto-Close Auth Tab After Signup (Cross-Tab Communication)

### The Challenge
When user clicks "Continue to Signup" in the iframe, a new tab opens. After Auth0 authentication completes in that tab, we want:
1. The new tab to close automatically
2. The original iframe/tab to detect the successful auth and continue onboarding

### Solution: BroadcastChannel API
Use the `BroadcastChannel` API for cross-tab communication:

1. **In the original tab/iframe**: Listen for auth completion messages
2. **In the new auth tab**: After successful auth, broadcast a message and close the tab

### Implementation

**src/utils/authRedirect.ts**
Add broadcast channel helpers:
```typescript
export const AUTH_CHANNEL_NAME = 'kairos-auth-channel';

export const broadcastAuthSuccess = (destination: string) => {
  const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
  channel.postMessage({ type: 'AUTH_SUCCESS', destination });
  channel.close();
};

export const listenForAuthSuccess = (callback: (destination: string) => void): () => void => {
  const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
  channel.onmessage = (event) => {
    if (event.data.type === 'AUTH_SUCCESS') {
      callback(event.data.destination);
    }
  };
  return () => channel.close();
};
```

**src/pages/onboarding/stages/Stage8SignupStep.tsx**
- When in iframe: Start listening for auth success via BroadcastChannel
- When NOT in iframe (the new tab): After successful auth, broadcast success message and attempt to close the tab

**src/pages/AuthCallback.tsx**
- After successful authentication, broadcast the success and close the window if it was opened as a popup/new tab

### Capacitor Considerations
- BroadcastChannel works in modern browsers and WebView
- For native Capacitor builds, the app won't be in an iframe, so direct Auth0 popup/redirect will work
- The "new tab" flow is specifically for the Lovable preview iframe scenario

---

## Part 3: Sidebar Logo Update - Replace "K" with KAIROS Logo or Lambda

### Current State
The collapsed sidebar shows a single "K" character:
```tsx
<span className="font-headline text-lg font-semibold tracking-widest text-kairos">K</span>
```

### Options
Looking at the uploaded images:
1. **KAIROS wordmark** - Black text logo with distinctive "Λ" (Lambda) shape in the A
2. **Lambda icon** - The standalone Λ symbol on green background

### Recommendation
Use the existing `kairos-logo-black.png` asset (KAIROS wordmark) but render it small when collapsed, OR render just the Lambda symbol.

Since the Lambda (Λ) is part of the KAIROS identity and is more compact, use an SVG Lambda for the collapsed state.

### Implementation

**src/components/navigation/LeftSidebar.tsx**
Replace the "K" with either:
- Option A: Small version of the KAIROS logo image
- Option B: Custom Lambda SVG icon (more scalable, better for small sizes)

```tsx
// Collapsed state
{isCollapsed ? (
  <svg 
    viewBox="0 0 24 32" 
    className="w-6 h-8 text-kairos fill-current"
    aria-label="Kairos"
  >
    <path d="M12 0L0 32h5.5l6.5-18 6.5 18H24L12 0z" />
  </svg>
) : (
  <img 
    src={kairosLogo} 
    alt="KAIROS" 
    className="h-5" 
  />
)}
```

---

## Part 4: Apple Watch Integration Note

### Reality Check
Apple Watch / HealthKit integration requires:
- Native iOS app (Capacitor can access this via plugins)
- User permission on the device
- Cannot be done purely in web

### Approach for Now
1. Keep the toggle as a "preference" indicator
2. When toggled ON, show informational text: "Apple Watch will connect when you install the mobile app"
3. Store the preference for later use when native app is built
4. When Capacitor is implemented, use `@capacitor-community/health-kit` plugin

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/utils/authRedirect.ts` | Add BroadcastChannel helpers for cross-tab auth sync |
| `src/pages/onboarding/stages/Stage8SignupStep.tsx` | Listen for auth success, close tab after broadcast |
| `src/pages/AuthCallback.tsx` | Broadcast auth success and close tab if popup |
| `src/pages/onboarding/stages/Stage7ContextConnection.tsx` | Integrate real CalendarConnectionSettings, handle Apple Watch info |
| `src/components/navigation/LeftSidebar.tsx` | Replace "K" with Lambda icon or KAIROS logo |

---

## Implementation Details

### Cross-Tab Auth Flow

```text
[Lovable Iframe]                    [New Tab]
       |                                |
       |-- Click "Continue" ----------->|
       |                                |
       |   Listen for broadcast         |-- Auth0 Login
       |        ↓                       |
       |                                |-- Callback
       |                                |
       |<-- Broadcast AUTH_SUCCESS -----|
       |                                |-- window.close()
       |
       |-- Navigate to results
```

### Context Connection with Real OAuth

```tsx
// Stage7ContextConnection.tsx
import { useAuth } from '@/hooks/useAuth';
import CalendarConnectionSettings from '@/components/CalendarConnectionSettings';

export default function Stage7ContextConnection() {
  const { isAuthenticated } = useAuth();
  
  // If not authenticated, shouldn't be on this page
  if (!isAuthenticated) {
    return <Navigate to="/onboarding/signup-step" />;
  }
  
  return (
    <div>
      {/* Google Calendar - Real OAuth */}
      <CalendarConnectionSettings compact />
      
      {/* Apple Watch - Info only */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-card border">
        <div className="flex items-center gap-3">
          <Watch className="w-5 h-5" />
          <div>
            <span className="font-medium">Apple Watch</span>
            <p className="text-xs text-muted-foreground">Available in mobile app</p>
          </div>
        </div>
        <Badge variant="outline">Coming Soon</Badge>
      </div>
    </div>
  );
}
```

### Lambda Icon SVG
The Lambda symbol from the KAIROS branding:
```tsx
const LambdaIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 32" 
    className={className}
    aria-label="Kairos"
  >
    <path d="M12 0L0 32h5.5l6.5-18 6.5 18H24L12 0z" fill="currentColor" />
  </svg>
);
```

---

## Testing Checklist

- [ ] Collapsed sidebar shows Lambda icon instead of "K"
- [ ] Expanded sidebar shows full KAIROS wordmark
- [ ] Context Connection page shows real Google Calendar connect button (for authenticated users)
- [ ] Apple Watch shows "Coming Soon" badge with explanation
- [ ] After Auth0 signup in new tab, the tab closes automatically
- [ ] Original iframe detects auth success and navigates to results
- [ ] Flow works in direct browser access (non-iframe)
- [ ] BroadcastChannel gracefully falls back if not supported

---

## Capacitor Compatibility Notes

1. **Auth Flow**: In native app (not in iframe), Auth0 will use in-app browser or ASWebAuthenticationSession - no cross-tab needed
2. **HealthKit**: Will use `@capacitor-community/health-kit` plugin when native build is ready
3. **BroadcastChannel**: Only used for web/iframe scenario - native app skips this entirely
4. **Google Calendar OAuth**: Works the same way - redirect to Google, return to app via deep link or redirect URI

