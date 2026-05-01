---
name: Smart Nudges CTA A/B experiment v2 (V8 mind-prep verbs)
description: Smart Nudges runs a 4-arm A/B test on the trailing qualified mind-prep CTA verb to find which lure drives the highest tap → app_open → target_action rate. Variants are user×family stable (same user always sees same arm per nudge family). V8 supersedes V1 — every arm is now a qualified MENTAL-prep verb (mind / state / recalibrate / close / set / land).
type: feature
---
**Experiment id**: `cta-action-verb-v2` (V8). Old `cta-action-verb-v1` rows belong to V5–V7 traffic and must not be pooled with V8.
**Where**: `supabase/functions/smart-nudges/index.ts` (`assignCtaVariant`, `applyCtaVariant`, `CTA_PHRASES`).
**V8 arms** (~25% each, FNV-1a hash of `userId::nudgeFamily`):
- **A** control / morning anchor — `check in to set your intention` (brief route) / `log in to prep your mind` (plan route)
- **B** state-framed — `check in to recalibrate` / `log in to prep your state`
- **C** urgency / recovery — `log in to recalibrate your mind` / `log in to prep your mind`
- **D** close-of-day / week — `check in to close the day` / `check in to close the week`

Every verb qualifies the prep as MENTAL (mind / state / recalibrate / close / set / land). Unqualified "prep" verbs (`open the app to prep`, `prep now`, etc.) and passive consumption verbs (`your prep is ready`, `tap to prep`) are banned in `FORBIDDEN_WORDS_V6` so the AI cannot regress.

Logged on `notification_log.payload`: `cta_variant` ('A'|'B'|'C'|'D'), `cta_experiment` (`cta-action-verb-v2` for V8 traffic), `architecture` (`cos-mind-v8-meaning-forward`). `variant_id` is suffixed with `::A|B|C|D` so per-copy×variant slicing is possible.

**Read results**:
```sql
SELECT payload->>'cta_variant' AS arm,
       count(*) AS sent,
       count(*) FILTER (WHERE tapped) AS tapped,
       count(*) FILTER (WHERE app_opened) AS opened,
       count(*) FILTER (WHERE target_action_completed) AS completed,
       round(100.0 * count(*) FILTER (WHERE tapped) / NULLIF(count(*),0), 2) AS tap_rate_pct
FROM notification_log
WHERE payload->>'cta_experiment' = 'cta-action-verb-v2'
  AND sent_at > now() - interval '14 days'
GROUP BY 1 ORDER BY 1;
```
Engagement is written by `useNotificationEngagement` (already in client) — no schema changes were needed.
