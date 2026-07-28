import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { collectUnresolvedAttendeeEmails, detachResolverBatch } from "../_shared/attendeeResolverQueue.ts";
import { computeIdentityKey } from "../_shared/rules/calendar-merge.ts";
import { collapseAppleMultiSource } from "../_shared/rules/apple-source-collapse.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mm-client-platform',
};

function jsonOk(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function verifyAuth0Token(authHeader: string | null): Promise<string> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) throw new Error('Missing Authorization header');
  const token = authHeader.replace('Bearer ', '');
  const auth0Domain = Deno.env.get('AUTH0_DOMAIN') || Deno.env.get('VITE_AUTH0_DOMAIN');
  if (!auth0Domain) throw new Error('Auth0 domain not configured');
  const res = await fetch(`https://${auth0Domain}/userinfo`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Token verification failed');
  const info = await res.json();
  if (!info.sub) throw new Error('Token missing sub claim');
  return info.sub;
}

const LOGISTIC_KEYWORDS = [
  'station', 'bus', 'train', 'flight', 'airport', 'departure', 'arrival',
  'boarding', 'layover', 'transit', 'coach station', 'platform', 'taxi', 'uber', 'cab',
  'delivery', 'pick up', 'dry cleaning', 'groceries', 'pharmacy', 'haircut',
  'car service', 'mot', 'oil change', 'dentist', 'optician',
  'reminder', 'auto-pay', 'subscription', 'booking confirmation', 'ticket',
  'reservation', 'out of office', 'blocked', 'hold', 'placeholder', 'tentative',
];
const LOGISTIC_PATTERN = /\[\d{6,}\]/;

const EventSchema = z.object({
  external_id: z.string().min(1),
  title: z.string().default('Untitled Event'),
  start_time: z.string().min(1),
  end_time: z.string().min(1),
  is_organizer: z.boolean().optional().default(false),
  attendees_count: z.number().int().nonnegative().optional().default(0),
  is_recurring: z.boolean().optional().default(false),
  is_all_day: z.boolean().optional(),
  event_metadata: z.record(z.unknown()).optional().default({}),
});

const BodySchema = z.object({
  windowStart: z.string().min(1),
  windowEnd: z.string().min(1),
  events: z.array(EventSchema).max(2000),
});

