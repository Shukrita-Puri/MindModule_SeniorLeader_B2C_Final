import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyLoadShape, countModeSwitches } from "./classify.ts";
import {
  type ClassifyLoadShapeEvent,
  getLoadShapeOrDefault,
  SHAPE_DISPLAY_CONFIG,
} from "./types.ts";
import { CATEGORY_TO_MODE, MODE_LABELS_SHARED_WITH_ENGINE } from "./modes.ts";

const DAY = "2026-08-24";

function ev(
  subcategory: ClassifyLoadShapeEvent["subcategory"],
  startHour: number,
  durationMin: number,
  stakesLevel: ClassifyLoadShapeEvent["stakesLevel"] = "medium",
  extra: Partial<ClassifyLoadShapeEvent> = {},
): ClassifyLoadShapeEvent {
  const start = new Date(`${DAY}T${String(startHour).padStart(2, "0")}:00:00Z`);
  const end = new Date(start.getTime() + durationMin * 60000);
  return {
    subcategory,
    category: subcategory.split(".")[0] as ClassifyLoadShapeEvent["category"],
    startTime: start,
    endTime: end,
    stakesLevel,
    ...extra,
  };
}

function shapeOf(events: ClassifyLoadShapeEvent[]) {
  return classifyLoadShape({ events, ctx: { localDate: DAY, timezoneOffset: 0 } });
}

Deno.test("classifyLoadShape — empty calendar returns the light default", () => {
  const s = shapeOf([]);
  assertEquals(s.shapeId, "light");
  assertEquals(s.meetingCount, 0);
  assert(s.evidence.length >= 1);
});

Deno.test("classifyLoadShape — malformed events do not throw and are skipped", () => {
  const junk = [
    // deliberately broken rows
    { subcategory: "E.deep_work", category: "E", startTime: new Date("nope"), endTime: new Date("nope"), stakesLevel: "low" },
    { startTime: new Date(), endTime: new Date() },
    null,
    undefined,
  ] as unknown as ClassifyLoadShapeEvent[];
  const s = classifyLoadShape({ events: junk, ctx: { localDate: DAY, timezoneOffset: 0 } });
  assertEquals(s.shapeId, "light");
});

Deno.test("classifyLoadShape — back_to_back fires at >=4h with >60% short gaps", () => {
  // Six 45-min syncs at 5-min gaps → 5h chain, all gaps short.
  const events: ClassifyLoadShapeEvent[] = [];
  let start = new Date(`${DAY}T09:00:00Z`).getTime();
  for (let i = 0; i < 6; i++) {
    const s = new Date(start);
    const e = new Date(start + 45 * 60000);
    events.push({
      subcategory: "E.routine_sync",
      category: "E",
      startTime: s,
      endTime: e,
      stakesLevel: "low",
    });
    start = e.getTime() + 5 * 60000;
  }
  const s = shapeOf(events);
  assertEquals(s.shapeId, "back_to_back");
  assert(s.backToBackHours >= 4, `expected >=4h, got ${s.backToBackHours}`);
  assert(s.shortGapRatio > 0.6);
});

Deno.test("classifyLoadShape — spaced-out chain does not fire back_to_back", () => {
  const events = [
    ev("E.routine_sync", 9, 60, "low"),
    ev("E.routine_sync", 12, 60, "low"),
    ev("E.routine_sync", 15, 60, "low"),
  ];
  const s = shapeOf(events);
  assert(s.shapeId !== "back_to_back");
  assertEquals(s.shortGapRatio, 0);
});

Deno.test("classifyLoadShape — switching fires on 3 mode switches", () => {
  const s = shapeOf([
    ev("A", 9, 60, "high"),
    ev("E.deep_work", 12, 60, "low"),
    ev("C.speaking", 15, 60, "high"),
    ev("E.review", 17, 60, "low"),
  ]);
  assertEquals(s.shapeId, "switching");
  assert(s.modeSwitchCount >= 3);
});

Deno.test("classifyLoadShape — switching fires on 2 switches when relational is present", () => {
  const s = shapeOf([
    ev("E.deep_work", 9, 60, "low"),
    ev("D.difficult_conversation", 12, 60, "high"),
    ev("E.review", 15, 60, "low"),
  ]);
  assertEquals(s.shapeId, "switching");
  assertEquals(s.modeSwitchCount, 2);
  assert(s.modeSequence.includes("relational"));
});

