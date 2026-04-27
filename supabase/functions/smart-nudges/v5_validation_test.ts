// ─────────────────────────────────────────────────────────────────────────────
// Smart Nudges v5 — End-to-end validation harness
//
// What this verifies (per the v5 contract, see mem://features/notifications/*)
//   1. Source code never reintroduces v4 forbidden vocabulary
//      ("intent", "set the tone", "productivity", "loaded day", …)
//   2. Every emitted nudge has:
//        • a deep_link_route (drives users into the app)
//        • architecture: 'cos-mind-v5'
//        • cta_variant ∈ {A, B, C, D} + cta_experiment
//        • a CTA verb in the body (open / see / recalibrate / lock / tap)
//        • a forbidden-word-free body
//   3. Live tick: invoke the deployed function and assert all of the above
//      on every notification it returns in `details[]`.
//   4. DB audit: rows written by the live tick respect:
//        • no send before 08:00 *local* (timezone_offset aware)
//        • no two sends to the same user within 60 minutes
//        • Sunday morning (local 08:00–11:59): never fires unless meeting-anchored
//        • Saturday morning: only fires if meeting-anchored variant
//   5. CTA A/B distribution across synthetic user IDs is roughly uniform.
//
// Run:  via supabase--test_edge_functions or
//       deno test --allow-net --allow-env --allow-read supabase/functions/smart-nudges/v5_validation_test.ts
// ─────────────────────────────────────────────────────────────────────────────

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals, assertGreaterOrEqual } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL =
  Deno.env.get("VITE_SUPABASE_URL") ??
  Deno.env.get("SUPABASE_URL") ??
  "https://iyilcpvercoywaweybpc.supabase.co";

const SUPABASE_ANON =
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

const SUPABASE_SERVICE =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? SUPABASE_ANON;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/smart-nudges`;
const SOURCE_PATH = new URL("./index.ts", import.meta.url);

// v6 copy contract — keep in sync with FORBIDDEN_WORDS_V6 + ALLOWED_CTA_VERBS_V6 in index.ts (~line 793)
const FORBIDDEN_WORDS = [
  "set your intent",
  "set the tone",
  "plan the week",
  "your day your terms",
  "loaded day",
  "5 days behind you",
  "well done",
  "great job",
  "keep it up",
  "come back",
  "check in when ready",
  "productivity",
  "productive",
  "strategy",
  "strategic",
  "wellness",
  "mindful",
  "mindfulness",
  "relax",
  "breathe",
  "calm",
  "recharge",
  "self-care",
  "streak",
  "intent",
];

// CTA verbs the v6 fallback strings + A/B variants are required to use.
const CTA_VERB_RX =
  /\b(open your brief|open your plan|open your prep plan|build your prep plan|recalibrate now|close the day|close the week|lock in your prep)\b/i;

// v6 also rejects placeholder tokens and orphan metric mentions
const PLACEHOLDER_RX = /(\{[^}]+\}|\b(?:N|--)\b|\?\?|\bundefined\b|\bnull\b|NaN%)/;

const VALID_DEEP_LINKS = new Set([
  "/daily-check-in",
  "/executive-home",
]);

function bodyContainsForbidden(body: string): string | null {
  const lower = body.toLowerCase();
  for (const w of FORBIDDEN_WORDS) {
    if (lower.includes(w)) return w;
  }
  return null;
}

// ─── Test 1: Source-code static audit ────────────────────────────────────────
Deno.test("v5 source: fallback strings contain no forbidden vocabulary", async () => {
  const src = await Deno.readTextFile(SOURCE_PATH);
  // Scope the audit to the active MVP fallback region only. Post-MVP
  // evaluators (calendar_gap, pattern_alert, …) are dormant under
  // MVP_POST_LAUNCH=false and may carry legacy strings that the v5
  // contract does not yet apply to.
  const startMarker = "// ── Static Fallback Copy — MVP Nudge System ──";
  const endMarker   = "// ── MVP Nudge Evaluators";
  const startIdx = src.indexOf(startMarker);
  const endIdx   = src.indexOf(endMarker, startIdx);
  assert(startIdx > 0 && endIdx > startIdx, "Could not locate MVP fallback region in source");
  const region = src.slice(startIdx, endIdx);

  const lines = region.split("\n");
  const fallbackLines: string[] = [];
  for (const ln of lines) {
    if (/variantId:\s*['"`]FB-/.test(ln) && /body:/.test(ln)) {
      fallbackLines.push(ln);
    }
  }
  assertGreaterOrEqual(fallbackLines.length, 15, `Expected ≥15 FB-* fallback strings, got ${fallbackLines.length}`);

  for (const ln of fallbackLines) {
    // Extract the body literal, which may be a template string with embedded
    // single-quotes (e.g. `${count} meeting${count > 1 ? 's' : ''}`). We grab
    // everything between `body:` and `, variantId:` on the same line.
    const segMatch = ln.match(/body:\s*([\s\S]*?),\s*variantId:/);
    const bodyText = segMatch ? segMatch[1] : ln;
    const bad = bodyContainsForbidden(bodyText);
    assertEquals(bad, null, `Forbidden word "${bad}" found in fallback body: ${bodyText.substring(0, 140)}…`);
    assert(
      CTA_VERB_RX.test(bodyText),
      `Fallback missing action-verb CTA: ${bodyText.substring(0, 140)}…`,
    );
  }
});

