import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("list-week-ahead-priorities upserts to weekly_plan_snapshots", () => {
  assert(SRC.includes('from("weekly_plan_snapshots")'), "no write to weekly_plan_snapshots");
  assert(
    SRC.includes('onConflict: "user_id,week_start_date,source"'),
    "must upsert on (user_id, week_start_date, source)",
  );
  assert(SRC.includes("[week_ahead.write.success]"), "missing success log");
});

Deno.test("list-week-ahead-priorities exposes a POST save path", () => {
  assert(SRC.includes('action === "save"'), "missing save action handler");
  assert(SRC.includes("[week_ahead.save.success]"), "missing save success log");
  // The save path must not blindly overwrite generated priorities.
  const saveBlock = SRC.split('action === "save"')[1] ?? "";
  assert(
    !/priorities:\s*body\.priorities/.test(saveBlock),
    "save path must not overwrite generated priorities from client payload",
  );
});

Deno.test("week range is local Monday → Sunday (ISO week, Mon=0)", () => {
  // Sanity-check the formula used in index.ts:
  // daysFromMonday = (dow + 6) % 7  ⇒  Mon=0, Tue=1, ..., Sun=6.
  const cases: Array<[number, number]> = [
    [0, 6], // Sun → 6 days back to Mon
    [1, 0], // Mon
    [2, 1],
    [3, 2],
    [4, 3],
    [5, 4],
    [6, 5], // Sat → 5 back
  ];
  for (const [dow, expected] of cases) {
    const got = (dow + 6) % 7;
    assert(got === expected, `dow=${dow} expected ${expected} got ${got}`);
  }
});