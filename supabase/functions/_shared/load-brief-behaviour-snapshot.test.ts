import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  loadBriefBehaviourSnapshot,
  snapshotToWiring,
  briefAnchorEventTitles,
  type PersistedBriefBehaviourSnapshot,
} from "./load-brief-behaviour-snapshot.ts";

// Minimal stub matching the chained PostgREST surface used by the loader.
function makeSupabaseStub(row: any) {
  const builder: any = {
    select() { return builder; },
    eq() { return builder; },
    order() { return builder; },
    limit() { return builder; },
    async maybeSingle() { return { data: row, error: null }; },
  };
  return { from() { return builder; } };
}

const FIXTURE: PersistedBriefBehaviourSnapshot = {
  signatureHash: "deadbeef",
  flagsBrief: [{
    rule: "highStakesPrep",
    severity: "high",
    anchorEvent: "Board Meeting Q2",
    stake: "board",
    copyHint: "Anchor presence before board.",
    evidence: ["board:Board Meeting Q2"],
  } as any],
  flagsPlan: [{
    rule: "highStakesPrep",
    severity: "high",
    anchorEvent: "Board Meeting Q2",
    stake: "board",
    copyHint: "Boost prepare slot before board.",
    evidence: ["board:Board Meeting Q2"],
  } as any],
  slotBoosts: [{
    practiceType: "prepare",
    slot: "start_of_day",
    severity: "high",
    reason: "highStakesPrep:Board Meeting Q2",
  } as any],
  taxonomyBlock: "=== EVENT TAXONOMY ===\n- Board Meeting Q2 → Pillar A",
  promptBlockBrief: "=== ACTIVE CEO BEHAVIOURS ===\n- highStakesPrep [high] @\"Board Meeting Q2\"",
  promptBlockPlan: "=== ACTIVE CEO BEHAVIOURS ===\n- highStakesPrep [high] @\"Board Meeting Q2\" (plan)",
};

Deno.test("loadBriefBehaviourSnapshot returns the persisted shape", async () => {
  const supa = makeSupabaseStub({
    id: "row-1",
    input_signature: "sig-1",
    payload_json: { behaviour_snapshot: FIXTURE },
  });
  const got = await loadBriefBehaviourSnapshot(
    supa as any,
    "user-1",
    "2026-06-02",
    "morning",
  );
  assert(got, "expected snapshot");
  assertEquals(got!.briefSnapshotId, "row-1");
  assertEquals(got!.flagsPlan[0].anchorEvent, "Board Meeting Q2");
  assertEquals(got!.slotBoosts[0].practiceType, "prepare");
  assertEquals(got!.source, "brief_snapshot");
});

Deno.test("loadBriefBehaviourSnapshot returns null when payload absent", async () => {
  const supa = makeSupabaseStub({ id: "row-2", payload_json: {} });
  const got = await loadBriefBehaviourSnapshot(
    supa as any,
    "user-1",
    "2026-06-02",
    "morning",
  );
  assertEquals(got, null);
});

Deno.test("snapshotToWiring 'plan' uses flagsPlan + slotBoosts + promptBlockPlan", () => {
  const wiring = snapshotToWiring(FIXTURE, "plan");
  assert(wiring);
  assertEquals(wiring!.flags, FIXTURE.flagsPlan);
  assertEquals(wiring!.slotBoosts, FIXTURE.slotBoosts);
  assertEquals(wiring!.promptBlock, FIXTURE.promptBlockPlan);
});

Deno.test("snapshotToWiring 'brief' uses flagsBrief and zeroes slotBoosts", () => {
  const wiring = snapshotToWiring(FIXTURE, "brief");
  assert(wiring);
  assertEquals(wiring!.flags, FIXTURE.flagsBrief);
  assertEquals(wiring!.slotBoosts, []);
  assertEquals(wiring!.promptBlock, FIXTURE.promptBlockBrief);
});

Deno.test("snapshotToWiring 'nudge' reuses brief flags, no slot boosts", () => {
  const wiring = snapshotToWiring(FIXTURE, "nudge");
  assert(wiring);
  assertEquals(wiring!.flags, FIXTURE.flagsBrief);
  assertEquals(wiring!.slotBoosts, []);
});

Deno.test("briefAnchorEventTitles dedupes anchors across brief + plan flags", () => {
  const titles = briefAnchorEventTitles(FIXTURE);
  assertEquals(titles, ["Board Meeting Q2"]);
});

Deno.test("snapshotToWiring null in → null out", () => {
  assertEquals(snapshotToWiring(null, "plan"), null);
});