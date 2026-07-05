// Regression test: the legacy single-sample POST shape
// ({ summary_date, hrv, ... } without a `samples` array) must be rejected.
//
// The old branch defaulted every metric to `null` before the atomic merge,
// so a partial payload could silently erase canonical HRV / RHR / sleep
// values that had been written earlier from a richer bulk payload. Removing
// the branch is the fix; this test locks that in.
//
// We do NOT boot the Deno.serve handler here (it needs SUPABASE env + auth).
// Instead we assert the source file no longer contains the legacy row
// construction and does contain the explicit 400 rejection, which is enough
// to catch a regression during code review or a copy/paste revival.

import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);

Deno.test("persist-wearable-data — legacy single-sample body path is gone", () => {
  // The legacy path destructured these defaults; if any of these lines come
  // back, unset metrics will start nulling existing DB values again.
  const forbiddenFragments = [
    "hrv = null,",
    "resting_heart_rate = null,",
    "heart_rate = null,",
    "steps = null,",
    "sleep_score = null,",
    "total_sleep_minutes = null,",
  ];
  for (const f of forbiddenFragments) {
    assert(
      !src.includes(f),
      `Legacy single-sample destructuring reintroduced: ${f}`,
    );
  }
});

Deno.test("persist-wearable-data — legacy shape now returns a clear 400", () => {
  assertStringIncludes(src, "unsupported_payload_shape");
  assertStringIncludes(src, "Legacy single-sample body is no longer accepted");
});

Deno.test("persist-wearable-data — bulk path still uses presence-aware assignment", () => {
  // Bulk path is the SSOT for presence semantics. If someone rewrites this
  // block to unconditionally set metrics, the whole point of removing the
  // legacy path is lost.
  assertStringIncludes(src, "if (sample.hrv != null) row.hrv = sample.hrv");
  assertStringIncludes(
    src,
    "if (sample.resting_heart_rate != null) row.resting_heart_rate = sample.resting_heart_rate",
  );
  assertStringIncludes(
    src,
    "if (sample.total_sleep_minutes != null) row.total_sleep_minutes = sample.total_sleep_minutes",
  );
});
