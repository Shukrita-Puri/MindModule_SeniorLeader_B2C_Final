import { evaluate } from "./behaviour-evaluator.ts";
const sigs: any = {
  hrvDeviationPct: null, hrvUnusual: false,
  sleepHours: null, sleepDeviationPct: null, sleepBelow6h: false,
  rhrDeviationPct: null, hrElevatedProxy: false,
  emotionalSelfDeclared: null, mentalSharpness: null, confidence: null,
  timezoneOffsetMinutes: null, timezoneShift48hHours: null, travelDay: false,
  yesterdayScore: null, todayScore: null,
  postPeakWindow: false, isHighVisibilityToday: false,
  emotionalDrainEventInNext4h: null, highStakesEventInNext24h: null,
  morningWasCompressed: false, middayRecoveryDetected: false,
  clarityDropFromTrailingAvg: null,
};
const flags = evaluate({ signals: sigs, upcomingEvents: [], localHour: 9 } as any);
console.log(JSON.stringify(flags));
