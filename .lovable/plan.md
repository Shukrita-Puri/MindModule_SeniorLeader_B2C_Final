## Week-Ahead Notification — Investigation Report (read-only)

No fake logs, no manual triggers. Findings taken directly from source.

### Backend function responsible
`supabase/functions/smart-nudges/index.ts` — evaluator `evaluateWeekAheadPickerInvite` (~L4247–4375). Predicate: `_shared/plan/week-ahead-nudge.ts` (`shouldFireWeekAheadPickerInvite`). Mode/reason: `_shared/plan/week-ahead-mode.ts` (`evaluateWeekAheadMode`, `planningDayOfWeek`).

Dispatch loop (~L5347–5470): Week-Ahead runs in its own bucket BEFORE the daily cap; DND and the 2-hour countable-suppression rule still apply per `smart-nudges/WEEK_AHEAD_CONTRACT.md`.

### Notification payload (exact structure)
Returned by evaluator, sent as APNs push + inserted into `notification_log`:

```
type:            "week_ahead_picker_invite"
copy.title:      <variant title, see below>
copy.body:       <variant body, see below>
copy.variantId:  "week_ahead_picker_invite::<reason>"
deepLinkRoute:   "/plan?mode=week-ahead"
priority:        25
anchorKind:      "state"
slot:            "evening"
signalStrength:  2
architecture:    "cos-mind-v5"     (added by dispatcher)
cta_experiment:  "cta-action-verb-v1"
```

`<reason>` ∈ `weekly_planning | end_of_pto | end_of_public_holiday | end_of_long_weekend | manual_override`.

### Copy variants (verbatim from source, L4331–4358)

- **weekly_planning — Monday-start countries (default, incl. GB)**
  - Title: `Sunday reset`
  - Body: `10 priority choices can shape the week before Monday starts - log in to prep your mind tonight.`
- **weekly_planning — Sunday-start countries (SA/KW/QA/BH/OM/IL)**
  - Title: `Week reset`
  - Body: `10 priority choices can shape the week before Sunday starts - log in to prep your mind tonight.`
- **end_of_pto**
  - Title: `Last day off`
  - Body: `10 priority choices can shape tomorrow before work restarts - log in to prep your mind.`
- **end_of_public_holiday**
  - Title: `Re-engaging`
  - Body: `10 priority choices can shape re-entry before work restarts - log in to prep your mind.`
- **end_of_long_weekend**
  - Title: `Frame the week`
  - Body: `10 priority choices can shape the week before Monday lands - log in to prep your mind.`

### Example a UK user sees on lock screen
```
Sunday reset
10 priority choices can shape the week before Monday starts -
log in to prep your mind tonight.
```
Tap → deep link `/plan?mode=week-ahead` → routed by `usePushNotificationHandler` (payload `deep_link_route` wins over type mapping) → `PlanPage` opens the Week-Ahead picker.

### Preview / dry-run available (no fake log rows)
The function has a first-class dry-run mode — `smart-nudges/delivery-mode.ts` `resolveDeliveryMode`. Passing `?force_dry=1` returns `dryRun: true, reason: 'explicit_force_dry'`:
- APNs push is NOT sent.
- Payload is fully computed and returned in the response body.
- `notification_log` rows are written with a dry-run delivery state (non-countable per `_shared/countable-notification-states.ts`), so they do NOT block real sends and are NOT counted as history for the 2-hour suppressor or the weekly bucket.

To preview a specific user without producing a real notification, the safe call is:
`supabase--curl_edge_functions POST /smart-nudges?force_dry=1&force_user=<userId>` (admin JWT required for `force_user`). The response includes the exact payload the user would have received, plus the `[week-ahead-trigger]` log line showing the resolved `reason`, `homeCountry`, and suppressors.

### What I recommend next (needs your approval before I run anything)
1. Run one `force_dry=1` preview for `shukrita@mindmodule.me` (UK) at the current tick and paste the resolved reason + payload back to you.
2. Same for a Saudi test user to confirm the `Week reset` variant fires on Saturday.

No code changes are proposed in this plan — it is investigation output only. Approve to proceed with the dry-run previews above, or tell me to stop here.
