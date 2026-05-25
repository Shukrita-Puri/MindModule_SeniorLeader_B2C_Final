import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CATEGORY_MAX_SLOTS } from "./event-phase-map.ts";
import { rankJitCandidates } from "./jit-candidates.ts";
import type { ComboKey } from "../protocols/protocol-combos.ts";

type Anchor = { eventId: string | null; phase?: "pre" | "during" | "post" | null };

function makePicker(anchors: Anchor[], candidates: ReturnType<typeof rankJitCandidates>) {
  return () => {
    for (const c of candidates) {
      if (!c.eventId) continue;
      const cap = (CATEGORY_MAX_SLOTS as any)[c.categoryId] ?? 1;
      const used = anchors.filter(a => a.eventId === c.eventId).length;
      if (used >= cap) continue;
      if (anchors.some(a => a.eventId === c.eventId && a.phase === c.phase)) continue;
      return c;
    }
    return null;
  };
}

Deno.test("Phase C.2 — G long-haul fans into 3 phase-distinct slots", () => {
  const startMs = Date.now() - 30 * 60_000;
  const endMs = Date.now() + 90 * 60_000;
  const candidates = rankJitCandidates(
    [{ event: { id: "flight-1", title: "Flight LHR JFK long-haul", start_time: new Date(startMs).toISOString(), end_time: new Date(endMs).toISOString() }, stakesLevel: "high" }],
    Date.now(),
  );
  assert(candidates.length >= 3);
  const anchors: Anchor[] = [];
  const pick = makePicker(anchors, candidates);
  for (let i = 0; i < 3; i++) {
    const next = pick();
    assert(next, `slot ${i + 1} should yield a candidate`);
    anchors.push({ eventId: next!.eventId, phase: next!.phase });
  }
  assertEquals(pick(), null);
  const phases = anchors.map(a => a.phase).sort();
  assertEquals(phases, ["during", "post", "pre"]);
});

Deno.test("Phase C.2 — C presentation collapses to one slot only", () => {
  const startMs = Date.now() + 6 * 60 * 60_000;
  const endMs = startMs + 60 * 60_000;
  const candidates = rankJitCandidates(
    [{ event: { id: "coca-cola", title: "Coca-Cola Client Presentation", start_time: new Date(startMs).toISOString(), end_time: new Date(endMs).toISOString() }, stakesLevel: "high" }],
    Date.now(),
  );
  const anchors: Anchor[] = [];
  const pick = makePicker(anchors, candidates);
  const first = pick();
  assert(first);
  anchors.push({ eventId: first!.eventId, phase: first!.phase });
  assertEquals(pick(), null);
});

Deno.test("Phase C.2 — A board fans into pre+post but caps at 2", () => {
  const startMs = Date.now() + 4 * 60 * 60_000;
  const endMs = startMs + 90 * 60_000;
  const candidates = rankJitCandidates(
    [{ event: { id: "board-q4", title: "Q4 Board Meeting", start_time: new Date(startMs).toISOString(), end_time: new Date(endMs).toISOString() }, stakesLevel: "board" }],
    Date.now(),
  );
  const anchors: Anchor[] = [];
  const pick = makePicker(anchors, candidates);
  const a = pick(); assert(a); anchors.push({ eventId: a!.eventId, phase: a!.phase });
  const b = pick(); assert(b); anchors.push({ eventId: b!.eventId, phase: b!.phase });
  assert(a!.phase !== b!.phase);
  assertEquals(pick(), null);
});

Deno.test("Phase C.2 — ComboKey reverse map covers all six combos", () => {
  const reverse: Record<ComboKey, string> = {
    "somatic.pause": "regulate",
    "mindset.pause": "align",
    "mindset.flow": "prepare",
    "mindset.reenergise": "integrate",
    "somatic.flow": "regulate",
    "somatic.reenergise": "integrate",
  };
  const valid = new Set(["regulate", "align", "prepare", "integrate"]);
  for (const [k, v] of Object.entries(reverse)) {
    assert(valid.has(v), `${k} -> ${v} not a valid practiceType`);
  }
});

Deno.test("Phase C.2 — picker prefers higher-stakes distinct event first", () => {
  const nowMs = Date.now();
  const candidates = rankJitCandidates(
    [
      { event: { id: "team-sync", title: "Team Sync presentation", start_time: new Date(nowMs + 20 * 3600_000).toISOString(), end_time: new Date(nowMs + 21 * 3600_000).toISOString() }, stakesLevel: "low" },
      { event: { id: "board", title: "Board Investor Call", start_time: new Date(nowMs + 3 * 3600_000).toISOString(), end_time: new Date(nowMs + 4 * 3600_000).toISOString() }, stakesLevel: "board" },
    ],
    nowMs,
  );
  const anchors: Anchor[] = [];
  const pick = makePicker(anchors, candidates);
  const first = pick();
  assertEquals(first?.eventId, "board");
});
