import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface RequestBody {
  action: 'GET_FAVORITES' | 'ADD_FAVORITE' | 'REMOVE_FAVORITE';
  contentId?: string;
  contentType?: string;
  category?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = await verifyAuth0Token(authHeader);
    const { action, contentId, contentType, category } = await req.json() as RequestBody;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log(`[user-favorites] Action: ${action}, User: ${userId}`);

    switch (action) {
      case 'GET_FAVORITES': {
        const { data, error } = await supabase
          .from('user_favorites')
          .select('content_id')
          .eq('user_id', userId);

        if (error) throw error;
        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'ADD_FAVORITE': {
        if (!contentId || !contentType || !category) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { error } = await supabase
          .from('user_favorites')
          .insert({
            user_id: userId,
            content_id: contentId,
            content_type: contentType,
            category: category
          });

        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'REMOVE_FAVORITE': {
        if (!contentId) {
          return new Response(JSON.stringify({ error: 'Missing contentId' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { error } = await supabase
          .from('user_favorites')
          .delete()
          .eq('user_id', userId)
          .eq('content_id', contentId);

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
    console.error('[user-favorites] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
