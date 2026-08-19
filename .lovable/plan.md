# Profile page restructure + popover shortcuts

## 1. Profile page section order

Reorder into four clearly-titled cards, each with a leading icon:

```text
[ Avatar / name / email header card ]
1. Account Details   (User icon)      — Admin Console, Email, LinkedIn, Status
2. Subscription      (CreditCard icon)— Plan (+ actions menu), Renewal, Upgrade/Manage Plan, Apple IAP card on iOS
3. Home Location     (Home icon)      — existing HomeLocationCard, moved up
4. Settings          (Settings icon)  — Manage Connections, Privacy & Security, Refer,
                                        Retake Tour, Push Test, Send Feedback,
                                        Delete Local Data, Delete Account, Sign Out
```

Plan/Status/Renewal rows currently sit inside Account Details; Plan and Renewal move into the new Subscription card (Status stays in Account Details as an account attribute). The Upgrade/Manage Plan button moves out of Settings into Subscription. The iOS Apple subscription card renders inside the Subscription section instead of at the page bottom.

The Subscription card gets `id="subscription"` so it can be deep-linked and scrolled to.

## 2. Profile popover additions

In the lower box of the user popover (the one holding Retake Tour / Sign Out), add two entries directly after Profile-group items:

- **Manage Connections** → navigates to `/connected-data` (the same full experience the Profile page button opens).
- **Subscription** → navigates to `/profile#subscription`, landing the user on the Profile page scrolled to the Subscription card.

Each with a matching Lucide icon (Link2, CreditCard), same row styling as existing entries.

## 3. Icons

Add icons to the section headers that lack them: Settings (`Settings`) and Subscription (`CreditCard`), matching the existing Account Details (`User`) and Home Location (`Home`) treatment — same size, muted colour, same gap.

## 4. Typography consistency

Normalise all Profile page text to the Inter sans styles already used by the Email row:

- Page title and name header: drop `font-headline` serif usage below 24px, use Inter (design-system rule: no serif below 24px). Page title stays as the one large heading.
- Card titles: single consistent size/weight across all four cards.
- Row labels and values: consistent `text-sm`, muted label / foreground value.
- Buttons and descriptions: consistent sizes; no ad-hoc pixel sizes.

## Technical notes

- Files: `src/pages/Profile.tsx` (restructure + typography), `src/components/navigation/UserSettingsPopover.tsx` (two new menu entries), `src/components/profile/HomeLocationCard.tsx` (header icon/typography alignment only).
- Profile page adds a small effect to scroll to `#subscription` when the hash is present.
- No backend, routing, billing, or subscription-logic changes — presentation and navigation only. Existing gating flags (`PAYMENT_PAGE_SUPPRESSED`, `canShowStripePurchaseUi`, `isIosNativeShell`) are preserved exactly.
