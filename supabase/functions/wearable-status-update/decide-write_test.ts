import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { decideWrite, type CurrentRow } from "./decide-write.ts";

const T0 = "2026-07-11T10:00:00.000Z";
const T1 = "2026-07-11T10:05:00.000Z";
const T2 = "2026-07-11T10:10:00.000Z";

function row(partial: Partial<CurrentRow>): CurrentRow {
  return {
    watch_sync_status: partial.watch_sync_status ?? null,
    watch_last_error: partial.watch_last_error ?? null,
    watch_status_source: partial.watch_status_source ?? null,
    watch_status_authoritative_at: partial.watch_status_authoritative_at ?? null,
  };
}

Deno.test("first-ever write always applies", () => {
  const d = decideWrite(null, { status: "waiting_for_data", source: "native-ios", authoritativeAt: T0 });
  assertEquals(d.apply, true);
});

Deno.test("newer native synced beats older native waiting", () => {
  const cur = row({ watch_sync_status: "waiting_for_data", watch_status_source: "native-ios", watch_status_authoritative_at: T0 });
  const d = decideWrite(cur, { status: "synced", source: "native-ios", authoritativeAt: T1 });
  assertEquals(d.apply, true);
});

Deno.test("older native cannot downgrade newer synced", () => {
  const cur = row({ watch_sync_status: "synced", watch_status_source: "native-ios", watch_status_authoritative_at: T2 });
  const d = decideWrite(cur, { status: "waiting_for_data", source: "native-ios", authoritativeAt: T0 });
  assertEquals(d.apply, false);
});

Deno.test("newer native downgrade is allowed (permission revoked case)", () => {
  const cur = row({ watch_sync_status: "synced", watch_status_source: "native-ios", watch_status_authoritative_at: T0 });
  const d = decideWrite(cur, { status: "permission_revoked", source: "native-ios", authoritativeAt: T2 });
  assertEquals(d.apply, true);
});

Deno.test("JS opportunistic write cannot downgrade native synced (even with newer clock)", () => {
  const cur = row({ watch_sync_status: "synced", watch_status_source: "native-ios", watch_status_authoritative_at: T0 });
  const d = decideWrite(cur, { status: "waiting_for_data", source: "js-opportunistic", authoritativeAt: T2 });
  assertEquals(d.apply, false);
});

Deno.test("JS opportunistic write cannot regress older native record", () => {
  const cur = row({ watch_sync_status: "waiting_for_data", watch_status_source: "native-ios", watch_status_authoritative_at: T2 });
  const d = decideWrite(cur, { status: "sync_delayed", source: "js-opportunistic", authoritativeAt: T0 });
  assertEquals(d.apply, false);
});

Deno.test("synced short-circuit heals any non-synced state regardless of source", () => {
  const cur = row({ watch_sync_status: "sync_delayed", watch_status_source: "js-opportunistic", watch_status_authoritative_at: T2 });
  const d = decideWrite(cur, { status: "synced", source: "native-ios", authoritativeAt: T0 });
  assertEquals(d.apply, true);
});

Deno.test("idempotent same-timestamp refresh applies", () => {
  const cur = row({ watch_sync_status: "synced", watch_status_source: "native-ios", watch_status_authoritative_at: T1 });
  const d = decideWrite(cur, { status: "synced", source: "native-ios", authoritativeAt: T1 });
  assertEquals(d.apply, true);
});