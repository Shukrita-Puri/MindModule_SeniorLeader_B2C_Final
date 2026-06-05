import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Mirrors the slot-3 post-phase validity helper inside
// generate-mastery-plan/index.ts. Slot 3 only fires for a `post` phase
// candidate when the underlying event has actually ended (or is within the
// closing 15 min). Missing/malformed endTime or an event still clearly in
// progress means the post-phase candidate is invalid and slot 3 must fall
// back to state-management or be dropped — never padded as a duplicate.
type Cand = { phase: 'pre' | 'during' | 'post'; eventId: string };
type Ev = { id: string; startTime?: string; endTime?: string };

function isPostPhaseValid(cand: Cand, events: Ev[], nowMs: number): boolean {
  if (cand.phase !== 'post') return true;
  const ev = events.find(e => e.id === cand.eventId);
  const endRaw = ev?.endTime ?? ev?.startTime;
  if (!endRaw) return false;
  const endMs = new Date(endRaw).getTime();
  if (!Number.isFinite(endMs)) return false;
  return (endMs - nowMs) <= 15 * 60_000;
}

const NOW = new Date("2026-01-15T15:00:00Z").getTime();

Deno.test("post-phase valid — event ended in the past", () => {
  const ev = { id: "e1", startTime: "2026-01-15T13:00:00Z", endTime: "2026-01-15T14:00:00Z" };
  assertEquals(isPostPhaseValid({ phase: 'post', eventId: 'e1' }, [ev], NOW), true);
});

Deno.test("post-phase valid — event ending within next 15 min", () => {
  const ev = { id: "e1", startTime: "2026-01-15T14:00:00Z", endTime: "2026-01-15T15:10:00Z" };
  assertEquals(isPostPhaseValid({ phase: 'post', eventId: 'e1' }, [ev], NOW), true);
});

Deno.test("post-phase invalid — event still in progress (ends >15 min out)", () => {
  const ev = { id: "e1", startTime: "2026-01-15T14:30:00Z", endTime: "2026-01-15T16:00:00Z" };
  assertEquals(isPostPhaseValid({ phase: 'post', eventId: 'e1' }, [ev], NOW), false);
});

Deno.test("post-phase invalid — endTime missing and no startTime fallback", () => {
  const ev = { id: "e1" };
  assertEquals(isPostPhaseValid({ phase: 'post', eventId: 'e1' }, [ev], NOW), false);
});

Deno.test("post-phase invalid — endTime malformed", () => {
  const ev = { id: "e1", endTime: "not-a-date" };
  assertEquals(isPostPhaseValid({ phase: 'post', eventId: 'e1' }, [ev], NOW), false);
});

Deno.test("post-phase invalid — event not in calendar at all", () => {
  assertEquals(isPostPhaseValid({ phase: 'post', eventId: 'missing' }, [], NOW), false);
});

Deno.test("pre/during phases are not gated by this rule", () => {
  assertEquals(isPostPhaseValid({ phase: 'pre', eventId: 'x' }, [], NOW), true);
  assertEquals(isPostPhaseValid({ phase: 'during', eventId: 'x' }, [], NOW), true);
});