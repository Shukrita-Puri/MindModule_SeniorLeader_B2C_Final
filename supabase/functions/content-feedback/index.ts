import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  action: 'GET_FEEDBACK' | 'SUBMIT_FEEDBACK';
  contentId?: string;
  feedbackData?: {
    content_id: string;
    content_type: string;
    feedback_type: string;
    star_rating?: number;
    session_id?: string;
    trigger_context?: string;
    feedback_text?: string;
    feedback_reason?: string;
    context_data?: Record<string, unknown>;
  };
}

async function verifyAuth0Token(authHeader: string): Promise<string> {
  const token = authHeader.replace('Bearer ', '');
  const auth0Domain = Deno.env.get('AUTH0_DOMAIN');
  
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
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = await verifyAuth0Token(authHeader);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, contentId, feedbackData } = await req.json() as RequestBody;
    console.log(`[content-feedback] Action: ${action}, User: ${userId}`);

    switch (action) {
      case 'GET_FEEDBACK': {
        let query = supabase
          .from('content_relevance_feedback')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (contentId) {
          query = query.eq('content_id', contentId);
        }

        const { data, error } = await query;

        if (error) {
          console.error('[content-feedback] GET_FEEDBACK error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'SUBMIT_FEEDBACK': {
        if (!feedbackData) {
          return new Response(JSON.stringify({ error: 'Missing feedback data' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data, error } = await supabase
          .from('content_relevance_feedback')
          .insert({
            user_id: userId,
            ...feedbackData,
            timestamp: new Date().toISOString()
          })
          .select()
          .single();

        if (error) {
          console.error('[content-feedback] SUBMIT_FEEDBACK error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
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
    console.error('[content-feedback] Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
