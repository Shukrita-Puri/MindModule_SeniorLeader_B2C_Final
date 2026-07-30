/**
 * seed-onboarding-memory: Seeds event_priority_memory from onboarding goals.
 * Called once at completion. Idempotent via upsert.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-mm-client-platform",
};

const GOAL_TO_CATEGORY: Record<string, { category: string; typeKey: string; delta: number }[]> = {
  regulated:          [{ category: 'E', typeKey: 'focus_block', delta: 15 }],
  prepare:            [{ category: 'A', typeKey: 'board_meeting', delta: 20 }, { category: 'B', typeKey: 'investor_pitch', delta: 20 }],
  recover:            [{ category: 'E', typeKey: 'focus_block', delta: 15 }],
  sustain:            [{ category: 'E', typeKey: 'focus_block', delta: 15 }],
  decision:           [{ category: 'A', typeKey: 'board_meeting', delta: 20 }, { category: 'D', typeKey: 'difficult_conversation', delta: 15 }],
  people:             [{ category: 'D', typeKey: 'difficult_conversation', delta: 20 }],
  models:             [{ category: 'C', typeKey: 'client_meeting', delta: 15 }],
  patterns:           [{ category: 'E', typeKey: 'focus_block', delta: 15 }],
  board_performance:  [{ category: 'A', typeKey: 'board_meeting', delta: 20 }],
  governance:         [{ category: 'A', typeKey: 'board_meeting', delta: 20 }],
  investor_relations: [{ category: 'B', typeKey: 'investor_pitch', delta: 20 }],
  visibility:         [{ category: 'C', typeKey: 'speaking_event', delta: 15 }],
  people_management:  [{ category: 'D', typeKey: 'difficult_conversation', delta: 15 }],
  deep_work:          [{ category: 'E', typeKey: 'focus_block', delta: 15 }],
  protect_focus:      [{ category: 'E', typeKey: 'focus_block', delta: 15 }],
  travel_performance: [{ category: 'G', typeKey: 'flight', delta: 10 }],
};

const CHIP_TO_CATEGORY: Record<string, { category: string; typeKey: string; delta: number }[]> = {
  board:    [{ category: 'A', typeKey: 'board_meeting', delta: 8 }],
  investor: [{ category: 'B', typeKey: 'investor_pitch', delta: 8 }],
  client:   [{ category: 'C', typeKey: 'client_meeting', delta: 8 }],
  people:   [{ category: 'D', typeKey: 'difficult_conversation', delta: 8 }],
  conflict: [{ category: 'D', typeKey: 'difficult_conversation', delta: 8 }],
  travel:   [{ category: 'G', typeKey: 'flight', delta: 8 }],
  volume:   [{ category: 'E', typeKey: 'focus_block', delta: 8 }],
  load:     [{ category: 'E', typeKey: 'focus_block', delta: 8 }],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const body = await req.json().catch(() => ({}));
    let userId: string;

    if (authHeader.startsWith("Bearer ") && authHeader.slice(7) === serviceKey && typeof body?.userId === "string") {
      userId = body.userId;
    } else {
      userId = await authenticateRequest(req);
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch onboarding goals and stakes_chips
    const { data: row, error: fetchErr } = await db
      .from("onboarding_v8_responses")
      .select("goals, stakes_chips")
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchErr) {
      console.error("[seed-onboarding-memory] fetch error:", fetchErr);
      return new Response(
        JSON.stringify({ error: "fetch_failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!row) {
      return new Response(
        JSON.stringify({ ok: true, seeded: 0, reason: "no_onboarding_row" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const goals: string[] = Array.isArray(row.goals) ? row.goals : [];
    const stakesChips: string[] = Array.isArray(row.stakes_chips) ? row.stakes_chips : [];
    let seeded = 0;

    // Seed from declared goals (higher delta)
    for (const goal of goals) {
      const key = String(goal).toLowerCase().trim().replace(/[\s-]+/g, '_');
      const signals = GOAL_TO_CATEGORY[key] ?? [];
      for (const sig of signals) {
        const { error: upsertErr } = await db
          .from('event_priority_memory')
          .upsert({
            user_id: userId,
            event_category: sig.category,
            event_type_key: sig.typeKey,
            signal: 'priority',
            delta: sig.delta,
            source: 'onboarding_goal',
            occurred_at: new Date().toISOString(),
          }, { onConflict: 'user_id,event_category,event_type_key,signal,source', ignoreDuplicates: true });
        if (!upsertErr) seeded++;
      }
    }

    // Seed from stakes_chips (lower delta)
    for (const chip of stakesChips) {
      const key = String(chip).toLowerCase().trim().replace(/[\s-]+/g, '_');
      for (const [keyword, signals] of Object.entries(CHIP_TO_CATEGORY)) {
        if (key.includes(keyword)) {
          for (const sig of signals) {
            const { error: upsertErr } = await db
              .from('event_priority_memory')
              .upsert({
                user_id: userId,
                event_category: sig.category,
                event_type_key: sig.typeKey,
                signal: 'priority',
                delta: sig.delta,
                source: 'onboarding_chip',
                occurred_at: new Date().toISOString(),
              }, { onConflict: 'user_id,event_category,event_type_key,signal,source', ignoreDuplicates: true });
            if (!upsertErr) seeded++;
          }
        }
      }
    }

    console.log(`[seed-onboarding-memory] ✅ seeded ${seeded} signals for:`, redactUserId(userId));
    return new Response(
      JSON.stringify({ ok: true, seeded }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[seed-onboarding-memory] Fatal error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
