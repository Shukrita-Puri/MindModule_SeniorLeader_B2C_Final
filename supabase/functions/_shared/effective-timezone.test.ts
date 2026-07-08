// Sprint 11 tests — resolveEffectiveTimezone must ignore stale
// travel_state rows even if updated_at is fresh (skip-sync bookkeeping).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveEffectiveTimezone } from "./effective-timezone.ts";

function mockDb(travelRow: Record<string, unknown> | null) {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                async maybeSingle() {
                  return { data: travelRow };
                },
              };
            },
          };
        },
      };
    },
  } as any;
}

const NY = "America/New_York";
const LON = "Europe/London";
const now = new Date("2026-07-08T12:00:00Z");

Deno.test("long-haul override applied when last_state_change_at is fresh", async () => {
  const db = mockDb({
    state: "away",
    last_known_timezone: LON,
    meta: { long_haul: true },
    // updated_at is old; producer wrote it days ago
    updated_at: "2026-06-01T00:00:00Z",
    last_state_change_at: "2026-07-06T00:00:00Z", // 2d ago — fresh
    last_location_at: null,
  });
  const r = await resolveEffectiveTimezone(db, "u1", { home_timezone: NY, current_timezone: LON }, now);
  assertEquals(r.effectiveTimezone, LON);
  assertEquals(r.circadianTimezone, NY, "long-haul → circadian stays home");
});

Deno.test("long-haul override applied when last_location_at is fresh", async () => {
  const db = mockDb({
    state: "away",
    last_known_timezone: LON,
    meta: { long_haul: true },
    updated_at: "2026-06-01T00:00:00Z",
    last_state_change_at: null,
    last_location_at: "2026-07-08T06:00:00Z", // 6h ago — fresh
  });
  const r = await resolveEffectiveTimezone(db, "u1", { home_timezone: NY, current_timezone: LON }, now);
  assertEquals(r.circadianTimezone, NY);
});

Deno.test("long-haul override NOT applied when only updated_at is fresh (skip-sync)", async () => {
  const db = mockDb({
    state: "away",
    last_known_timezone: LON,
    meta: { long_haul: true },
    // Sync producer just touched updated_at, but signal is old.
    updated_at: "2026-07-08T11:59:00Z",
    last_state_change_at: "2026-05-01T00:00:00Z", // >14d — stale
    last_location_at: "2026-05-01T00:00:00Z", // >24h — stale
  });
  const r = await resolveEffectiveTimezone(db, "u1", { home_timezone: NY, current_timezone: LON }, now);
  assertEquals(r.circadianTimezone, LON, "stale travel row must NOT trigger circadian override");
});

Deno.test("no signal timestamps — treated as not-away (Sprint 14 freshness)", async () => {
  const db = mockDb({
    state: "away",
    last_known_timezone: LON,
    meta: { long_haul: true },
    updated_at: "2026-07-08T11:59:00Z",
    last_state_change_at: null,
    last_location_at: null,
  });
  const r = await resolveEffectiveTimezone(db, "u1", { home_timezone: NY, current_timezone: LON }, now);
  assertEquals(r.circadianTimezone, LON);
  // Sprint 14: `isAway` is now gated on travel-freshness. A row with no
  // last_state_change_at and no last_location_at is `no_signal` and must
  // NOT be treated as away by any consumer — including effectiveTimezone.
  assertEquals(r.isAway, false);
});
