import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SemanticAnalysisResponse {
  themePatterns: { phrase: string; count: number; driver: string }[];
  coachThemes: { keyword: string; count: number; weight: number }[];
  practiceTypes: { type: string; count: number; percentage: number }[];
  contentTags: { tag: string; count: number; weight: number }[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get Auth0 token from header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify Auth0 token
    const token = authHeader.replace('Bearer ', '');
    const userInfoResponse = await fetch('https://dev-lq1jvpvlg5hjbhz0.us.auth0.com/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!userInfoResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const auth0User = await userInfoResponse.json();
    const userId = auth0User.sub;

    const { days = 7 } = await req.json();

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Fetch theme patterns from daily_themes
    const { data: themes } = await supabase
      .from('daily_themes')
      .select('theme_phrase, theme_driver')
      .eq('user_id', userId)
      .gte('theme_date', startDateStr)
      .order('theme_date', { ascending: false });

    // Aggregate theme patterns
    const themeMap = new Map<string, { count: number; driver: string }>();
    themes?.forEach(t => {
      const existing = themeMap.get(t.theme_phrase) || { count: 0, driver: t.theme_driver || 'state' };
      themeMap.set(t.theme_phrase, { count: existing.count + 1, driver: existing.driver });
    });
    const themePatterns = Array.from(themeMap.entries())
      .map(([phrase, data]) => ({ phrase, count: data.count, driver: data.driver }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Fetch dialogue messages for coach themes
    const { data: sessions } = await supabase
      .from('dialogue_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('context_type', 'coach')
      .gte('created_at', startDate.toISOString());

    let coachThemes: { keyword: string; count: number; weight: number }[] = [];
    
    if (sessions && sessions.length > 0) {
      const sessionIds = sessions.map(s => s.id);
      const { data: messages } = await supabase
        .from('dialogue_messages')
        .select('content')
        .in('session_id', sessionIds)
        .eq('sender_type', 'user');

      if (messages && messages.length > 0) {
        // Use AI to extract keywords
        const allContent = messages.map(m => m.content).join('\n\n');
        
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
        if (geminiApiKey && allContent.length > 50) {
          try {
            const geminiResponse = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{
                    parts: [{
                      text: `Analyze these coaching conversation excerpts and extract the 5-8 most important themes or topics the user discussed. Return ONLY a JSON array of objects with "keyword" (2-4 word phrase) and "weight" (0.1-1.0 based on frequency/importance).

Example format: [{"keyword": "decision fatigue", "weight": 0.9}, {"keyword": "morning routine", "weight": 0.6}]

Conversation excerpts:
${allContent.slice(0, 3000)}`
                    }]
                  }],
                  generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 500
                  }
                })
              }
            );

            if (geminiResponse.ok) {
              const geminiData = await geminiResponse.json();
              const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
              
              // Extract JSON from response
              const jsonMatch = responseText.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                const keywords = JSON.parse(jsonMatch[0]);
                coachThemes = keywords.map((k: { keyword: string; weight: number }) => ({
                  keyword: k.keyword,
                  count: Math.round(k.weight * messages.length),
                  weight: k.weight
                }));
              }
            }
          } catch (aiError) {
            console.error('AI extraction error:', aiError);
          }
        }
      }
    }

    // Fetch practice data from sanctuary_events
    const { data: practiceEvents } = await supabase
      .from('sanctuary_events')
      .select('category, tags')
      .eq('user_id', userId)
      .eq('event_type', 'completed')
      .gte('created_at', startDate.toISOString());

    // Aggregate practice types
    const categoryMap = new Map<string, number>();
    const tagMap = new Map<string, number>();
    
    practiceEvents?.forEach(p => {
      // Category aggregation - normalize to Pause/Flow/Renewal
      const category = p.category?.toLowerCase() || 'unknown';
      let normalizedType = 'other';
      if (category.includes('pause') || category.includes('regulate') || category.includes('calm')) {
        normalizedType = 'Pause';
      } else if (category.includes('flow') || category.includes('presence') || category.includes('focus')) {
        normalizedType = 'Flow';
      } else if (category.includes('power') || category.includes('renewal') || category.includes('energy')) {
        normalizedType = 'Renewal';
      }
      
      categoryMap.set(normalizedType, (categoryMap.get(normalizedType) || 0) + 1);
      
      // Tag aggregation
      if (p.tags && Array.isArray(p.tags)) {
        p.tags.forEach((tag: string) => {
          const normalizedTag = tag.toLowerCase().replace(/-/g, ' ');
          tagMap.set(normalizedTag, (tagMap.get(normalizedTag) || 0) + 1);
        });
      }
    });

    const totalPractices = practiceEvents?.length || 1;
    const practiceTypes = Array.from(categoryMap.entries())
      .map(([type, count]) => ({ 
        type, 
        count, 
        percentage: Math.round((count / totalPractices) * 100) 
      }))
      .sort((a, b) => b.count - a.count);

    // Get top 8 content tags
    const maxTagCount = Math.max(...Array.from(tagMap.values()), 1);
    const contentTags = Array.from(tagMap.entries())
      .map(([tag, count]) => ({ 
        tag, 
        count, 
        weight: count / maxTagCount 
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const response: SemanticAnalysisResponse = {
      themePatterns,
      coachThemes,
      practiceTypes,
      contentTags
    };

    return new Response(
      JSON.stringify({ data: response }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Semantic analysis error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
