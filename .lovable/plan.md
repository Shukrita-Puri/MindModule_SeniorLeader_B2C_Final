# Move LinkedIn into Account Details

Consolidate the LinkedIn profile URL into the Account Details card (it belongs with the user identity) and retire the separate "LinkedIn Profile" section.

## What changes on screen

In `Account Details`, new row directly below **Email**:

```
in  LinkedIn  (i)        linkedin.com/in/shukrita   ✎
```

- Icon: LinkedIn (lucide `Linkedin`), matching the muted style of Email/Status rows.
- Label: "LinkedIn" with a small info icon (`Info` from lucide). Hovering/tapping the info icon shows the tooltip:
  > Share your public LinkedIn profile URL. We'll use it to understand your Leadership context.
- Value (right side):
  - If a URL exists: render the handle (e.g. `linkedin.com/in/shukrita`) as a subtle link opening LinkedIn in a new tab, plus a pencil edit button.
  - If no URL exists: render muted "Add LinkedIn" button that opens the same editor.
- Editor: clicking pencil / "Add LinkedIn" opens a small Dialog (mirrors the existing Edit Name dialog pattern) containing:
  - Input prefilled with the current URL (placeholder `https://www.linkedin.com/in/your-handle`)
  - "Save" button → runs the existing `linkedin-profile-scrape` edge function (same validation regex + normalisation already used in `LinkedInImportCard`)
  - Shows the same success / "insufficient public info" toasts
- Below the value, when a successful import exists, show a tiny muted line: `Last imported {date}` (same data already loaded), so the user knows what's on file. Failed/insufficient state shows the existing soft warning text in the dialog after Save.

## What gets removed

- The standalone `<LinkedInImportCard />` card on `/profile` (between Settings and Connections) is removed from `src/pages/Profile.tsx`.

## Data source (unchanged)

- Reads from `user_external_profiles` where `source = 'linkedin_public_profile'` (same query as today).
- Writes via the existing `linkedin-profile-scrape` edge function — no backend changes, no migrations.
- The URL added during onboarding (StageLeadershipContext) is already persisted into the same table, so it surfaces automatically in the new row.

## Files touched

- `src/components/profile/LinkedInAccountRow.tsx` — new small component that owns: load existing row, render row UI, handle dialog + import. Lifts the logic out of `LinkedInImportCard.tsx` (which is then no longer imported anywhere and can be deleted, or left untouched if you prefer to keep it around).
- `src/pages/Profile.tsx` — insert `<LinkedInAccountRow />` inside `Account Details` between the Email and Status rows; remove `<LinkedInImportCard />` and its import.
- `src/components/ui/tooltip.tsx` is already in the project — reused for the info icon (Radix `TooltipProvider` / `Tooltip` / `TooltipTrigger` / `TooltipContent`).

## Acceptance

- On `/profile`, Account Details shows rows: Email → LinkedIn → Status → Plan → Renewal, in that order.
- Tooltip on the info icon reads exactly: *"Share your public LinkedIn profile URL. We'll use it to understand your Leadership context."*
- Users who added their URL in onboarding see it pre-filled with an edit affordance; users who skipped see "Add LinkedIn".
- Save validates the URL, calls the existing scrape function, and shows the same success/insufficient toasts as today.
- The separate LinkedIn Profile card no longer appears below the Settings card.
- No backend, DB, or edge-function changes.
