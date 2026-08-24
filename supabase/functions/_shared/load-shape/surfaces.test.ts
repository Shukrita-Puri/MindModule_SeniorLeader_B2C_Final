import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  briefShapePromptBlock,
  insightsShapePayload,
  nudgeShapePromptBlock,
  nudgeShapeStacksOnCliff,
  planShapeTieBreak,
  PLAN_SHAPE_TIE_BREAK,
} from "./surfaces.ts";
import { getLoadShapeOrDefault, type LoadShape } from "./types.ts";

function shape(over: Partial<LoadShape>): LoadShape {
  return { ...getLoadShapeOrDefault(null), ...over };
}

Deno.test("all four surfaces stay silent for null and non-launch shapes", () => {
  assertEquals(insightsShapePayload(null), null);
  assertEquals(briefShapePromptBlock(null), "");
  assertEquals(nudgeShapePromptBlock(null), "");
  assertEquals(planShapeTieBreak(null, ["restore"]), 0);

  const light = shape({ shapeId: "light" });
  assertEquals(insightsShapePayload(light), null);
  assertEquals(briefShapePromptBlock(light), "");
  assertEquals(nudgeShapePromptBlock(light), "");
  assertEquals(planShapeTieBreak("light", ["restore"]), 0);
});

Deno.test("insights payload carries label, tooltip and locked sentence", () => {
  const p = insightsShapePayload(
    shape({ shapeId: "back_to_back", backToBackHours: 5.2 }),
  );
  assert(p);
  assertEquals(p!.label, "Back-to-back day");
  assert(p!.tooltip.length > 0);
  assert(p!.insightSentence!.includes("back-to-back"));
  assertEquals(p!.qualifier, "back-to-back");
});

Deno.test("brief block states the shape without inventing one", () => {
  const b = briefShapePromptBlock(
    shape({ shapeId: "switching", modeSwitchCount: 4, modeSequence: ["governance", "relational", "cognitive"] }),
  );
  assert(b.includes("LOAD SHAPE"));
  assert(b.includes("Mode-switching day"));
  assert(b.includes("Mode switches: 4"));
});

Deno.test("plan tie-break is bounded and tag-matched only", () => {
  assertEquals(
    planShapeTieBreak("back_to_back", ["Restore", "breath"]),
    PLAN_SHAPE_TIE_BREAK,
  );
  assertEquals(planShapeTieBreak("back_to_back", ["visibility"]), 0);
  assertEquals(planShapeTieBreak("switching", ["clarity"]), PLAN_SHAPE_TIE_BREAK);
});

Deno.test("meetingPrepCliff stacks only on switching days", () => {
  assertEquals(nudgeShapeStacksOnCliff("switching"), true);
  assertEquals(nudgeShapeStacksOnCliff("back_to_back"), false);

  const stacked = nudgeShapePromptBlock(
    shape({ shapeId: "switching", modeSwitchCount: 3 }),
    { cliffActive: true },
  );
  assert(stacked.includes("Stacking"));
  assert(stacked.includes("no app-open CTA"));

  const plain = nudgeShapePromptBlock(shape({ shapeId: "switching" }));
  assertEquals(plain.includes("Stacking"), false);
});
