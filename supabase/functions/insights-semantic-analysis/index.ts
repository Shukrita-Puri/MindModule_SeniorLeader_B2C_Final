import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Unified theme from all sources
interface UnifiedTheme {
  theme: string;
  totalCount: number;
  weight: number;
  sources: {
    coach: number;
    practice: number;
    wins: number;
    checkins: number;
  };
}

interface SemanticAnalysisResponse {
  themePatterns: { phrase: string; count: number; driver: string }[];
  unifiedThemes: UnifiedTheme[];
  themeRelationships: { from: string; to: string; strength: number }[];
}

interface BubbleDetailsResponse {
  keyword: string;
  totalCount: number;
  recentMentions: {
    snippet: string;
    date: string;
    source: 'coach' | 'practice' | 'wins' | 'checkins';
    sessionId?: string;
  }[];
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

    const requestBody = await req.json();
    const { days = 7, action = 'analyze', keyword } = requestBody;

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Handle bubble details request
    if (action === 'getBubbleDetails' && keyword) {
      const details = await getBubbleDetails(supabase, userId, keyword, startDate);
      return new Response(
        JSON.stringify({ data: details }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // UNIFIED THEME AGGREGATION FROM ALL SOURCES
    // ============================================
    
    const themeMap = new Map<string, { count: number; sources: { coach: number; practice: number; wins: number; checkins: number } }>();
    
    const mergeTheme = (theme: string, source: 'coach' | 'practice' | 'wins' | 'checkins', count: number = 1) => {
      const normalizedTheme = theme.toLowerCase().trim();
      if (!normalizedTheme || normalizedTheme.length < 2) return;
      
      const existing = themeMap.get(normalizedTheme) || { 
        count: 0, 
        sources: { coach: 0, practice: 0, wins: 0, checkins: 0 } 
      };
      existing.count += count;
      existing.sources[source] += count;
      themeMap.set(normalizedTheme, existing);
    };

    // 1. Fetch theme patterns from daily_themes (for Theme Patterns section)
    const { data: themes } = await supabase
      .from('daily_themes')
      .select('theme_phrase, theme_driver')
      .eq('user_id', userId)
      .gte('theme_date', startDateStr)
      .order('theme_date', { ascending: false });

    // Aggregate theme patterns for display
    const themePatternMap = new Map<string, { count: number; driver: string }>();
    themes?.forEach(t => {
      const existing = themePatternMap.get(t.theme_phrase) || { count: 0, driver: t.theme_driver || 'state' };
      themePatternMap.set(t.theme_phrase, { count: existing.count + 1, driver: existing.driver });
    });
    const themePatterns = Array.from(themePatternMap.entries())
      .map(([phrase, data]) => ({ phrase, count: data.count, driver: data.driver }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // 2. Fetch coach dialogue messages and extract themes
    const { data: sessions } = await supabase
      .from('dialogue_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('context_type', 'coach')
      .gte('created_at', startDate.toISOString());

    let themeRelationships: { from: string; to: string; strength: number }[] = [];
    
    if (sessions && sessions.length > 0) {
      const sessionIds = sessions.map(s => s.id);
      const { data: messages } = await supabase
        .from('dialogue_messages')
        .select('content')
        .in('session_id', sessionIds)
        .eq('sender_type', 'user');

      if (messages && messages.length > 0) {
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
                      text: `Analyze these coaching conversation excerpts and:
1. Extract the 5-8 most important themes or topics the user discussed
2. Identify 2-4 meaningful relationships between themes (problem/solution, cause/effect, related concepts)

Return ONLY valid JSON in this exact format:
{
  "keywords": [{"keyword": "decision fatigue", "count": 3}],
  "relationships": [{"from": "stress", "to": "grounding", "strength": 0.8}]
}

Keywords should be 2-4 word phrases. Count is how many times this theme appeared.

Conversation excerpts:
${allContent.slice(0, 3000)}`
                    }]
                  }],
                  generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 800
                  }
                })
              }
            );

            if (geminiResponse.ok) {
              const geminiData = await geminiResponse.json();
              const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
              
              const jsonMatch = responseText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                
                if (parsed.keywords && Array.isArray(parsed.keywords)) {
                  parsed.keywords.forEach((k: { keyword: string; count?: number }) => {
                    mergeTheme(k.keyword, 'coach', k.count || 1);
                  });
                }
                
                if (parsed.relationships && Array.isArray(parsed.relationships)) {
                  themeRelationships = parsed.relationships.map((r: { from: string; to: string; strength: number }) => ({
                    from: r.from.toLowerCase(),
                    to: r.to.toLowerCase(),
                    strength: r.strength
                  }));
                }
              }
            }
          } catch (aiError) {
            console.error('AI extraction error:', aiError);
          }
        }
      }
    }

    // 3. Fetch practice data from sanctuary_events
    const { data: practiceEvents } = await supabase
      .from('sanctuary_events')
      .select('category, tags')
      .eq('user_id', userId)
      .eq('event_type', 'completed')
      .gte('created_at', startDate.toISOString());

    practiceEvents?.forEach(p => {
      // Add category as theme
      if (p.category) {
        const category = p.category.toLowerCase();
        // Normalize to meaningful names
        if (category.includes('pause') || category.includes('regulate') || category.includes('calm')) {
          mergeTheme('calm & regulate', 'practice', 1);
        } else if (category.includes('flow') || category.includes('presence') || category.includes('focus')) {
          mergeTheme('focus & presence', 'practice', 1);
        } else if (category.includes('power') || category.includes('renewal') || category.includes('energy')) {
          mergeTheme('energy renewal', 'practice', 1);
        } else {
          mergeTheme(category, 'practice', 1);
        }
      }
      
      // Add tags as themes
      if (p.tags && Array.isArray(p.tags)) {
        p.tags.forEach((tag: string) => {
          const normalizedTag = tag.toLowerCase().replace(/-/g, ' ');
          mergeTheme(normalizedTag, 'practice', 1);
        });
      }
    });

    // 4. Fetch tiny wins and extract themes
    const { data: tinyWins } = await supabase
      .from('tiny_wins')
      .select('win_content')
      .eq('user_id', userId)
      .gte('win_date', startDateStr);

    if (tinyWins && tinyWins.length > 0) {
      // Extract simple keyword themes from wins
      const winKeywords = [
        'confidence', 'calm', 'focus', 'energy', 'clarity', 'connection',
        'productivity', 'balance', 'growth', 'resilience', 'mindfulness',
        'stress', 'anxiety', 'overwhelm', 'decision', 'communication',
        'leadership', 'patience', 'gratitude', 'momentum', 'breakthrough'
      ];
      
      tinyWins.forEach(w => {
        const content = w.win_content.toLowerCase();
        winKeywords.forEach(keyword => {
          if (content.includes(keyword)) {
            mergeTheme(keyword, 'wins', 1);
          }
        });
      });
    }

    // 5. Fetch check-in outcomes
    const { data: checkins } = await supabase
      .from('daily_checkins')
      .select('outcome, state_tags')
      .eq('user_id', userId)
      .gte('checkin_date', startDateStr);

    checkins?.forEach(c => {
      // Map outcomes to meaningful theme names
      if (c.outcome) {
        const outcomeThemes: Record<string, string> = {
          'focused': 'high focus',
          'steady': 'steady state',
          'scattered': 'mental scatter',
          'drained': 'energy drain',
          'overwhelmed': 'overwhelm'
        };
        const themeName = outcomeThemes[c.outcome] || c.outcome;
        mergeTheme(themeName, 'checkins', 1);
      }
      
      // Add state tags as themes
      if (c.state_tags && Array.isArray(c.state_tags)) {
        c.state_tags.forEach((tag: string) => {
          mergeTheme(tag, 'checkins', 1);
        });
      }
    });

    // Calculate unified themes with weights
    const maxCount = Math.max(...Array.from(themeMap.values()).map(v => v.count), 1);
    const unifiedThemes: UnifiedTheme[] = Array.from(themeMap.entries())
      .map(([theme, data]) => ({
        theme: theme.charAt(0).toUpperCase() + theme.slice(1), // Capitalize
        totalCount: data.count,
        weight: data.count / maxCount,
        sources: data.sources
      }))
      .sort((a, b) => b.totalCount - a.totalCount)
      .slice(0, 15); // Top 15 themes

    const response: SemanticAnalysisResponse = {
      themePatterns,
      unifiedThemes,
      themeRelationships
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

// Helper function to get bubble details from ALL sources
async function getBubbleDetails(
  supabase: any,
  userId: string,
  keyword: string,
  startDate: Date
): Promise<BubbleDetailsResponse> {
  const recentMentions: BubbleDetailsResponse['recentMentions'] = [];
  let totalCount = 0;
  const keywordLower = keyword.toLowerCase();

  // 1. Search coach dialogue messages
  const { data: sessions } = await supabase
    .from('dialogue_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('context_type', 'coach')
    .gte('created_at', startDate.toISOString());

  if (sessions && sessions.length > 0) {
    const sessionIds = sessions.map((s: { id: string }) => s.id);
    const { data: messages } = await supabase
      .from('dialogue_messages')
      .select('content, timestamp, session_id')
      .in('session_id', sessionIds)
      .eq('sender_type', 'user')
      .ilike('content', `%${keyword}%`)
      .order('timestamp', { ascending: false })
      .limit(3);

    if (messages) {
      totalCount += messages.length;
      messages.forEach((m: { content: string; timestamp: string; session_id: string }) => {
        recentMentions.push({
          snippet: m.content.slice(0, 100) + (m.content.length > 100 ? '...' : ''),
          date: new Date(m.timestamp).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric'
          }),
          source: 'coach',
          sessionId: m.session_id
        });
      });
    }
  }

  // 2. Search sanctuary events (practices)
  const { data: practiceEvents } = await supabase
    .from('sanctuary_events')
    .select('category, tags, created_at')
    .eq('user_id', userId)
    .eq('event_type', 'completed')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false });

  if (practiceEvents) {
    const matchingPractices = practiceEvents.filter((p: { category?: string; tags?: string[] }) => {
      const categoryMatch = p.category?.toLowerCase().includes(keywordLower);
      const tagMatch = p.tags?.some((t: string) => t.toLowerCase().includes(keywordLower));
      return categoryMatch || tagMatch;
    }).slice(0, 2);

    totalCount += matchingPractices.length;
    matchingPractices.forEach((p: { category: string; created_at: string }) => {
      recentMentions.push({
        snippet: `Completed ${p.category} practice`,
        date: new Date(p.created_at).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric'
        }),
        source: 'practice'
      });
    });
  }

  // 3. Search tiny wins
  const { data: tinyWins } = await supabase
    .from('tiny_wins')
    .select('win_content, win_date')
    .eq('user_id', userId)
    .gte('win_date', startDate.toISOString().split('T')[0])
    .ilike('win_content', `%${keyword}%`)
    .order('win_date', { ascending: false })
    .limit(2);

  if (tinyWins) {
    totalCount += tinyWins.length;
    tinyWins.forEach((w: { win_content: string; win_date: string }) => {
      recentMentions.push({
        snippet: w.win_content.slice(0, 100) + (w.win_content.length > 100 ? '...' : ''),
        date: new Date(w.win_date).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric'
        }),
        source: 'wins'
      });
    });
  }

  // 4. Search check-ins
  const { data: checkins } = await supabase
    .from('daily_checkins')
    .select('outcome, state_tags, checkin_date')
    .eq('user_id', userId)
    .gte('checkin_date', startDate.toISOString().split('T')[0])
    .order('checkin_date', { ascending: false });

  if (checkins) {
    const matchingCheckins = checkins.filter((c: { outcome?: string; state_tags?: string[] }) => {
      const outcomeMatch = c.outcome?.toLowerCase().includes(keywordLower);
      const tagMatch = c.state_tags?.some((t: string) => t.toLowerCase().includes(keywordLower));
      return outcomeMatch || tagMatch;
    }).slice(0, 2);

    totalCount += matchingCheckins.length;
    matchingCheckins.forEach((c: { outcome: string; checkin_date: string }) => {
      recentMentions.push({
        snippet: `Check-in: feeling ${c.outcome}`,
        date: new Date(c.checkin_date).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric'
        }),
        source: 'checkins'
      });
    });
  }

  // Sort mentions by date (most recent first)
  recentMentions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    keyword,
    totalCount,
    recentMentions: recentMentions.slice(0, 5) // Top 5 mentions
  };
}
