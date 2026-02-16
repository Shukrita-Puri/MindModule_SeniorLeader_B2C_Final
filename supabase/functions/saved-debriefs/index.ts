import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface RequestBody {
  action: 'GET_DEBRIEFS' | 'SAVE_DEBRIEF' | 'DELETE_DEBRIEF';
  debriefId?: string;
  debrief?: {
    sessionId?: string | null;
    title?: string;
    scenarioDomain?: string;
    scenarioContext?: string;
    personaType?: string;
    durationSeconds?: number;
    strengths?: any[];
    developmentAreas?: any[];
    frameworks?: any[];
    transcript?: any[];
    personalNotes?: string;
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function verifyAuth0Token(authHeader: string): Promise<string> {
  const token = authHeader.replace('Bearer ', '');
  const auth0Domain = Deno.env.get('VITE_AUTH0_DOMAIN');
  if (!auth0Domain) throw new Error('VITE_AUTH0_DOMAIN not configured');
  
  const response = await fetch(`https://${auth0Domain}/userinfo`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!response.ok) {
    throw new Error('Invalid token');
  }
  
  const userInfo = await response.json();
  return userInfo.sub;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = await verifyAuth0Token(authHeader);
    const { action, debriefId, debrief } = await req.json() as RequestBody;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log(`[saved-debriefs] Action: ${action}, User: ${userId}`);

    switch (action) {
      case 'GET_DEBRIEFS': {
        const { data, error } = await supabase
          .from('saved_debriefs')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'SAVE_DEBRIEF': {
        if (!debrief) {
          return new Response(JSON.stringify({ error: 'Missing debrief data' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const insertData = {
          user_id: userId,
          session_id: debrief.sessionId,
          title: debrief.title || `Dialogue Session - ${new Date().toLocaleDateString()}`,
          scenario_domain: debrief.scenarioDomain,
          scenario_context: debrief.scenarioContext,
          persona_type: debrief.personaType,
          duration_seconds: debrief.durationSeconds,
          strengths: debrief.strengths || [],
          development_areas: debrief.developmentAreas || [],
          frameworks_used: debrief.frameworks || [],
          transcript_json: debrief.transcript || [],
          personal_notes: debrief.personalNotes
        };

        const { data, error } = await supabase
          .from('saved_debriefs')
          .insert(insertData)
          .select()
          .single();

        if (error) throw error;
        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'DELETE_DEBRIEF': {
        if (!debriefId) {
          return new Response(JSON.stringify({ error: 'Missing debriefId' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { error } = await supabase
          .from('saved_debriefs')
          .delete()
          .eq('id', debriefId)
          .eq('user_id', userId);

        if (error) throw error;
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
  } catch (error: unknown) {
    console.error('[saved-debriefs] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