Deno.test("classifyLoadShape — 2 switches without relational does not fire switching", () => {
  const s = shapeOf([
    ev("E.deep_work", 9, 60, "low"),
    ev("A", 12, 60, "medium"),
    ev("E.review", 15, 60, "low"),
  ]);
  assert(s.shapeId !== "switching");
});

Deno.test("classifyLoadShape — travel_adjacent takes precedence over back_to_back", () => {
  const events: ClassifyLoadShapeEvent[] = [
    ev("G.flight", 6, 480, "low", { flightDurationMinutes: 480 }),
    ev("A", 16, 60, "critical"),
  ];
  const s = shapeOf(events);
  assertEquals(s.shapeId, "travel_adjacent");
  assertEquals(s.travelSubcategory, "G.flight");
  assertEquals(s.flightArcType, "long_haul");
});

Deno.test("classifyLoadShape — weight_heavy and volume_heavy classify but stay non-launch", () => {
  const weight = shapeOf([ev("A", 9, 60, "critical"), ev("A.strategy", 14, 60, "critical")]);
  assertEquals(weight.shapeId, "weight_heavy");
  assertEquals(SHAPE_DISPLAY_CONFIG[weight.shapeId].launchReady, false);

  const volume: ClassifyLoadShapeEvent[] = [];
  for (let i = 0; i < 8; i++) volume.push(ev("E.routine_sync", 8 + i, 30, "low"));
  const vol = shapeOf(volume);
  assertEquals(vol.shapeId, "volume_heavy");
  assertEquals(SHAPE_DISPLAY_CONFIG[vol.shapeId].launchReady, false);
});

Deno.test("classifyLoadShape — focused day when cognitive dominates with no switching", () => {
  const s = shapeOf([ev("E.deep_work", 9, 180, "low"), ev("E.deep_work", 14, 120, "low")]);
  assertEquals(s.shapeId, "focused");
});

Deno.test("getLoadShapeOrDefault(null) returns the light default without throwing", () => {
  const s = getLoadShapeOrDefault(null);
  assertEquals(s.shapeId, "light");
  assertEquals(s.shapeLabel, "Light day");
  assertEquals(s.travelAdjacency, false);
  assertEquals(getLoadShapeOrDefault(undefined).shapeId, "light");
  assertEquals(getLoadShapeOrDefault({ nope: 1 }).shapeId, "light");
});

Deno.test("countModeSwitches counts adjacent transitions only", () => {
  assertEquals(countModeSwitches([]), 0);
  assertEquals(countModeSwitches(["cognitive", "cognitive"]), 0);
  assertEquals(countModeSwitches(["cognitive", "relational", "cognitive"]), 2);
});

Deno.test("only back_to_back and switching are launch-ready", () => {
  const launch = Object.values(SHAPE_DISPLAY_CONFIG)
    .filter((c) => c.launchReady)
    .map((c) => c.shapeId)
    .sort();
  assertEquals(launch, ["back_to_back", "switching"]);
});

Deno.test("CATEGORY_TO_MODE agrees with cause-effect-engine's private map on shared labels", async () => {
  const src = await Deno.readTextFile(
    new URL("../../cause-effect-engine/index.ts", import.meta.url),
  );
  const engineExpectations: Record<string, string> = {
    A: "governance",
    B: "performance",
    D: "relational",
    E: "cognitive",
    G: "logistical",
  };
  // Assert the engine still declares those labels (guards against a rename).
  for (const [cat, mode] of Object.entries(engineExpectations)) {
    assert(
      src.includes(`"${mode}"`),
      `cause-effect-engine no longer declares mode "${mode}" (category ${cat})`,
    );
    assertEquals(CATEGORY_TO_MODE[cat as "A"], mode);
  }
  assertEquals(MODE_LABELS_SHARED_WITH_ENGINE.sort(), ["A", "B", "D", "E", "G"]);
});

Deno.test("uncategorised events are reported instead of claiming an empty calendar", () => {
  const shape = classifyLoadShape({
    events: [],
    unresolvedCount: 2,
    ctx: { localDate: "2026-08-24", timezoneOffset: 60 },
  });
  assertEquals(shape.shapeId, "light");
  assertEquals(shape.meetingCount, 0);
  assert(shape.evidence[0].includes("could not be categorised"));
  assert(!shape.evidence[0].includes("No calendar data"));
});
