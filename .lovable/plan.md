
# Fix Onboarding Flow, Button Styling, and Connect Context Issues

## Issues Identified

### 1. "Begin Your Journey" Button Text Color
- **Current**: The `critical` variant uses `text-kairos-foreground` which is white (100% white in CSS)
- **Needed**: Black text for better contrast on the green button
- **Fix**: Update `--kairos-foreground` to use black text or add explicit `text-black` class

### 2. Wrong Onboarding (School vs Executive)
- **Finding**: The screenshot shows "How old are you?" with age ranges (13-14, 15-16, 17-18 years old)
- **Current codebase**: `Stage2Identity.tsx` correctly shows executive options ("Executive / Organisation Leader", "Manager / People Leader", "Others")
- **Possible causes**:
  - Cached version in the browser
  - Different deployment/project
  - The onboarding flow routing is incorrect
- **Fix**: Verify the `/onboarding` route correctly leads to the executive flow. Clear cache if needed.

### 3. Connect Context Toggles Don't Work
- **Error**: `"You forgot to wrap your component in <Auth0Provider>."`
- **Root cause**: `Stage7ContextConnection.tsx` uses `useAuth0()` hook (`getAccessTokenSilently`) to connect calendar. During onboarding, users haven't completed Auth0 signup yet, so the hook fails.
- **Fix**: Make the calendar connection optional/deferred. Allow the toggle UI to work, but only attempt actual OAuth connection AFTER user is authenticated. Show a message or save the preference for later.

### 4. Onboarding Signup Page Not Showing
- **Current**: `/onboarding/signup-step` renders `<Signup />` which immediately tries Auth0 popup/redirect
- **Issue**: If Auth0 isn't properly configured or popup is blocked, user sees endless loading
- **Fix**: Create a proper signup step page that shows the user what's happening and handles errors gracefully

---

## Implementation Plan

### Part 1: Fix Button Text Color (Black text on green)

**File**: `src/index.css`

Update the kairos foreground color to use black text:
```css
--kairos-foreground: 0 0% 0%;  /* Black text instead of white */
```

Alternative: Add explicit class override in `Front.tsx`:
```tsx
<Button variant="critical" className="text-black ...">
```

### Part 2: Fix Connect Context Page (Toggle Without Auth)

**File**: `src/pages/onboarding/stages/Stage7ContextConnection.tsx`

The page should work without requiring authentication:
1. Remove `useAuth0` hook usage (since user isn't authenticated during onboarding)
2. Store toggle preferences in localStorage instead of making API calls
3. Calendar connection will happen AFTER user signs in and completes onboarding
4. Keep the UI toggles functional for user preference capture

Changes:
- Remove `useAuth0` import and usage
- Remove `getAccessTokenSilently` calls
- Store preferences in localStorage for later sync
- Apple Watch toggle should work similarly (just save preference)

### Part 3: Fix Onboarding Signup Step

**File**: `src/pages/onboarding/stages/Stage8SignupStep.tsx` (new file or modify existing)

Create a proper signup step that:
1. Shows a clear UI explaining the signup process
2. Has a "Create Account" button that triggers Auth0
3. Handles popup blocked scenarios gracefully
4. Shows loading state appropriately

The route already points to `Signup.tsx` which handles Auth0 - but we may need to add better UX for the onboarding context.

### Part 4: Verify Onboarding Flow Routing

**File**: `src/pages/Front.tsx` (already correct)

The "Begin Your Journey" button navigates to `/onboarding` which shows `Stage1Welcome`, then `/onboarding/identity` which shows `Stage2Identity` with executive questions. This flow is correct in the current codebase.

If user sees school questions, it's likely a cached version. The fix is to clear browser cache.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/index.css` | Change `--kairos-foreground` to black (0 0% 0%) |
| `src/pages/onboarding/stages/Stage7ContextConnection.tsx` | Remove Auth0 dependency, make toggles work locally |
| `src/pages/Front.tsx` | (Optional) Add explicit `text-black` class to button for safety |

---

## Technical Details

### CSS Change (Button Text Color)
```css
/* Before */
--kairos-foreground: 0 0% 100%;  /* White */

/* After */
--kairos-foreground: 0 0% 0%;    /* Black */
```

### Context Connection Simplified Logic
```tsx
// Remove Auth0 dependencies for toggle functionality
const [calendarPreference, setCalendarPreference] = useState(false);
const [watchPreference, setWatchPreference] = useState(false);

const handleToggleCalendar = (checked: boolean) => {
  setCalendarPreference(checked);
  // Save to localStorage - actual connection happens post-signup
  localStorage.setItem('onboarding_calendar_preference', JSON.stringify(checked));
};

const handleToggleWatch = (checked: boolean) => {
  setWatchPreference(checked);
  localStorage.setItem('onboarding_watch_preference', JSON.stringify(checked));
};
```

After user completes signup and enters the app, these preferences can be read and actual OAuth connections initiated.

---

## Flow After Fixes

1. User clicks "Begin Your Journey" (black text on green button)
2. User goes through executive onboarding (Identity, Emotional Awareness, etc.)
3. User reaches Signup Step - Auth0 flow triggers
4. After signup, user sees Results page
5. User reaches Context Connection - toggles work to save preferences
6. Preferences saved to localStorage
7. When user enters the authenticated app, calendar/watch connection is offered based on saved preferences

---

## Testing Checklist

- [ ] "Begin Your Journey" button has black text on green background
- [ ] Onboarding flow shows executive questions (not school/age questions)
- [ ] Context Connection toggles work without errors
- [ ] Signup step handles Auth0 properly
- [ ] Preferences are saved and can be used after authentication
