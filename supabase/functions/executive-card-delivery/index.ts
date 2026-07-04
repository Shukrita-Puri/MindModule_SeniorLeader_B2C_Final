import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CardType = "brief" | "plan";

interface RequestBody {
  cardType?: CardType;
  snapshotId?: string;
  markViewed?: boolean;
  occurredAt?: string | null;
}

function normalizeOccurredAt(value: string | null | undefined): string {
  if (typeof value !== "string" || value.trim() === "") return new Date().toISOString();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId;

    const body = (await req.json()) as RequestBody;
    const cardType = body.cardType;
    const snapshotId = typeof body.snapshotId === "string" ? body.snapshotId : null;
    const occurredAt = normalizeOccurredAt(body.occurredAt);
    const markViewed = body.markViewed === true;

    if ((cardType !== "brief" && cardType !== "plan") || !snapshotId) {
      return new Response(JSON.stringify({ error: "cardType and snapshotId are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const table = cardType === "brief" ? "brief_snapshots" : "mastery_plan_snapshots";
    const { data: ownedRow, error: ownershipError } = await supabase
      .from(table)
      .select("id, user_id, delivered_at, viewed_at")
      .eq("id", snapshotId)
      .maybeSingle();

    if (ownershipError) {
      console.error("[executive-card-delivery] ownership query failed:", ownershipError.message);
      return new Response(JSON.stringify({ error: "ownership_check_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ownedRow || (ownedRow as { user_id?: string | null }).user_id !== userId) {
      return new Response(JSON.stringify({ error: "snapshot_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const current = ownedRow as {
      delivered_at?: string | null;
      viewed_at?: string | null;
    };
    const nextDeliveredAt = current.delivered_at ?? occurredAt;
    const nextViewedAt = markViewed ? (current.viewed_at ?? occurredAt) : current.viewed_at ?? null;

    const { error: updateError } = await supabase
      .from(table)
      .update({
        delivered_at: nextDeliveredAt,
        viewed_at: nextViewedAt,
      })
      .eq("id", snapshotId)
      .eq("user_id", userId);

    if (updateError) {
      console.error("[executive-card-delivery] update failed:", updateError.message);
      return new Response(JSON.stringify({ error: "update_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      delivered_at: nextDeliveredAt,
      viewed_at: nextViewedAt,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[executive-card-delivery] fatal:", (err as Error)?.message);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
