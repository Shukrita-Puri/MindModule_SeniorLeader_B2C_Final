import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateCalendarTruth } from "./brief-validators.ts";
const truth = {
  allowedClockTimes: ["09:30", "16:00"],
  allowedTitles: ["Shukrita x Melanie catch up", "Lauren/ Shukrita- Mind Module introductions"],
  allowedDescriptors: ["routine_sync", "Daily Rhythm & Baseline"],
};
Deno.test("rejects invented meeting kind", () => {
  const r = validateCalendarTruth("The calendar is light and your strategy session at 09:30 is the point of impact.", truth);
  assert(!r.ok, r.reason);
});
Deno.test("rejects invented clock time", () => {
  const r = validateCalendarTruth("Set the objective before the catch up at 10:30 begins.", truth);
  assert(!r.ok, r.reason);
});
Deno.test("accepts real title, real time, real kind", () => {
  const r = validateCalendarTruth("Set the objective before the catch up at 09:30 begins; protect the clear window.", truth);
  assert(r.ok, r.reason);
});
Deno.test("no truth supplied leaves behaviour unchanged", () => {
  assert(validateCalendarTruth("your strategy session at 10:30", null).ok);
});
