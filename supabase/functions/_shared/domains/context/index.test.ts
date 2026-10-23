// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Scenario tests for Context Assembler.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assembleContextFromRaw, assembleContext } from "./index.ts";

Deno.test("Context Assembler - assembleContextFromRaw constructs complete ContextBundle", () => {
  const now = new Date("2026-10-24T08:30:00Z");
  const bundle = assembleContextFromRaw(
    {
      userId: "u-123",
      localDate: "2026-10-24",
      windowName: "morning",
      calendarEvents: [
        {
          id: "evt-board",
          title: "Quarterly Board Meeting",
          startTime: "2026-10-24T14:00:00Z",
          endTime: "2026-10-24T16:00:00Z",
          category: "A",
        },
      ],
      wearableReadings: {
        created_at: "2026-10-24T07:00:00Z",
        hrv_rmssd: 55,
        resting_hr: 58,
        sleep_minutes: 460,
      },
      checkIns: [
        {
          created_at: "2026-10-24T07:30:00Z",
          emotion_level: 4,
          regulation_level: 4,
          clarity_level: 4,
          energy_level: 4,
          pressure_level: 4,
        },
      ],
      hasWearable: true,
      hasCalendar: true,
    },
    { nowUtc: now, localHour: 8 }
  );

  assertEquals(bundle.userId, "u-123");
  assertEquals(bundle.localDate, "2026-10-24");
  assertEquals(bundle.windowName, "morning");
  assertEquals(bundle.dayProfile.localDate, "2026-10-24");
  assertEquals(bundle.stateProfile.tier, "optimal");
  assertEquals(bundle.windowProfile.window, "morning");
  assertEquals(bundle.windowProfile.mode, "set_up");
  assertEquals(bundle.importance.mode, "adjusted");
  assertEquals(bundle.importance.anchors.length > 0, true);
});

Deno.test("Context Assembler - assembleContext performs single batched read and assembles bundle", async () => {
  const now = new Date("2026-10-24T14:00:00Z");

  const mockSupabase: any = {
    from: (table: string) => ({
      select: (_cols?: string) => ({
        eq: (_col: string, _val: unknown) => ({
          eq: (_col2: string, _val2: unknown) => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
          order: () => ({
            limit: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    created_at: "2026-10-24T07:00:00Z",
                    hrv_rmssd: 52,
                    resting_hr: 59,
                    sleep_minutes: 440,
                  },
                  error: null,
                }),
            }),
          }),
          maybeSingle: () => Promise.resolve({ data: { id: "u-123" }, error: null }),
        }),
      }),
    }),
  };

  const bundle = await assembleContext(mockSupabase, {
    userId: "u-123",
    localDate: "2026-10-24",
    windowName: "afternoon",
    options: { nowUtc: now, localHour: 14 },
  });

  assertEquals(bundle.userId, "u-123");
  assertEquals(bundle.windowName, "afternoon");
  assertEquals(bundle.windowProfile.window, "afternoon");
  assertEquals(bundle.windowProfile.mode, "execute_and_hold");
});
