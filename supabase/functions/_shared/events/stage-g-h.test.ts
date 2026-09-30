import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  formatScopeKey,
  parseScopedMemoryFromRow,
  lookupScopedMemoryFromContext,
  lookupScopedNegativeCategoriesFromContext,
  recordUserCorrection,
  recordScopedCorrection,
  recordConfirmation,
  revokeScopedCorrection,
  type LearningContext,
} from "./learning-store.ts";
import { resolveEvent } from "./resolve-event-category.ts";
import { selectDailyQuestionCandidate } from "./daily-question.ts";
import { classifyEvent, legacyClassifyEvent } from "./event-classifier.ts";

function mockSupabase(tables: Record<string, any[]> = {}) {
  const state: Record<string, any[]> = {
    event_category_confirmations: tables.event_category_confirmations ?? [],
    calendar_events: tables.calendar_events ?? [],
  };

  return {
    state,
    from(table: string) {
      const rows = state[table] ?? [];
      let filters: Array<(r: any) => boolean> = [];
      let updatePayload: any = null;

      const builder: any = {
        select(_fields: string) {
          return builder;
        },
        eq(col: string, val: any) {
          filters.push((r: any) => r[col] === val);
          return builder;
        },
        in(col: string, vals: any[]) {
          filters.push((r: any) => vals.includes(r[col]));
          return builder;
        },
        limit(_n: number) {
          return builder;
        },
        maybeSingle() {
          const filtered = rows.filter((r) => filters.every((f) => f(r)));
          return Promise.resolve({ data: filtered[0] ?? null, error: null });
        },
        insert(data: any) {
          const row = { id: `id_${Date.now()}_${Math.random()}`, ...data };
          rows.push(row);
          return Promise.resolve({ data: row, error: null });
        },
        update(payload: any) {
          updatePayload = payload;
          return {
            eq(col: string, val: any) {
              filters.push((r: any) => r[col] === val);
              const matching = rows.filter((r) => filters.every((f) => f(r)));
              for (const m of matching) {
                Object.assign(m, updatePayload);
              }
              return Promise.resolve({ data: matching, error: null });
            },
          };
        },
      };
      return builder;
    },
  };
}

Deno.test("Stage G: Scoped corrections persist at exact scope and stamp calendar_events", async () => {
  const db = mockSupabase();
  const userId = "usr_stage_g_1";
  const eventId = "ev_101";

  // User corrects category on a recurring meeting to Category D at THIS_SERIES scope
  const result = await recordUserCorrection(db, {
    userId,
    eventId,
    seriesId: "series_sync_42",
    title: "Leadership Sync",
    scope: "THIS_SERIES",
    category: "D",
    previousCategory: "I",
    source: "user",
  });

  assertEquals(result.success, true);
  assertEquals(result.scopeType, "series");
  assertEquals(result.scopeKey, "series_sync_42");

  // Check confirmations table has both the positive confirmation AND negative memory "not this"
  const confRows = db.state.event_category_confirmations;
  assertEquals(confRows.length, 2);

  const positive = confRows.find((r) => !r.title_norm.includes(":not:"));
  assertEquals(positive?.title_norm, "series:series_sync_42");
  assertEquals(positive?.event_category, "D");

  const negative = confRows.find((r) => r.title_norm.includes(":not:"));
  assertEquals(negative?.title_norm, "series:series_sync_42:not:i");
});

Deno.test("Stage G: Negative memory excludes category from inference", () => {
  const learningCtx: LearningContext = {
    titles: new Map(),
    tokens: new Map(),
    scopedMemories: new Map([
      [
        "event:ev_conf_1:not:b",
        {
          userId: "usr_1",
          scopeType: "event",
          scopeKey: "ev_conf_1",
          memoryType: "negative_category",
          value: "B",
          source: "user",
          confidence: 1.0,
          confirmedAt: new Date().toISOString(),
          version: "2026.09.A_J",
        },
      ],
    ]),
  };

  const negatives = lookupScopedNegativeCategoriesFromContext(learningCtx, {
    eventId: "ev_conf_1",
    title: "Partner Demo Discussion",
  });

  assertEquals(negatives.has("B"), true);
  assertEquals(negatives.has("A"), false);
});

