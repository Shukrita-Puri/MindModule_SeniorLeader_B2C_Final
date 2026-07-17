import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const MIGRATION = await Deno.readTextFile(
  new URL("../../migrations/20260623151830_59c22e1f-a221-4064-a00a-bfaccc27c433.sql", import.meta.url),
);

Deno.test("smart-nudges creates durable run and per-user trace records", () => {
  assert(SRC.includes("notification_evaluator_runs"), "missing run table writes");
  assert(SRC.includes("notification_evaluator_traces"), "missing per-user trace writes");
  assert(SRC.includes("finishRun(null)"), "successful runs must be finalized");
  assert(SRC.includes("zero_users_evaluated_no_active_tokens"), "zero evaluated users must not look like silent success");
});

Deno.test("smart-nudges traces required skip and APNs outcomes", () => {
  // Batch B follow-up — updated to current NotificationTraceOutcome enum.
  //
  // Prior contract: `quiet_day`, `low_power_mode`, `app_open_cooldown`
  // were separate suppression outcomes.
  //
  // Current production contract (see enum in index.ts):
  //   • quiet days are represented by Plan slots upstream — not by a
  //     `quiet_day` trace outcome. The comment above the DND check
  //     documents this: "Quiet/rest days are represented by Plan slots
  //     upstream."
  //   • low-power mode has no server-side signal and is not a trace outcome.
  //   • the app-open cooldown was removed entirely; there is no
  //     `APP_OPEN_COOLDOWN_MS` constant anymore.
  for (const outcome of [
    "no_active_device_token",
    "outside_global_window",
    "dnd_window",
    "daily_cap",
    "two_hour_suppression",
    "light_day_strong_state",
    "no_qualified_nudge",
    "plan_ready_morning_fallback",
    "week_ahead_not_in_window",
    "week_ahead_already_sent_this_week",
    "week_ahead_not_selected",
    "week_ahead_selected",
    "apns_attempted",
    "apns_accepted",
    "apns_rejected",
    "back_to_back_skip",
  ]) {
    assert(SRC.includes(outcome), `missing trace outcome: ${outcome}`);
  }
  // Batch A/B additions that MUST be present.
  assert(SRC.includes("plan_snapshot_empty_fallback"), "plan-fallback trace missing");
  // Removed outcomes MUST NOT be re-added silently.
  for (const gone of ["'quiet_day'", "'low_power_mode'", "'app_open_cooldown'"]) {
    assert(!SRC.includes(gone), `outcome ${gone} was removed and must not be re-added without contract update`);
  }
});

Deno.test("week-ahead copy satisfies the v8 CTA contract instead of post-CTA suppression", () => {
  assert(!SRC.includes("Pick this week's 10 priorities before Monday lands."));
  assert(SRC.includes("10 priority choices can shape the week before Monday lands - log in to prep your mind."));
});

Deno.test("trace tables grant backend access and user-scoped reads", () => {
  assert(MIGRATION.includes("GRANT ALL ON public.notification_evaluator_runs TO service_role"));
  assert(MIGRATION.includes("GRANT ALL ON public.notification_evaluator_traces TO service_role"));
  assert(MIGRATION.includes("Users can view own evaluator traces"));
  assert(MIGRATION.includes("auth.uid()::text = user_id"));
});

Deno.test("APNs environment remains production/sandbox selectable", () => {
  // Batch A: the APP_ENV/APNS_ENVIRONMENT alignment lives in the shared
  // validator (_shared/apns-env.ts) now. smart-nudges must import and
  // apply it. Sandbox/production host selection still happens — the
  // production-host string appears via the validator in the diagnostic
  // probe path.
  assert(SRC.includes("api.push.apple.com"), "production host referenced");
  assert(SRC.includes("api.sandbox.push.apple.com"), "sandbox host referenced");
  assert(SRC.includes("APNS_ENVIRONMENT"), "APNS_ENVIRONMENT read");
  assert(
    SRC.includes('validateApnsEnvironment') &&
      SRC.includes('_shared/apns-env.ts'),
    "smart-nudges must delegate env alignment to _shared/apns-env.ts",
  );
});

Deno.test("smart-nudges reads canonical jit confidence and avoids legacy missing columns", () => {
  const legacyConfidenceColumn = "confidence_" + "band";
  const legacyWearableColumn = "wearable_" + "status";
  const legacyAwaitingColumn = "mrs_" + "awaiting_signals";
  assert(SRC.includes("jit_confidence_score"), "expected jit_confidence_score read");
  assert(!SRC.includes(legacyConfidenceColumn), "legacy jit confidence column should not be queried");
  assert(!SRC.includes(legacyWearableColumn), "legacy daily context wearable column should not be queried");
  assert(!SRC.includes(legacyAwaitingColumn), "legacy daily context awaiting column should not be queried");
});
