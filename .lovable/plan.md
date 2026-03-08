

## Plan: Fix Status Labels, Enhance Plan Dropdown with Cancel/Downgrade Flow

### Changes

**1. Fix Status label in Profile.tsx (line 38-44)**
- Status should only ever be "Free", "Paid", or "Canceled" -- never "Trial"
- Logic: `isPaying && !isCanceled` = "Paid", `isCanceled` = "Canceled", everything else = "Free"

**2. Update the 3-dot dropdown menu (lines 201-227)**
- Rename to "Manage Plan" as the conceptual label
- Menu items:
  - **Upgrade Plan** (shown when not paying) -- navigates to `/onboarding/payment`
  - **Change Plan** (shown when paying) -- navigates to `/onboarding/payment`
  - **Manage Billing** (shown when has billing account) -- opens Stripe portal
  - **Cancel Plan** (shown when paying and not already canceled) -- opens the existing `CancellationFlow` modal

**3. Integrate CancellationFlow into Profile.tsx**
- Import `CancellationFlow` component
- Add `showCancelFlow` state
- "Cancel Plan" dropdown item sets `showCancelFlow = true`
- On successful cancellation, refresh profile and show toast with end date
- Render `CancellationFlow` modal conditionally

**4. Enhance CancellationFlow with best-in-class UX (reference screenshot)**
- Update title to "Why are you downgrading?" with subtitle "We use this information to improve our product."
- Update reason labels to be more professional:
  - "I am having too many technical issues"
  - "It's too expensive"  
  - "I'm not using MindModule enough"
  - "It's missing features"
  - "I switched to a competitor"
  - "Other reason"
- Add optional free-text textarea ("Tell us more about your decision...")
- Swap button order: primary "Keep current plan" button on top, secondary "Cancel plan" below (retention-first pattern)
- Include the free-text `feedback` in the cancellation API call
- Replace `alert()` with `toast.error()` for error handling

### Files Modified
- `src/pages/Profile.tsx` -- status logic fix, cancel flow integration, dropdown update
- `src/components/subscription/CancellationFlow.tsx` -- enhanced UX per reference screenshot