function classify(title: string, attendeesCount: number): { eventType: string; isHighStakes: boolean } {
  const t = title.toLowerCase();
  if (LOGISTIC_KEYWORDS.some(kw => t.includes(kw)) || LOGISTIC_PATTERN.test(title)) {
    return { eventType: 'logistic', isHighStakes: false };
  }
  if (t.includes('board') || t.includes('executive')) return { eventType: 'board-meeting', isHighStakes: true };
  if (t.includes('presentation') || t.includes('demo') || t.includes('pitch')) return { eventType: 'presentation', isHighStakes: true };
  if (t.includes('client') || t.includes('customer')) return { eventType: 'client-call', isHighStakes: attendeesCount > 5 };
  if (t.includes('interview')) return { eventType: 'interview', isHighStakes: true };
  if (t.includes('1:1') || t.includes('one-on-one')) return { eventType: 'one-on-one', isHighStakes: false };
  if (t.includes('focus') || t.includes('deep work')) return { eventType: 'deep-work', isHighStakes: false };
  if (t.includes('exam') || t.includes('test')) return { eventType: 'exam', isHighStakes: true };
  if (t.includes('deadline') || t.includes('submission')) return { eventType: 'deadline', isHighStakes: true };
  return { eventType: 'meeting', isHighStakes: false };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    let userId: string;
    try {
      userId = await verifyAuth0Token(req.headers.get('Authorization'));
    } catch {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ===== IDEMPOTENCY (X-Outbox-Item-Id) =====
    const outboxItemId = req.headers.get('x-outbox-item-id') || req.headers.get('X-Outbox-Item-Id');
    if (outboxItemId) {
      const { data: existing } = await serviceClient
        .from('processed_outbox_items')
        .select('outbox_item_id')
        .eq('outbox_item_id', outboxItemId)
        .maybeSingle();
      if (existing) {
        console.log('[sync-apple-calendar] Duplicate outbox item ignored:', outboxItemId);
        return jsonOk({ success: true, deduplicated: true, outbox_item_id: outboxItemId });
      }
    }

    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid body', details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const { windowStart, windowEnd, events } = parsed.data;

    console.log('[sync-apple-calendar] user:', redactUserId(userId), 'events:', events.length, 'window:', windowStart, '→', windowEnd);

    // Ensure connection row exists for (user_id, provider='apple')
    const { data: existingConn } = await serviceClient
      .from('calendar_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'apple')
      .maybeSingle();

    const classifiedRaw = events.map(e => {
      const { eventType, isHighStakes } = classify(e.title, e.attendees_count);
      // Apple EventKit returns recurring instances sharing the same eventIdentifier;
      // append start_time so each occurrence has a unique external_id and the
      // composite-key upsert does not collide within a single batch.
      const externalId = e.is_recurring
        ? `${e.external_id}::${e.start_time}`
        : e.external_id;
      return {
        user_id: userId,
        provider: 'apple',
        external_id: externalId,
        title: e.title || 'Untitled Event',
        start_time: e.start_time,
        end_time: e.end_time,
        is_organizer: e.is_organizer,
        attendees_count: e.attendees_count,
        is_recurring: e.is_recurring,
        // Native Apple bridge may send `is_all_day` top-level or only inside
        // event_metadata.isAllDay — accept either shape.
        is_all_day: e.is_all_day
          ?? (e.event_metadata as Record<string, unknown> | undefined)?.isAllDay === true,
        event_metadata: { ...e.event_metadata, source: 'apple_calendar', eventType, isHighStakes },
        // Phase 2 write-time dedupe foundation. See sync-calendar for
        // the shared contract. Null when title/times are missing.
        identity_key: computeIdentityKey({
          title: e.title,
          start_time: e.start_time,
          end_time: e.end_time,
        }),
      };
    });

    // Apple multi-source collapse — see _shared/rules/apple-source-collapse.ts.
    const collapsed = collapseAppleMultiSource(classifiedRaw);
    if (collapsed.length !== classifiedRaw.length) {
      console.log(
        '[sync-apple-calendar] Apple multi-source collapse:',
        'in=', classifiedRaw.length, 'out=', collapsed.length,
        'dropped=', classifiedRaw.length - collapsed.length,
      );
    }

    // Defensive dedupe by final composite key in case of any residual duplicates.
    const byKey = new Map<string, typeof collapsed[number]>();
    for (const row of collapsed) byKey.set(row.external_id, row);
    const classified = Array.from(byKey.values());

    if (classified.length > 0) {
      const { error: upsertError } = await serviceClient
        .from('calendar_events')
        .upsert(classified, { onConflict: 'user_id,provider,external_id' });
      if (upsertError) {
        console.error('[sync-apple-calendar] Upsert error:', upsertError);
        return jsonOk({ success: false, error: upsertError.message });
      }
    }

    // Provider-scoped delete: remove Apple-only rows in window that disappeared upstream
    const upstreamIds = classified.map(e => e.external_id);
    if (upstreamIds.length > 0) {
      const inList = `(${upstreamIds.map(id => `"${id.replace(/"/g, '\\"')}"`).join(',')})`;
      const { error: scopedDelErr } = await serviceClient
        .from('calendar_events')
        .delete()
        .eq('user_id', userId)
        .eq('provider', 'apple')
        .gte('start_time', windowStart)
        .lte('start_time', windowEnd)
        .not('external_id', 'in', inList);
      if (scopedDelErr) {
        console.warn('[sync-apple-calendar] Scoped delete warning (non-fatal):', scopedDelErr.message);
      }
    } else {
      await serviceClient
        .from('calendar_events')
        .delete()
        .eq('user_id', userId)
        .eq('provider', 'apple')
        .gte('start_time', windowStart)
        .lte('start_time', windowEnd);
    }

    const nowIso = new Date().toISOString();
    // Apple Calendar is native-authoritative. Only this edge function (invoked
    // by the native iOS AppleCalendarBackgroundSyncBridge) writes durable
    // status. Stamp the row so `calendar-auth update_status` can reject stale
    // JS writes and any downstream reader can trust it.
    const statusStamp = {
      status_source: 'native-ios',
      status_authoritative_at: nowIso,
    } as const;
    if (existingConn) {
      const { error: connUpdateError } = await serviceClient
        .from('calendar_connections')
        .update({ is_active: true, last_sync: nowIso, updated_at: nowIso, ...statusStamp })
        .eq('id', existingConn.id);
      if (connUpdateError) {
        console.warn('[sync-apple-calendar] Connection update warning:', connUpdateError.message);
      }
    } else {
      const { error: connInsertError } = await serviceClient
        .from('calendar_connections')
        .insert({ user_id: userId, provider: 'apple', is_active: true, last_sync: nowIso, ...statusStamp });
      if (connInsertError) {
        console.warn('[sync-apple-calendar] Connection insert warning:', connInsertError.message);
      }
    }

    if (outboxItemId) {
      try {
        await serviceClient.from('processed_outbox_items').insert({
          outbox_item_id: outboxItemId,
          user_id: userId,
          function_name: 'sync-apple-calendar',
        });
      } catch (e) {
        console.warn('[sync-apple-calendar] processed_outbox_items insert noop:', (e as Error)?.message);
      }
      if (Math.random() < 0.02) {
        try {
          const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
          await serviceClient.from('processed_outbox_items').delete().lt('created_at', cutoff);
        } catch { /* */ }
      }
    }

    console.log('[sync-apple-calendar] success user=', redactUserId(userId), 'eventCount=', classified.length, 'lastSync=', nowIso);

    // Post-sync attendee resolver (fire-and-forget). See sync-calendar
    // for rationale. Apple EventKit rarely exposes attendee emails, so
    // this is usually a no-op but kept for parity.
    try {
      const { emails, skipped_generic, skipped_cached } =
        await collectUnresolvedAttendeeEmails(serviceClient, userId, classified);
      console.log(`[sync-apple-calendar] resolver_candidates count=${emails.length} skipped_generic=${skipped_generic} skipped_cached=${skipped_cached}`);
      detachResolverBatch(userId, emails, 'sync-apple-calendar');
    } catch (e) {
      console.warn('[sync-apple-calendar] resolver hook error category=hook msg=', (e as Error)?.message);
    }

    return jsonOk({ success: true, eventCount: classified.length, lastSync: nowIso });
  } catch (err) {
    console.error('[sync-apple-calendar] Unhandled error:', err);
    return jsonOk({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});
