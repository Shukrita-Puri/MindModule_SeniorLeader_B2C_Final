import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Module type to content mapping
const moduleContentFilters: Record<string, { categories: string[]; tags: string[]; intensities: string[] }> = {
  regulate: { categories: ['pause'], tags: ['breathing', 'somatic', 'grounding', 'composure', 'calm'], intensities: ['gentle', 'moderate'] },
  align: { categories: ['power-up', 'presence'], tags: ['focus', 'clarity', 'intention', 'confidence', 'mindset'], intensities: ['moderate', 'activating'] },
  prepare: { categories: ['power-up'], tags: ['preparation', 'strategy', 'visualization', 'confidence'], intensities: ['moderate', 'activating'] },
  integrate: { categories: ['pause', 'presence'], tags: ['reflection', 'closure', 'release', 'restore'], intensities: ['gentle'] },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { eventId, scenarioModules } = await req.json();
    if (!eventId) {
      return new Response(JSON.stringify({ error: 'Missing eventId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get event context
    const { data: eventCtx } = await supabase
      .from('jit_event_context')
      .select('*')
      .eq('calendar_event_id', eventId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!eventCtx) {
      return new Response(JSON.stringify({ error: 'Event context not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Determine modules from scenario or default
    const modules: string[] = scenarioModules || ['regulate', 'align'];

    // Fetch content library
    const { data: allContent } = await supabase
      .from('sanctuary_content')
      .select('id, title, content_type, category, tags, duration, sub_type')
      .eq('is_active', true);

    const { data: allMetadata } = await supabase
      .from('sanctuary_content_metadata')
      .select('content_id, structured_tags');

    const metadataMap = new Map((allMetadata || []).map(m => [m.content_id, m]));
    const content = allContent || [];

    // Select one practice per module
    const cards: any[] = [];
    const usedIds = new Set<string>();

    for (const moduleType of modules) {
      const filters = moduleContentFilters[moduleType];
      if (!filters) continue;

      // Score and select content for this module
      const candidates = content
        .filter(c => !usedIds.has(c.id))
        .map(c => {
          let score = 0;
          const meta = metadataMap.get(c.id);
          const tags = (c.tags || []).map((t: string) => t.toLowerCase());
          const intensity = meta?.structured_tags?.intensityLevel || '';

          // Category match
          if (filters.categories.includes(c.category)) score += 10;

          // Tag overlap
          const tagOverlap = filters.tags.filter(t => tags.includes(t)).length;
          score += tagOverlap * 5;

          // Intensity match
          if (filters.intensities.includes(intensity)) score += 8;

          // Prefer short content for JIT (≤3 min)
          if (c.duration <= 3) score += 5;
          if (c.duration <= 5) score += 3;

          return { ...c, score };
        })
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score);

      // Take top candidate (deterministic – first by score)
      if (candidates.length > 0) {
        const selected = candidates[0];
        usedIds.add(selected.id);

        cards.push({
          cardType: 'practice',
          position: cards.length + 1,
          practiceId: selected.id,
          practiceTitle: selected.title,
          practiceCategory: selected.category,
          contentType: selected.content_type,
          duration: selected.duration,
          moduleType,
        });
      }
    }

    // Coach card
    const minutesUntil = Math.max(0, Math.round(
      (new Date(eventCtx.event_start).getTime() - Date.now()) / 60000
    ));
    const coachPrompt = `You have ${eventCtx.event_title} in ${minutesUntil} minutes. What outcome would make this a success for you?`;

    // Determine coach card position
    const coachFirst = eventCtx.has_pending_tool || eventCtx.expressed_concern || eventCtx.final_score >= 90;

    const coachCard = {
      cardType: 'coach',
      position: coachFirst ? 0 : cards.length + 1,
      toolName: null,
      contextStatement: eventCtx.context_statement,
      coachPrompt,
      navigateTo: `/coach?context=pre-event&eventId=${eventId}`,
    };

    // Insert coach card at correct position
    if (coachFirst) {
      cards.unshift(coachCard);
      // Re-number positions
      cards.forEach((c, i) => c.position = i + 1);
    } else {
      coachCard.position = cards.length + 1;
      cards.push(coachCard);
    }

    // Store cards in jit_carousel_cards
    const cardsToInsert = cards.map(c => ({
      user_id: userId,
      event_id: eventCtx.id,
      card_type: c.cardType,
      card_position: c.position,
      practice_id: c.practiceId || null,
      practice_category: c.practiceCategory || null,
      coach_tool_name: c.toolName || null,
      coach_context_statement: c.contextStatement || null,
    }));

    if (cardsToInsert.length > 0) {
      await supabase.from('jit_carousel_cards').insert(cardsToInsert);
    }

    console.log(`[generate-jit-carousel] Generated ${cards.length} cards for event ${eventCtx.event_title}`);

    return new Response(JSON.stringify({ cards }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[generate-jit-carousel] Error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
