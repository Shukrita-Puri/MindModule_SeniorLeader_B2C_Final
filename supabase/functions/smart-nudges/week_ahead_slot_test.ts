// Week-Ahead invite: owns its own iOS collapse id and SPENDS the evening slot.
//
// Regression guard for the Sunday 6 Sep incident: the invite was sent at
// 16:00 local, then the 19:00 evening close-out reused the SAME collapse id
// (`smart-nudge-evening-<date>`), which on iOS replaces the earlier
// notification on the lock screen. The invite also failed to register as an
// evening send, so the second push was never suppressed.
//
// index.ts calls `serve()` at module scope, so these are source-level
// assertions (same pattern as suppression_dry_run_test.ts).

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("week-ahead invite uses a dedicated collapse id", () => {
  assert(
    /function weekAheadCollapseId\([\s\S]*?smart-nudge-week-ahead-\$\{localDate\}/
      .test(SRC),
    "weekAheadCollapseId must produce smart-nudge-week-ahead-<date>",
  );
  assert(
    SRC.includes("collapseId: weekAheadCollapseId(todayStr)"),
    "the week-ahead dispatch must use weekAheadCollapseId",
  );
  assert(
    !/notificationType: "week_ahead[\s\S]{0,4000}?collapseId: periodCollapseId\("evening"/
      .test(SRC),
    "the week-ahead dispatch must not reuse the evening collapse id",
  );
});

Deno.test("a delivered week-ahead invite counts as the evening slot", () => {
  const fn = SRC.slice(
    SRC.indexOf("export function slotFromNotificationLogRow"),
  ).slice(0, 1400);
  assert(
    fn.includes('type === "week_ahead_picker_invite"'),
    "slotFromNotificationLogRow must map week_ahead_picker_invite to evening",
  );
  const eveningBranch = fn.slice(fn.indexOf('type === "nudge_three"'));
  assert(
    eveningBranch.indexOf('week_ahead_picker_invite') <
      eveningBranch.indexOf('return "evening"'),
    "week_ahead_picker_invite must sit inside the evening branch",
  );
});

Deno.test("week-ahead copy names the week ahead and opens the Plan page", () => {
  const block = SRC.slice(
    SRC.indexOf("async function evaluateWeekAheadPickerInvite"),
  ).slice(0, 9000);
  const variants = block.slice(block.indexOf("const variantByReason"));
  const titles = [...variants.matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
  assert(titles.length >= 3, "expected the per-reason variant titles");
  for (const t of titles) {
    assert(
      t === "Week ahead priorities",
      `unexpected week-ahead title: ${t}`,
    );
  }
  assert(
    block.includes('deepLinkRoute: "/plan?mode=week-ahead"'),
    "the invite must deep link to the Plan page in week-ahead mode",
  );
});
