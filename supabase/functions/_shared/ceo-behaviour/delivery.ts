/**
 * CLUSTER: Delivery (nudge-scope only)
 * SOURCE: ported from smart-nudges/index.ts offline/DND/airplane-mode handling
 *         and user direction (offline → defer until online; DND → suppress until
 *         window ends; stale anchor → drop; batched-on-return → coalesce).
 *
 * SCOPE: nudge-only. Brief and plan are pulled by the client; they have no
 *        delivery concerns of their own.
 *
 * BOUNDARY: these rules are pure shape predicates. The edge function still owns
 *           the outbox, APNS dispatch, retry mechanics, and any side-effecting
 *           behaviour. A rule says "defer until online" — the edge function is
 *           the one that actually parks the nudge in the outbox and re-fires it
 *           when the device returns.
 *
 * SIGNALS CONSUMED: deviceOnline, dndActive, dndEndsInMinutes, airplaneModeActive,
 *                   lastSeenOnlineMinutesAgo + RuleContext.upcomingEvents for the
 *                   anchor-event staleness check.
 */

import type { BehaviourFlag, RuleContext } from "../brief-context.ts";

/** Default TTL — if the nudge's anchor event has passed by more than this many
 *  minutes by the time we'd re-fire, the nudge is stale and should be dropped. */
const STALE_NUDGE_TTL_MIN = 30;

/** Window for coalescing multiple deferred nudges into one push on return. */
const RETURN_BATCH_WINDOW_MIN = 15;

/** Defer when device is offline or in airplane mode. Edge routes into outbox. */
export function nudgeDeferOffline(ctx: RuleContext): BehaviourFlag | null {
  const { signals } = ctx;
  const offline = signals.deviceOnline === false;
  const airplane = signals.airplaneModeActive === true;
  if (!offline && !airplane) return null;

  const evidence: string[] = [];
  if (offline) evidence.push("device offline");
  if (airplane) evidence.push("airplane mode");

  return {
    rule: "nudgeDeferOffline",
    severity: "medium",
    evidence,
    stake: "Operational Drive",
    copyHint: "defer-until-online",
  };
}

/** Suppress nudges during an active DND window. Edge holds and re-evaluates. */
export function nudgeSuppressDND(ctx: RuleContext): BehaviourFlag | null {
  const { signals } = ctx;
  if (signals.dndActive !== true) return null;
  if (signals.dndEndsInMinutes == null) return null;

  return {
    rule: "nudgeSuppressDND",
    severity: "medium",
    evidence: [`DND ends in ${signals.dndEndsInMinutes}min`],
    stake: "Internal Buffer",
    copyHint: "suppress-until-dnd-ends",
  };
}

/**
 * Drop a deferred nudge whose original anchor event has already passed by more
 * than STALE_NUDGE_TTL_MIN by the time we're back online.
 *
 * Heuristic: if the device just came back online (deviceOnline === true AND
 * lastSeenOnlineMinutesAgo >= STALE_NUDGE_TTL_MIN) AND no upcoming event in the
 * next STALE_NUDGE_TTL_MIN minutes that the nudge could still anchor to, the
 * nudge is stale. Edge function drops without dispatch.
 */
export function nudgeStaleSkip(ctx: RuleContext): BehaviourFlag | null {
  const { signals } = ctx;
  if (signals.deviceOnline !== true) return null;
  const offlineFor = signals.lastSeenOnlineMinutesAgo;
  if (offlineFor == null || offlineFor < STALE_NUDGE_TTL_MIN) return null;

  const anchorStillAhead = ctx.upcomingEvents.some(
    (e) => e.minutesUntil >= 0 && e.minutesUntil <= STALE_NUDGE_TTL_MIN,
  );
  if (anchorStillAhead) return null;

  return {
    rule: "nudgeStaleSkip",
    severity: "low",
    evidence: [`offline ${offlineFor}min`, "no near-term anchor"],
    stake: "Mental Bandwidth",
    copyHint: "drop-stale",
  };
}

/**
 * Coalesce multiple deferred nudges that would all land within
 * RETURN_BATCH_WINDOW_MIN of the device returning online into one push.
 * Edge owns the actual queue inspection; this rule just flags the policy.
 * The rule fires when the user *just* returned online (within the batch
 * window), so the edge function knows to drain its outbox as a batch rather
 * than fire each nudge separately.
 */
export function nudgeBatchOnReturn(ctx: RuleContext): BehaviourFlag | null {
  const { signals } = ctx;
  if (signals.deviceOnline !== true) return null;
  const offlineFor = signals.lastSeenOnlineMinutesAgo;
  if (offlineFor == null || offlineFor < 1) return null;
  if (offlineFor > RETURN_BATCH_WINDOW_MIN) return null;

  return {
    rule: "nudgeBatchOnReturn",
    severity: "low",
    evidence: [`back online ${offlineFor}min ago`],
    stake: "Mental Bandwidth",
    copyHint: "batch-coalesce",
  };
}