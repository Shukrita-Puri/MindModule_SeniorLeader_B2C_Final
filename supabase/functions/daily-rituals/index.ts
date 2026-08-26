import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";
import { cronForbiddenResponse, isAuthorizedCronCaller } from "../_shared/cron-auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mm-client-platform',
};

function getServerTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getUTCHours();
  // Default to UTC – client can pass session_period to override
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

interface RequestBody {
  action: 'GET_RITUALS' | 'GET_TODAY_RITUAL' | 'UPSERT_RITUAL' | 'GET_RITUAL_RANGE' | 'COMPLETE_PRACTICE' | 'DELETE_TODAY_RITUAL' | 'CLEANUP_HISTORICAL_COMPLETIONS';
  startDate?: string;
  endDate?: string;
  sessionPeriod?: 'morning' | 'afternoon' | 'evening';
  practiceType?: 'soundscape' | 'guided_practice' | 'micro_exercise';
  practiceId?: string;
  practiceQueue?: { id: string }[];
  ritualData?: {
    ritual_date: string;
    session_period?: string;
    soundscape_completed?: boolean;
    soundscape_completed_at?: string;
    guided_practice_completed?: boolean;
    guided_practice_completed_at?: string;
    micro_exercise_completed?: boolean;
    micro_exercise_completed_at?: string;
    completion_status?: string;
    recommended_practice_ids?: string[];
    completed_practice_ids?: string[];
    recommended_practices_count?: number;
      plan_ledger?: {
        modules?: unknown[];
        generatedAt?: string;
        generatedPeriod?: string;
        source?: string;
        userEdits?: {
          slotEdits?: Record<string, {
            cancelled?: boolean;
            cancelReason?: string | null;
            replacementEventIds?: string[];
            priorityTag?: 'high' | 'medium' | 'low' | null;
            relationshipTag?: string | null;
            customTags?: string[];
            updatedAt?: string;
          }>;
          updatedAt?: string;
        };
      } | null;
  };
  isPlanPractice?: boolean;
  planContext?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  durationSeconds?: number | null;
}

function normaliseIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function deriveStartedAt(startedAt: unknown, completedAt: string, durationSeconds: unknown): string | null {
  const explicit = normaliseIsoTimestamp(startedAt);
  if (explicit) return explicit;

  const duration = typeof durationSeconds === 'number'
    ? durationSeconds
    : typeof durationSeconds === 'string'
      ? Number(durationSeconds)
      : NaN;
  if (!Number.isFinite(duration) || duration <= 0) return null;

  return new Date(new Date(completedAt).getTime() - duration * 1000).toISOString();
}

function normalisePlanContext(value: unknown): string {
  const allowed = new Set([
    'pre-travel',
    'during-travel',
    'post-travel',
    'pre-board',
    'during-board',
    'post-board',
    'pre-heavy-load',
    'during-heavy-load',
    'post-heavy-load',
    'pre-high-stakes',
    'post-high-stakes',
    'standalone',
  ]);
  return typeof value === 'string' && allowed.has(value) ? value : 'standalone';
}

type ServiceClient = ReturnType<typeof createClient>;

interface CleanupResult {
  scanned: number;
  repaired_via_session: number;
  repaired_via_rating: number;
  downgraded_to_skipped: number;
  started_at_derived: number;
  errors: string[];
  dryRun: boolean;
}

/**
 * One-time historical repair for `daily_ritual_completions` rows that were
 * written before the completion-integrity trigger existed.
 *
 * RULE 1 — `skipped` rows are never touched.
 * RULE 2 — partial/full rows that already carry ids are never touched.
 * RULE 3 — partial/full rows with EMPTY ids are repaired from a same-day
 *          practice_sessions row (a), else from a content_relevance_feedback
 *          rating within 2h of updated_at (b), else downgraded to `skipped` (c).
 * RULE 4 — rows repaired without a start time get
 *          practice_started_at = practice_completed_at - duration when a
 *          duration is known; otherwise it stays null.
 */
