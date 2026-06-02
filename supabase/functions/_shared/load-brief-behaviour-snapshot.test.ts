import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  loadBriefBehaviourSnapshot,
  snapshotToWiring,
  briefAnchorEventTitles,
  type PersistedBriefBehaviourSnapshot,
} from "./load-brief-behaviour-snapshot.ts";

// Minimal stub matching the chained PostgREST surface used by the loader.
// Records the .eq() filters applied so tests can assert disambiguation.
function makeSupabaseStub(row: any) {
  const calls: Array<{ col: string; val: any }> = [];
  const builder: any = {
    select() { return builder; },
    eq(col: string, val: any) { calls.push({ col, val }); return builder; },
    order() { return builder; },
    limit() { return builder; },
    async maybeSingle() { return { data: row, error: null }; },
  };
  return { from() { return builder; }, _calls: calls };
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
    prompt_version: "v6.2-stable-brief-cache",
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
  // Persisted prompt blocks are surfaced for Plan/Nudge consumption.
  assertEquals(got!.promptBlockBrief, FIXTURE.promptBlockBrief);
  assertEquals(got!.promptBlockPlan, FIXTURE.promptBlockPlan);
  assertEquals(got!.promptVersion, "v6.2-stable-brief-cache");
  assertEquals(got!.inputSignature, "sig-1");
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

Deno.test("loadBriefBehaviourSnapshot disambiguates by promptVersion + inputSignature", async () => {
  const supa = makeSupabaseStub({
    id: "row-3",
    input_signature: "sig-X",
    prompt_version: "v6.2-stable-brief-cache",
    payload_json: { behaviour_snapshot: FIXTURE },
  });
  await loadBriefBehaviourSnapshot(
    supa as any,
    "user-1",
    "2026-06-02",
    "morning",
    { promptVersion: "v6.2-stable-brief-cache", inputSignature: "sig-X" },
  );
  const cols = (supa as any)._calls.map((c: any) => c.col);
  assert(cols.includes("prompt_version"), "expected prompt_version filter");
  assert(cols.includes("input_signature"), "expected input_signature filter");
});

Deno.test("loadBriefBehaviourSnapshot rejects stale snapshot on signatureHash mismatch", async () => {
  const supa = makeSupabaseStub({
    id: "row-4",
    input_signature: "sig-old",
    prompt_version: "v6.2-stable-brief-cache",
    payload_json: { behaviour_snapshot: { ...FIXTURE, signatureHash: "stale123" } },
  });
  const got = await loadBriefBehaviourSnapshot(
    supa as any,
    "user-1",
    "2026-06-02",
    "morning",
    { expectedSignatureHash: "deadbeef" },
  );
  assertEquals(got, null);
});

Deno.test("loadBriefBehaviourSnapshot tolerates legacy snapshots without prompt blocks", async () => {
  // Legacy row written before promptBlockBrief/promptBlockPlan were persisted.
  const legacy = {
    signatureHash: "legacy01",
    flagsBrief: FIXTURE.flagsBrief,
    flagsPlan: FIXTURE.flagsPlan,
    slotBoosts: FIXTURE.slotBoosts,
    taxonomyBlock: FIXTURE.taxonomyBlock,
  };
  const supa = makeSupabaseStub({
    id: "row-5",
    input_signature: "sig-legacy",
    payload_json: { behaviour_snapshot: legacy },
  });
  const got = await loadBriefBehaviourSnapshot(
    supa as any,
    "user-1",
    "2026-06-02",
    "morning",
  );
  assert(got, "legacy snapshot should still load");
  assertEquals(got!.promptBlockBrief, undefined);
  assertEquals(got!.promptBlockPlan, undefined);
  // snapshotToWiring reconstructs the advisory block locally on fallback.
  const wiring = snapshotToWiring(got!, "plan");
  assert(wiring && wiring.promptBlock.includes("ACTIVE CEO BEHAVIOURS"));
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