// OWNERSHIP: engineering. Fire-and-forget shadow runner that pairs the
// existing classifyEvent (v1) result with classifyEventV2 and writes one
// row to event_classifier_parity_log. Used while we burn in v2 alongside
// the live classifier — v1's output is still what each consumer uses;
// this writes diagnostic rows only.
//
// Safe to call from any consumer:
//   * Lazily builds a service client from env (no plumbing required).
//   * Best-effort: any error is swallowed.
//   * Gated by env CLASSIFIER_V2_SHADOW ("off" disables; default = on).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyEvent } from "./event-classifier.ts";
import { classifyEventV2, logParity, type ClassifyV2Input } from "./classify-event-v2.ts";

let _client: SupabaseClient | null = null;
function getServiceClient(): SupabaseClient | null {
  if (_client) return _client;
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return null;
    _client = createClient(url, key, { auth: { persistSession: false } });
    return _client;
  } catch {
    return null;
  }
}

function shadowEnabled(): boolean {
  try {
    return (Deno.env.get("CLASSIFIER_V2_SHADOW") ?? "on").toLowerCase() !== "off";
  } catch {
    return true;
  }
}

export interface ShadowClassifyInput extends ClassifyV2Input {
  userId: string;
  eventId?: string | null;
  /** Optional override for sourceTag — defaults to caller's consumer name. */
  sourceTag?: string;
}

/**
 * Run v2 in shadow alongside v1 and write a parity row. Fire-and-forget.
 * Returns the v2 result so callers can opportunistically inspect it in
 * logs without changing behaviour.
 */
export function shadowClassifyAndLog(input: ShadowClassifyInput): void {
  if (!shadowEnabled()) return;
  const sb = getServiceClient();
  if (!sb) return;

  // Compute synchronously so callers see no extra latency before write.
  const v1 = classifyEvent(input.title ?? null);
  const v2 = classifyEventV2(input);

  // Fire-and-forget write; swallow any rejection.
  void logParity(sb, {
    userId: input.userId,
    eventId: input.eventId ?? null,
    title: input.title,
    v1Category: v1?.categoryId ?? null,
    v2,
    // hardDemoteConflict is computed via SQL when reviewing the parity
    // log (joins against event_priority_memory); not worth the per-event
    // round-trip during shadow.
    hardDemoteConflict: false,
  }).catch(() => {});
}