async function cleanupHistoricalCompletions(
  db: ServiceClient,
  opts: { targetUserId?: string | null; limit?: number; dryRun?: boolean },
): Promise<CleanupResult> {
  const result: CleanupResult = {
    scanned: 0,
    repaired_via_session: 0,
    repaired_via_rating: 0,
    downgraded_to_skipped: 0,
    started_at_derived: 0,
    errors: [],
    dryRun: opts.dryRun === true,
  };

  let query = db
    .from('daily_ritual_completions')
    .select('id, user_id, ritual_date, updated_at, completion_status, completed_practice_ids, practice_started_at, practice_completed_at')
    .in('completion_status', ['partial', 'full'])
    .order('ritual_date', { ascending: true })
    .limit(Math.min(Math.max(opts.limit ?? 500, 1), 2000));

  if (opts.targetUserId) query = query.eq('user_id', opts.targetUserId);

  const { data: rows, error } = await query;
  if (error) throw error;

  // RULE 2 — only rows with empty ids are candidates.
  const candidates = (rows ?? []).filter(
    (r: any) => !Array.isArray(r.completed_practice_ids) || r.completed_practice_ids.length === 0,
  );
  result.scanned = candidates.length;

  for (const row of candidates as any[]) {
    try {
      let practiceId: string | null = null;
      let completedAt: string | null = normaliseIsoTimestamp(row.practice_completed_at);
      let durationSeconds: number | null = null;
      let source: 'session' | 'rating' | null = null;

      // (a) same-day practice_sessions row
      const dayStart = `${row.ritual_date}T00:00:00.000Z`;
      const dayEnd = new Date(Date.parse(dayStart) + 24 * 60 * 60 * 1000).toISOString();
      const { data: sessions } = await db
        .from('practice_sessions')
        .select('content_id, completed_at, created_at, started_at, duration_seconds')
        .eq('user_id', row.user_id)
        .gte('created_at', dayStart)
        .lt('created_at', dayEnd)
        .order('created_at', { ascending: false })
        .limit(1);

      const session = (sessions ?? [])[0] as any | undefined;
      if (session?.content_id) {
        practiceId = String(session.content_id);
        source = 'session';
        completedAt = completedAt
          ?? normaliseIsoTimestamp(session.completed_at)
          ?? normaliseIsoTimestamp(session.created_at);
        if (typeof session.duration_seconds === 'number') durationSeconds = session.duration_seconds;
        if (!row.practice_started_at && normaliseIsoTimestamp(session.started_at)) {
          // Precise start is available straight from the session.
          durationSeconds = durationSeconds ?? null;
        }
      }

      // (b) rating within 2h of updated_at
      if (!practiceId) {
        const anchor = Date.parse(row.updated_at);
        if (Number.isFinite(anchor)) {
          const from = new Date(anchor - 2 * 60 * 60 * 1000).toISOString();
          const to = new Date(anchor + 2 * 60 * 60 * 1000).toISOString();
          const { data: ratings } = await db
            .from('content_relevance_feedback')
            .select('content_id, timestamp, created_at, context_data')
            .eq('user_id', row.user_id)
            .gte('timestamp', from)
            .lte('timestamp', to)
            .order('timestamp', { ascending: false })
            .limit(1);

          const rating = (ratings ?? [])[0] as any | undefined;
          if (rating?.content_id) {
            practiceId = String(rating.content_id);
            source = 'rating';
            const ctx = (rating.context_data ?? {}) as Record<string, unknown>;
            completedAt = completedAt
              ?? normaliseIsoTimestamp(ctx.practiceCompletedAt)
              ?? normaliseIsoTimestamp(rating.timestamp)
              ?? normaliseIsoTimestamp(rating.created_at);
            const ctxDuration = Number(ctx.durationSeconds);
            if (Number.isFinite(ctxDuration) && ctxDuration > 0) durationSeconds = ctxDuration;
          }
        }
      }

      // (c) unresolvable → downgrade, never delete
      if (!practiceId || !completedAt) {
        if (!result.dryRun) {
          const { error: downgradeError } = await db
            .from('daily_ritual_completions')
            .update({ completion_status: 'skipped' })
            .eq('id', row.id);
          if (downgradeError) throw downgradeError;
        }
        result.downgraded_to_skipped += 1;
        continue;
      }

      // RULE 4 — derive a start time only when a duration is known.
      let startedAt = normaliseIsoTimestamp(row.practice_started_at);
      const sessionStart = normaliseIsoTimestamp((session as any)?.started_at);
      if (!startedAt && source === 'session' && sessionStart) startedAt = sessionStart;
      if (!startedAt) startedAt = deriveStartedAt(null, completedAt, durationSeconds);
      if (!row.practice_started_at && startedAt) result.started_at_derived += 1;

      if (!result.dryRun) {
        const { error: repairError } = await db
          .from('daily_ritual_completions')
          .update({
            completed_practice_ids: [practiceId],
            practice_completed_at: completedAt,
            ...(startedAt ? { practice_started_at: startedAt } : {}),
          })
          .eq('id', row.id);
        if (repairError) throw repairError;
      }

      if (source === 'session') result.repaired_via_session += 1;
      else result.repaired_via_rating += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${row.id}: ${msg}`);
      console.error('[daily-rituals] cleanup row failed', row.id, msg);
    }
  }

  console.log('[daily-rituals] CLEANUP_HISTORICAL_COMPLETIONS', JSON.stringify(result));
  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Admin/service-role only maintenance action — handled before user auth so a
  // service-role bearer token (which is not an Auth0 JWT) is accepted.
  try {
    const peek = await req.clone().json().catch(() => null) as
      | { action?: string; userId?: string; limit?: number; dryRun?: boolean }
      | null;
    if (peek?.action === 'CLEANUP_HISTORICAL_COMPLETIONS') {
      if (!isAuthorizedCronCaller(req)) {
        return cronForbiddenResponse(corsHeaders);
      }
      const db = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );
      const cleanup = await cleanupHistoricalCompletions(db, {
        targetUserId: peek.userId ?? null,
        limit: peek.limit,
        dryRun: peek.dryRun,
      });
      return new Response(JSON.stringify({ success: true, ...cleanup }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[daily-rituals] cleanup error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }


  try {
    let userId: string;
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) {
      // DEV_MODE bypass: allow fallback when not in production
      const env = Deno.env.get('ENVIRONMENT') || '';
      if (env !== 'production') {
        const devHeader = req.headers.get('x-dev-user-id');
        if (devHeader) {
          userId = devHeader;
          console.log(`[daily-rituals] DEV bypass: userId=${redactUserId(userId)}`);
        } else {
          return auth.errorResponse;
        }
      } else {
        return auth.errorResponse;
      }
    } else {
      userId = auth.userId;
    }
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json() as RequestBody;
    const { action, startDate, endDate, ritualData } = body;
    console.log(`[daily-rituals] Action: ${action}, User: ${redactUserId(userId)}`);

    switch (action) {
      case 'GET_RITUALS': {
        const daysBack = 30;
        const start = new Date();
        start.setDate(start.getDate() - daysBack);
        
        const { data, error } = await supabase
          .from('daily_ritual_completions')
          .select('*')
          .eq('user_id', userId)
          .gte('ritual_date', start.toISOString().split('T')[0])
          .order('ritual_date', { ascending: false });

        if (error) {
          console.error('[daily-rituals] GET_RITUALS error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'GET_TODAY_RITUAL': {
        const today = new Date().toISOString().split('T')[0];
        const period = body.sessionPeriod;
        
        let query = supabase
          .from('daily_ritual_completions')
          .select('*')
          .eq('user_id', userId)
          .eq('ritual_date', today);
        
        // If sessionPeriod provided, filter by it; otherwise get latest
        if (period) {
          query = query.eq('session_period', period);
        }
        
        const { data, error } = await query
          .order('updated_at', { ascending: false })
          .maybeSingle();

        if (error) {
          console.error('[daily-rituals] GET_TODAY_RITUAL error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'GET_RITUAL_RANGE': {
        if (!startDate || !endDate) {
          return new Response(JSON.stringify({ error: 'Missing date range' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data, error } = await supabase
          .from('daily_ritual_completions')
          .select('*')
          .eq('user_id', userId)
          .gte('ritual_date', startDate)
          .lte('ritual_date', endDate)
          .order('ritual_date', { ascending: true });

        if (error) {
          console.error('[daily-rituals] GET_RITUAL_RANGE error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'UPSERT_RITUAL': {
        if (!ritualData) {
          return new Response(JSON.stringify({ error: 'Missing ritual data' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Ensure session_period is set for the new unique constraint
        const upsertData = {
          user_id: userId,
          ...ritualData,
          session_period: ritualData.session_period || body.sessionPeriod || getServerTimeOfDay()
        };

        const { data, error } = await supabase
          .from('daily_ritual_completions')
          .upsert(upsertData, { onConflict: 'user_id,ritual_date,session_period' })
          .select()
          .single();

        if (error) {
          console.error('[daily-rituals] UPSERT_RITUAL error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'COMPLETE_PRACTICE': {
        const {
          practiceType, practiceId, practiceQueue, sessionPeriod,
          isPlanPractice, planContext, startedAt, completedAt, durationSeconds,
        } = body;
        if (!practiceType || !practiceId) {
          return new Response(JSON.stringify({ error: 'Missing practiceType or practiceId' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const today = new Date().toISOString().split('T')[0];
        const now = new Date().toISOString();
        const period = sessionPeriod || getServerTimeOfDay();
        const finishedAt = normaliseIsoTimestamp(completedAt) || now;
        const startedAtIso = deriveStartedAt(startedAt, finishedAt, durationSeconds);
        if (startedAt != null && !startedAtIso) {
          console.warn('[daily-rituals] COMPLETE_PRACTICE ignored invalid startedAt', { practiceId });
        }
        const inQueue = Array.isArray(practiceQueue)
          ? practiceQueue.some((p: any) => p?.id === practiceId)
          : false;
        const planPractice = typeof isPlanPractice === 'boolean' ? isPlanPractice : inQueue;

        // 1. Get current ritual for this period (if exists)
        const { data: existing } = await supabase
          .from('daily_ritual_completions')
          .select('*')
          .eq('user_id', userId)
          .eq('ritual_date', today)
          .eq('session_period', period)
          .maybeSingle();

        // 2. Build updated fields atomically
        const existingIds: string[] = existing?.completed_practice_ids || [];
        const newCompletedIds = existingIds.includes(practiceId) 
          ? existingIds 
          : [...existingIds, practiceId];

        const updateData: Record<string, any> = {
          user_id: userId,
          ritual_date: today,
          session_period: period,
          completed_practice_ids: newCompletedIds,
          // Every completion is logged — plan-launched or ad-hoc from the library.
          is_plan_practice: planPractice,
          plan_context: normalisePlanContext(planContext),
          practice_completed_at: finishedAt,
        };
        if (startedAtIso) {
          updateData.practice_started_at = startedAtIso;
        }

        // 3. Set boolean flag + timestamp for practiceType
        if (practiceType === 'soundscape') {
          updateData.soundscape_completed = true;
          updateData.soundscape_completed_at = finishedAt;
        } else if (practiceType === 'guided_practice') {
          updateData.guided_practice_completed = true;
          updateData.guided_practice_completed_at = finishedAt;
        } else if (practiceType === 'micro_exercise') {
          updateData.micro_exercise_completed = true;
          updateData.micro_exercise_completed_at = finishedAt;
        }

        // Set recommended if provided via queue
        if (practiceQueue && practiceQueue.length > 0) {
          updateData.recommended_practice_ids = practiceQueue.map((p: any) => p.id);
          updateData.recommended_practices_count = practiceQueue.length;
        }


        // 4. Recalculate completion_status
        const totalRecommended = updateData.recommended_practices_count 
          || existing?.recommended_practices_count 
          || 3;
        const completedCount = newCompletedIds.length;
        
        updateData.completion_status = completedCount >= totalRecommended && completedCount > 0
          ? 'full'
          : completedCount > 0
            ? 'partial'
            : 'skipped';

        // 5. Upsert in ONE call – now keyed on (user_id, ritual_date, session_period)
        const { data, error } = await supabase
          .from('daily_ritual_completions')
          .upsert(updateData, { onConflict: 'user_id,ritual_date,session_period' })
          .select()
          .single();

        if (error) {
          console.error('[daily-rituals] COMPLETE_PRACTICE error:', error);
          throw error;
        }

        const returnedIds = Array.isArray(data?.completed_practice_ids) ? data.completed_practice_ids : [];
        if (!returnedIds.includes(practiceId) || !data?.practice_completed_at) {
          console.error('[daily-rituals] COMPLETE_PRACTICE verification failed:', { practiceId, returnedIds, hasCompletedAt: Boolean(data?.practice_completed_at) });
          return new Response(JSON.stringify({ error: 'Completion write verification failed' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        console.log(`[daily-rituals] COMPLETE_PRACTICE success: ${practiceId}, period=${period}, status=${updateData.completion_status}, completed=${completedCount}/${totalRecommended}, timing=${startedAtIso ? 'precise' : 'completed-only'}`);

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'DELETE_TODAY_RITUAL': {
        const today = new Date().toISOString().split('T')[0];
        const deletePeriod = body.sessionPeriod;
        
        let deleteQuery = supabase
          .from('daily_ritual_completions')
          .delete()
          .eq('user_id', userId)
          .eq('ritual_date', today);
        
        if (deletePeriod) {
          deleteQuery = deleteQuery.eq('session_period', deletePeriod);
        }
        
        const { error } = await deleteQuery;

        if (error) {
          console.error('[daily-rituals] DELETE_TODAY_RITUAL error:', error);
          throw error;
        }

        console.log(`[daily-rituals] DELETE_TODAY_RITUAL success for ${redactUserId(userId)} on ${today}`);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[daily-rituals] Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
