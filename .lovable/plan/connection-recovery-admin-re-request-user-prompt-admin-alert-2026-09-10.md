# Connection recovery: admin re-request, user prompt, admin alerts

Three additions, all built on surfaces that already exist. No change to scoring, Brief, Plan, MRS, or any existing practice.

## 1. Admin: "Re-request sync" button with retry counter

On the User Diagnostics page, inside the HealthKit card, add a single button:
"Re-request HealthKit sync". It is only enabled when the watch is disconnected,
permission-revoked, or the sync status is delayed/error.

Pressing it:
- flags that user so the reconnect prompt appears on their next app open
- schedules a push reminder if they still have not reconnected after 3 days
- increments a retry counter

Under the button the admin sees: "Requested 3 times · last 8 Sep, 14:22 · last
push sent 9 Sep". Requests are rate-limited to one per user per 24 hours; the
button is disabled with an explanatory line until the window passes. The flag
clears automatically once the watch reports connected and syncing.

## 2. User-facing prompt (both surfaces, as agreed)

**Popup on next app open** — reuses the same card style and behaviour as the
post-meeting "How did that go?" prompt on the home screen. Copy:

> "Your Apple Watch data has stopped coming through."
> "Readiness scores will drift without it."
> Buttons: "Manage connections" (goes to the connections page) · "Not now"

"Not now" snoozes for 5 days, at most 3 shows total. The same component covers a
disconnected calendar with calendar-specific copy. Only one prompt shows per day,
and it never appears alongside the post-meeting prompt.

**Push follow-up** — if the user has not reconnected 3 days after the popup was
first shown, one push goes out through the existing nudge schedule, respecting
quiet hours and notification preferences, and opens the connections page. Maximum
one push per issue per 14 days.

The prompt also triggers on its own, without an admin request, when the watch has
been disconnected or silent for 3+ days — so most users are recovered before an
admin ever looks.

## 3. Admin alerts panel

A new "Connection health alerts" panel at the top of the User Diagnostics page,
read-only, listing users who are currently in trouble:
- watch disconnected, permission revoked, or no sample for 3+ days
- no active push token, or every recent push to them was rejected by Apple

Each row shows the user's name, email, user ID, what is wrong, how long it has
been wrong, and how many re-requests have already been sent. Clicking a row loads
that user into the diagnostics cards below. Counts by category sit at the top.

## Technical notes

- New table `connection_recovery_requests`: `user_id`, `issue` (`wearable` |
  `calendar` | `push`), `attempts`, `requested_by`, `last_requested_at`,
  `first_prompt_shown_at`, `last_prompt_shown_at`, `prompt_dismiss_count`,
  `push_sent_at`, `resolved_at`. RLS: user may read/update only their own row
  (prompt-shown/dismiss fields); all writes from edge functions via service role;
  `GRANT` statements included in the migration.
- New edge function `admin-connection-recovery` (admin-guarded, `requireAdmin`):
  `POST` upserts a request row, increments `attempts`, enforces the 24h window.
- Extend `admin-user-diagnostics` with a `mode=alerts` listing that joins
  `user_integrations`, `calendar_connections`, `notification_device_tokens`, and
  recent `notification_log` APNs status, plus per-user recovery-request state.
- New `src/components/home/ConnectionRecoveryPrompt.tsx` modelled on
  `EventOutcomeFeedbackModal`, mounted in `ExecutiveHome` behind a hook that reads
  `useExecutiveConnectionStatus` plus the recovery row; "Manage connections"
  navigates to the existing connections route.
- Push: new `connection_recovery` notification type in `smart-nudges`, gated on an
  unresolved recovery row older than 3 days, deduped via `notification_log`.
- Auto-resolve: `wearable-status-update` and the calendar sync path stamp
  `resolved_at` when the connection reports healthy again.

## Out of scope

No changes to readiness scoring, Brief, Plan, JIT, practices, onboarding, or the
existing connections UI itself.
