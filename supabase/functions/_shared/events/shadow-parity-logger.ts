// Spec §14: Shadow and Replay Parity Logging
// Zero DB migration required. Logs both:
// 1. A row to public.event_classifier_parity_log
// 2. A structured JSON log line for replay/shadow diagnostic audits

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ClassificationStamp } from "./spine-contracts.ts";
import type { EventCategoryId } from "./event-categories.ts";

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

function normaliseTitle(t: string | null | undefined): string {
  return (t ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 256);
}

function computeSimpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

export interface ShadowLogPayload {
  userId?: string | null;
  eventId?: string | null;
  title: string;
  legacyCategory: EventCategoryId | null;
  legacySubtype?: string | null;
  v3Stamp: ClassificationStamp;
  mode?: "shadow" | "replay" | "canary";
}

export interface StructuredParityRecord {
  event_id: string | null;
  event_input_hash: string;
  legacy_category: string | null;
  legacy_subtype: string | null;
  v3_category: string;
  v3_subtype: string | null;
  v3_confidence: string;
  v3_status: string;
  v3_runner_up: { categoryId: string; subtypeId: string | null; confidence: number } | null;
  v3_reasons: string[];
  v3_findings: Array<{ family: string; type: string; value: string; strength: string }>;
  taxonomy_version: string;
  classifier_version: string;
  llm_used: boolean;
  relationship_enriched: boolean;
  mode: "shadow" | "replay" | "canary";
  created_at: string;
}

export async function logShadowParity(payload: ShadowLogPayload): Promise<StructuredParityRecord> {
  const normTitle = normaliseTitle(payload.title);
  const stamp = payload.v3Stamp;
  const legacyCat = payload.legacyCategory;
  const v3Cat = stamp.category;
  const v3Subtype = stamp.subtype;
  const v3Confidence: "high" | "medium" | "low" =
    stamp.categoryConfidence >= 0.75 ? "high" : stamp.categoryConfidence >= 0.55 ? "medium" : "low";

  let diffTag: "category_differs" | "subtype_differs" | "matches" = "matches";
  if (legacyCat && legacyCat !== v3Cat) {
    diffTag = "category_differs";
  } else if (payload.legacySubtype && v3Subtype && payload.legacySubtype !== v3Subtype) {
    diffTag = "subtype_differs";
  }

  const resolvedByTag = `v3:evidence:${stamp.confirmationState}:${diffTag}`;
  const nowIso = new Date().toISOString();
  const inputHash = stamp.inputHash || computeSimpleHash(`${payload.title}|${legacyCat}|${v3Cat}|${v3Subtype}`);

  const structuredRecord: StructuredParityRecord = {
    event_id: payload.eventId ?? stamp.itemId ?? null,
    event_input_hash: inputHash,
    legacy_category: legacyCat,
    legacy_subtype: payload.legacySubtype ?? null,
    v3_category: v3Cat ?? "H",
    v3_subtype: v3Subtype,
    v3_confidence: v3Confidence,
    v3_status: stamp.confirmationState,
    v3_runner_up: stamp.runnerUp ? {
      categoryId: stamp.runnerUp.category ?? "",
      subtypeId: stamp.runnerUp.subtype,
      confidence: stamp.runnerUp.confidence,
    } : null,
    v3_reasons: stamp.reasons,
    v3_findings: (stamp.findings ?? []).map((f) => ({
      family: f.family,
      type: f.type,
      value: f.value,
      strength: f.strength,
    })),
    taxonomy_version: stamp.taxonomyVersion ?? "2026.09.A_J",
    classifier_version: stamp.classifierVersion ?? "v3",
    llm_used: false,
    relationship_enriched: true,
    mode: payload.mode ?? "shadow",
    created_at: nowIso,
  };

  // 1. Output structured JSON log line for replay / streaming log collectors
  console.log(`[SHADOW_PARITY_LOG] ${JSON.stringify(structuredRecord)}`);

  // 2. Best-effort insert into existing public.event_classifier_parity_log
  const sb = getServiceClient();
  if (sb) {
    try {
      const rowUserId = payload.userId || "00000000-0000-0000-0000-000000000000";
      await sb.from("event_classifier_parity_log").insert({
        user_id: rowUserId,
        event_id: payload.eventId ?? null,
        title_normalised: normTitle,
        v1_category: legacyCat,
        v2_category: v3Cat,
        v2_subtype_id: v3Subtype,
        v2_confidence: v3Confidence,
        v2_resolved_by: resolvedByTag,
        hard_demote_conflict: false,
      });
    } catch (_err) {
      // Swallowed per spec — diagnostic write must never block classification
    }
  }

  return structuredRecord;
}
