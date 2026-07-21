import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ReceiptSource = "nse" | "foreground_sync" | "tap" | "unknown";

interface ReceiptPayload {
  notification_log_id?: unknown;
  received_at?: unknown;
  source?: unknown;
}

interface NormalizedReceipt {
  notificationLogId: string;
  receivedAtIso: string;
  source: ReceiptSource;
}

function normalizeSource(value: unknown): ReceiptSource {
  switch (String(value ?? "").trim()) {
    case "nse":
      return "nse";
    case "foreground_sync":
      return "foreground_sync";
    case "tap":
      return "tap";
    default:
      return "unknown";
  }
}

function normalizeReceipt(payload: ReceiptPayload): NormalizedReceipt | null {
  const notificationLogId = String(payload?.notification_log_id ?? "").trim();
  if (!notificationLogId) return null;

  const receivedAt = payload?.received_at ? new Date(String(payload.received_at)) : new Date();
  const receivedAtIso = Number.isNaN(receivedAt.valueOf())
    ? new Date().toISOString()
    : receivedAt.toISOString();

  return {
    notificationLogId,
    receivedAtIso,
    source: normalizeSource(payload?.source),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const rawReceipts: ReceiptPayload[] = Array.isArray(body?.receipts)
      ? body.receipts as ReceiptPayload[]
      : [body as ReceiptPayload];

    const receipts = rawReceipts
      .map((receipt: ReceiptPayload) => normalizeReceipt(receipt))
      .filter((receipt: NormalizedReceipt | null): receipt is NormalizedReceipt => receipt !== null);

    if (!receipts.length) {
      return new Response(JSON.stringify({ error: "notification_log_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const ids: string[] = [...new Set(receipts.map((receipt: NormalizedReceipt) => receipt.notificationLogId))];
    const receiptMap = new Map<string, NormalizedReceipt>(
      receipts.map((receipt: NormalizedReceipt) => [receipt.notificationLogId, receipt]),
    );

    const { data: rows, error: fetchError } = await supabase
      .from("notification_log")
      .select("id, delivery_state, delivered_at, payload")
      .in("id", ids);

    if (fetchError) throw fetchError;

    const foundIds = new Set((rows ?? []).map((row) => row.id as string));
    const missingIds = ids.filter((id) => !foundIds.has(id));

    const updates = (rows ?? []).map(async (row) => {
      const receipt = receiptMap.get(String(row.id));
      if (!receipt) return { id: row.id, ok: false, reason: "missing_receipt_payload" };

      const isTerminalState = row.delivery_state === "failed" || row.delivery_state === "expired_before_delivery";
      if (isTerminalState) {
        return { id: row.id, ok: true, delivery_state: row.delivery_state, source: receipt.source, skipped: true };
      }

      const deliveredAt = row.delivered_at && String(row.delivered_at) < receipt.receivedAtIso
        ? row.delivered_at
        : receipt.receivedAtIso;

      const { error: updateError } = await supabase
        .from("notification_log")
        .update({
          delivery_state: "delivered",
          delivered_at: deliveredAt,
          payload: {
            ...((row.payload as Record<string, unknown> | null) ?? {}),
            receipt_source: receipt.source,
            receipt_recorded_at: receipt.receivedAtIso,
          },
        })
        .eq("id", row.id);

      if (updateError) {
        return { id: row.id, ok: false, reason: updateError.message };
      }

      return { id: row.id, ok: true, delivery_state: "delivered", source: receipt.source };
    });

    const results = await Promise.all(updates);
    const ok = results.filter((result) => result.ok).length;

    return new Response(JSON.stringify({
      ok: missingIds.length === 0,
      processed: results.length,
      updated: ok,
      missing_ids: missingIds,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
