---
name: Smart Nudges MVP framework
description: 3-nudge MVP (Nudge 1 morning / Nudge 2 mid-day / Nudge 3 evening) with v6 Chief-of-Staff copy contract. Every body follows [USER CONTEXT] + [SPECIFIC APP CTA]. Stamped architecture='cos-mind-v6-cta'.
type: feature
---

**File**: `supabase/functions/smart-nudges/index.ts` (cron `*/10 * * * *`).

**Three nudge slots per user per day** (daily cap = 3, 2-hour suppression, quiet hours, in-meeting suppression, 60-min post-app-open cool-down). Variants inside each slot: `nudge_one_morning | nudge_one_jit`, `nudge_two_jit | nudge_two_priorities | nudge_two_recalibrate | nudge_two_reserves | nudge_two_consecutive_low`, `nudge_three`.

**v6 copy contract — Chief of Staff for the Mind**

Every body MUST follow:
```
[USER CONTEXT — one specific signal from THIS user's data] + [SPECIFIC APP CTA — exact action + screen]
```

Hard rules (enforced in AI system prompt + `violatesCopyContractV6` lint + each `getFallback*` returns):
- Title ≤ 6 words. Body ≤ 18 words.
- Body MUST end with one of these CTA verbs verbatim: `open your brief`, `open your plan`, `open your prep plan`, `build your prep plan`, `recalibrate now`, `close the day`, `close the week`, `lock in your prep`.
- Body MUST cite a real signal already in `NudgeContext`: `wearable.hrvDeltaPct`, `wearable.rhrElevated`, `wearable.sleepScore`, named meeting title (truncated to first 3 words if > 20 chars via `truncateEventTitle`), meeting count, completed/pending priority count, `morningCheckinOutcome`, consecutive-low count, or tomorrow's meetings.
- If a referenced field is null → fall through to next template. Never insert placeholder `?`, `N`, `--`, `{x}`.
- Forbidden words: wellness, mindful, mindfulness, relax, breathe, calm, recharge, self-care, streak, "keep it up", "well done", "great job", productive, productivity, intent, strategy, strategic, "set the tone", "your day your terms", "loaded day", "5 days behind you", "plan the week", "come back", "check in when ready".
- AI output that fails any check is rejected and the static fallback is sent.

**Payload stamps**: `architecture: 'cos-mind-v6-cta'`, `cta_experiment: 'cta-action-verb-v1'`, `cta_variant`, `deep_link_route`.

**Untouched in v6**: triggers, timing windows, daily cap, suppression stack, engagement learning, APNs delivery, deep-link routing, signal-richness gate, artifact-first gating, all client code.