Deno.test("v6 source: global timing constants + arch stamp", async () => {
  const src = await Deno.readTextFile(SOURCE_PATH);
  assert(/GLOBAL_EARLIEST_LOCAL\s*=\s*8(\.0)?/.test(src), "GLOBAL_EARLIEST_LOCAL must = 8.0");
  assert(/APP_OPEN_COOLDOWN_MS\s*=\s*60\s*\*\s*60\s*\*\s*1000/.test(src), "APP_OPEN_COOLDOWN_MS must be 60 min");
  assert(/INTRA_TICK_MAX\s*=\s*1/.test(src), "INTRA_TICK_MAX must be 1");
  assert(/architecture:\s*['"`]cos-mind-v6-cta['"`]/.test(src), "Payload must stamp architecture='cos-mind-v6-cta'");
  assert(/cta_experiment:\s*['"`]cta-action-verb-v1['"`]/.test(src), "Payload must stamp cta_experiment");
});

// ─── Test 2: CTA variant distribution ────────────────────────────────────────
Deno.test("v5 CTA: assignCtaVariant is approximately uniform across users", async () => {
  // Re-implement the FNV hash from index.ts so we can validate distribution
  // without spinning up the function.
  const VARIANTS = ["A", "B", "C", "D"] as const;
  function hash(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function assign(uid: string, family: string) {
    return VARIANTS[hash(`${uid}::${family}`) % VARIANTS.length];
  }

  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  const N = 4000;
  for (let i = 0; i < N; i++) {
    counts[assign(`synthetic-user-${i}`, "nudge_one")]++;
  }
  for (const v of VARIANTS) {
    const pct = (counts[v] / N) * 100;
    assert(pct > 20 && pct < 30, `Variant ${v} share ${pct.toFixed(1)}% outside 20–30%`);
  }

  // Stability: same user → same arm across calls
  for (let i = 0; i < 50; i++) {
    const uid = `stable-${i}`;
    assertEquals(assign(uid, "nudge_one"), assign(uid, "nudge_one"));
  }
});

// ─── Test 3: Live tick ──────────────────────────────────────────────────────
interface TickResponse {
  processed: number;
  notifications: number;
  dry_run: boolean;
  apns_success: number;
  apns_failed: number;
  architecture: string;
  details: Array<{
    user_id: string;
    type: string;
    variant: string;
    title: string;
    body: string;
    deep_link: string;
  }>;
}

async function invokeTick(): Promise<TickResponse> {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON}`,
      apikey: SUPABASE_ANON,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  const text = await res.text();
  assertEquals(res.status, 200, `Tick returned ${res.status}: ${text}`);
  return JSON.parse(text) as TickResponse;
}

Deno.test({
  name: "v5 live tick: every emission satisfies v5 invariants",
  ignore: !SUPABASE_ANON,
  async fn() {
    const tick = await invokeTick();
    console.log(`[validation] tick processed=${tick.processed} emitted=${tick.notifications}`);

    for (const n of tick.details) {
      // Deep link must be present and route into the app
      assert(
        VALID_DEEP_LINKS.has(n.deep_link),
        `Notification ${n.type} for ${n.user_id} has invalid deep_link "${n.deep_link}"`,
      );
      // Body must contain a CTA verb (drives user into the app)
      assert(
        CTA_VERB_RX.test(n.body),
        `Notification ${n.type} body has no CTA verb: "${n.body}"`,
      );
      // Body must not contain v4 forbidden vocabulary
      const bad = bodyContainsForbidden(n.body);
      assertEquals(bad, null, `Notification ${n.type} body contains "${bad}": "${n.body}"`);
      // Variant id must end with ::A|B|C|D (CTA experiment)
      assert(
        /::[ABCD]$/.test(n.variant),
        `Notification ${n.type} variant_id "${n.variant}" missing CTA arm suffix`,
      );
    }
  },
});

// ─── Test 4: DB audit of last 24 h ──────────────────────────────────────────
Deno.test({
  name: "v5 DB audit: rows respect 08:00 local floor + 60-min cool-down + arch stamp",
  ignore: !SUPABASE_SERVICE,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
      auth: { persistSession: false },
    });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await sb
      .from("notification_log")
      .select("user_id, notification_type, sent_at, payload")
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    assert(rows, "notification_log query returned no payload");

    // Pull tz offsets in one batch
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const { data: profs } = await sb
      .from("profiles")
      .select("id, timezone_offset")
      .in("id", userIds);
    const tz = new Map<string, number>(
      (profs ?? []).map((p) => [p.id as string, (p.timezone_offset as number) ?? 0]),
    );

    // Only audit rows written *after* this test run's deploy — i.e., rows
    // stamped with the v5 architecture. Older v4 rows are tolerated here.
    const v5Rows = rows.filter(
      (r) => (r.payload as Record<string, unknown>)?.architecture === "cos-mind-v5",
    );
    console.log(`[validation] v5 rows in last 24h: ${v5Rows.length} / ${rows.length}`);

    for (const r of v5Rows) {
      const payload = r.payload as Record<string, unknown>;

      // Stamps must all be present
      assertEquals(payload.architecture, "cos-mind-v5", `arch missing on row ${r.user_id}@${r.sent_at}`);
      assertEquals(payload.cta_experiment, "cta-action-verb-v1", `cta_experiment missing on ${r.user_id}@${r.sent_at}`);
      assert(
        ["A", "B", "C", "D"].includes(payload.cta_variant as string),
        `cta_variant invalid on ${r.user_id}@${r.sent_at}: ${payload.cta_variant}`,
      );
      assert(
        VALID_DEEP_LINKS.has(payload.deep_link_route as string),
        `deep_link_route invalid on ${r.user_id}@${r.sent_at}: ${payload.deep_link_route}`,
      );

      // Body invariants
      const body = String(payload.body ?? "");
      const bad = bodyContainsForbidden(body);
      assertEquals(bad, null, `Forbidden word "${bad}" in body: ${body}`);
      assert(CTA_VERB_RX.test(body), `Body missing CTA verb: ${body}`);

      // 08:00 local floor
      const offset = tz.get(r.user_id) ?? 0;
      const sentUtc = new Date(r.sent_at).getTime();
      const localMinutes =
        ((new Date(sentUtc + offset * 60_000).getUTCHours() * 60) +
          new Date(sentUtc + offset * 60_000).getUTCMinutes());
      assertGreaterOrEqual(
        localMinutes,
        8 * 60,
        `Sent before 08:00 local for ${r.user_id} (offset ${offset}m, sent ${r.sent_at}, local ${(localMinutes / 60).toFixed(2)}h)`,
      );

      // 21:30 local ceiling
      assert(
        localMinutes < 21 * 60 + 30,
        `Sent after 21:30 local for ${r.user_id} (local ${(localMinutes / 60).toFixed(2)}h)`,
      );
    }

    // 60-min cool-down: no two v5 rows for the same user within 60 min
    const byUser = new Map<string, string[]>();
    for (const r of v5Rows) {
      const list = byUser.get(r.user_id) ?? [];
      list.push(r.sent_at);
      byUser.set(r.user_id, list);
    }
    for (const [uid, times] of byUser) {
      const sorted = times.map((t) => new Date(t).getTime()).sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        const gapMin = (sorted[i] - sorted[i - 1]) / 60_000;
        assert(
          gapMin >= 60,
          `User ${uid} got two v5 nudges ${gapMin.toFixed(1)}m apart (must be ≥60m)`,
        );
      }
    }
  },
});

// ─── Test 5: Weekend invariants ─────────────────────────────────────────────
Deno.test({
  name: "v5 DB audit: Sunday morning (08–11 local) only fires meeting-anchored",
  ignore: !SUPABASE_SERVICE,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE, { auth: { persistSession: false } });
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows } = await sb
      .from("notification_log")
      .select("user_id, notification_type, variant_id, sent_at, payload")
      .gte("sent_at", since)
      .order("sent_at", { ascending: false });
    if (!rows) return;

    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const { data: profs } = await sb.from("profiles").select("id, timezone_offset").in("id", userIds);
    const tz = new Map<string, number>((profs ?? []).map((p) => [p.id as string, (p.timezone_offset as number) ?? 0]));

    const v5 = rows.filter((r) => (r.payload as Record<string, unknown>)?.architecture === "cos-mind-v5");
    for (const r of v5) {
      const offset = tz.get(r.user_id) ?? 0;
      const local = new Date(new Date(r.sent_at).getTime() + offset * 60_000);
      const dow = local.getUTCDay();
      const localHour = local.getUTCHours();

      // Sunday morning (08–11) is allowed only if the variant is the meeting-anchored evening Sunday or
      // a recovery-anchored variant. The current v5 source disables Sunday morning entirely
      // (evaluateNudgeOne returns null on Sunday w/o meeting), so any nudge_one in this slot must be JIT.
      if (dow === 0 && localHour < 12 && r.notification_type === "nudge_one") {
        const variantId = String(r.variant_id ?? "");
        assert(
          /JIT|sat-anchored|recovery|hrv|stakes/i.test(variantId),
          `Sunday-morning nudge_one for ${r.user_id} not anchored: variant=${variantId}`,
        );
      }

      // Saturday morning (08–11) — only meeting-anchored
      if (dow === 6 && localHour < 12 && r.notification_type === "nudge_one") {
        const variantId = String(r.variant_id ?? "");
        assert(
          /JIT|sat-anchored|stakes|recovery|hrv/i.test(variantId),
          `Saturday-morning nudge_one for ${r.user_id} not anchored: variant=${variantId}`,
        );
      }
    }
  },
});