Deno.test("Stage G: Engine results and plan slot pulls NEVER write confirmed memory (Safeguards)", async () => {
  const db = mockSupabase();
  const userId = "usr_guard_1";

  // Engine resolver attempt to record confirmation
  await recordConfirmation(db, {
    userId,
    title: "Routine Catchup",
    category: "I",
    source: "resolver",
  });

  // Plan pull attempt to record confirmation
  await recordConfirmation(db, {
    userId,
    title: "Strategic Session",
    category: "E",
    source: "plan_slot",
  });

  // Table must remain empty! The system never teaches itself without user action.
  assertEquals(db.state.event_category_confirmations.length, 0);

  // Machine inference for J must never be written
  await recordScopedCorrection(db, {
    userId,
    scopeType: "title_pattern",
    scopeKey: "crisis response",
    memoryType: "event_category",
    value: "J",
    source: "inferred" as any,
    confidence: 0.95,
    confirmedAt: new Date().toISOString(),
    version: "2026.09.A_J",
  });

  assertEquals(db.state.event_category_confirmations.length, 0);
});

Deno.test("Stage G: Revoke / Undo removes scoped correction", async () => {
  const db = mockSupabase();
  const userId = "usr_undo_1";

  await recordUserCorrection(db, {
    userId,
    eventId: "ev_rev_1",
    title: "Monthly Strategy",
    scope: "THIS_EVENT",
    category: "A",
  });

  assertEquals(db.state.event_category_confirmations.length, 1);

  const revoked = await revokeScopedCorrection(db, {
    userId,
    scopeType: "event",
    scopeKey: "ev_rev_1",
  });

  assertEquals(revoked, true);
  const row = db.state.event_category_confirmations[0];
  const payload = JSON.parse(row.resolved_by);
  assertNotEquals(payload.revokedAt, null);
});

Deno.test("Stage G: Daily Question candidate selector prioritizes crisis reflection and recurring series", () => {
  const now = new Date("2026-09-30T19:00:00Z");
  const events = [
    {
      id: "ev_routine_1",
      title: "Quick check-in",
      startTime: "2026-10-01T10:00:00Z",
      isRecurring: false,
    },
    {
      id: "ev_series_1",
      seriesId: "series_weekly_mgmt",
      title: "Weekly Management Sync",
      startTime: "2026-10-01T11:00:00Z",
      isRecurring: true,
    },
    {
      id: "ev_crisis_1",
      title: "Production Outage Post-Mortem",
      startTime: "2026-09-30T17:00:00Z",
      isRecurring: false,
    },
  ];

  const candidate = selectDailyQuestionCandidate(events, { now });
  assertEquals(candidate !== null, true);
  // Post-incident crisis reflection should be picked first
  assertEquals(candidate?.eventId, "ev_crisis_1");
  assertEquals(candidate?.status, "crisis_reflective");

  // When crisis event is excluded (or already asked), recurring series is preferred next
  const candidate2 = selectDailyQuestionCandidate(events, {
    now,
    previouslyAskedEventIds: new Set(["ev_crisis_1"]),
  });
  assertEquals(candidate2?.eventId, "ev_series_1");
  assertEquals(candidate2?.options.some((o) => o.scope === "THIS_SERIES"), true);
});

Deno.test("Stage H: classifyEvent delegates to Spine resolveEvent in v3 mode", () => {
  const orig = Deno.env.get("AH_ENGINE_MODE");
  try {
    Deno.env.set("AH_ENGINE_MODE", "v3");

    // Operations (I) and Crisis (J) resolve accurately through Spine
    const ops = classifyEvent("Weekly team sync");
    assertEquals(ops?.categoryId, "I");

    const crisis = classifyEvent("Production incident escalation");
    assertEquals(crisis?.categoryId, "J");

    const board = classifyEvent("Q3 Board of Directors Meeting");
    assertEquals(board?.categoryId, "A");
  } finally {
    if (orig !== undefined) Deno.env.set("AH_ENGINE_MODE", orig);
    else Deno.env.delete("AH_ENGINE_MODE");
  }
});
