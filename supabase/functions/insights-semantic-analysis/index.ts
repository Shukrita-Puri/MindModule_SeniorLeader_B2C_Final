import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  themeRelationships: { from: string; to: string; strength: number; type: string }[];
  aiObservation: string;
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

interface NodeSummaryResponse {
  keyword: string;
  totalCount: number;
  sources: { coach: number; practice: number; wins: number; checkins: number };
  recentDate: string;
  aiSummary: string;
  connectedThemes: { theme: string; relationshipType: string }[];
}

// Hardcoded relationship type mappings
const RELATIONSHIP_TYPE_MAP: Record<string, string> = {
  'stress|grounding': 'grounded by',
  'overwhelm|calm': 'grounded by',
  'anxiety|calm': 'grounded by',
  'overwhelm|calm & regulate': 'grounded by',
  'stress|calm': 'feeds into',
  'decision fatigue|clarity': 'feeds into',
  'stress management|calm': 'feeds into',
  'energy drain|energy renewal': 'tension between',
  'scattered|focus': 'tension between',
  'mental scatter|focus & presence': 'tension between',
  'mental scatter|grounding': 'grounded by',
  'overwhelm|grounding': 'grounded by',
  'focus|clarity': 'often co-occur',
  'confidence|achievement': 'often co-occur',
  'balance|calm': 'often co-occur',
  'growth|progress': 'often co-occur',
  'energy|focus': 'feeds into',
  'stress management|emotional regulation': 'often co-occur',
  'steady|calm': 'often co-occur',
  'overwhelm|stress management': 'feeds into',
};

function getRelationshipType(from: string, to: string): string {
  const key1 = `${from.toLowerCase()}|${to.toLowerCase()}`;
  const key2 = `${to.toLowerCase()}|${from.toLowerCase()}`;
  return RELATIONSHIP_TYPE_MAP[key1] || RELATIONSHIP_TYPE_MAP[key2] || 'often co-occur';
}

// Generate algorithmic fallback observation from themes
function generateAlgorithmicObservation(themes: UnifiedTheme[]): string {
  if (themes.length === 0) return '';
  
  const top1 = themes[0];
  const top2 = themes.length > 1 ? themes[1] : null;
  
  const getTopSource = (sources: UnifiedTheme['sources']): string => {
    const entries = Object.entries(sources).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return 'your reflections';
    const map: Record<string, string> = { coach: 'coach conversations', practice: 'practices', wins: 'wins', checkins: 'check-ins' };
    return map[entries[0][0]] || 'your reflections';
  };

  if (top2) {
    return `Your inner world is currently shaped by ${top1.theme} and ${top2.theme}, surfacing most in your ${getTopSource(top1.sources)}. These recurring patterns suggest where your attention and energy are drawn right now.`;
  }
  return `${top1.theme} is the dominant theme in your inner world right now, appearing ${top1.totalCount} times across your ${getTopSource(top1.sources)}.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Handle bubble details request (legacy)
    if (action === 'getBubbleDetails' && keyword) {
      const details = await getBubbleDetails(supabase, userId, keyword, startDate);
      return new Response(
        JSON.stringify({ data: details }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle node summary request (V2)
    if (action === 'getNodeSummary' && keyword) {
      const summary = await getNodeSummary(supabase, userId, keyword, startDate, requestBody.relationships || []);
      return new Response(
        JSON.stringify({ data: summary }),
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

    // 1. Fetch theme patterns from daily_themes
    const { data: themes } = await supabase
      .from('daily_themes')
      .select('theme_phrase, theme_driver')
      .eq('user_id', userId)
      .gte('theme_date', startDateStr)
      .order('theme_date', { ascending: false });

    const themePatternMap = new Map<string, { count: number; driver: string }>();
    themes?.forEach(t => {
      const existing = themePatternMap.get(t.theme_phrase) || { count: 0, driver: t.theme_driver || 'state' };
      themePatternMap.set(t.theme_phrase, { count: existing.count + 1, driver: existing.driver });
    });
    const themePatterns = Array.from(themePatternMap.entries())
      .map(([phrase, data]) => ({ phrase, count: data.count, driver: data.driver }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // 2. Fetch coach dialogue messages and extract themes via Lovable AI Gateway
    const { data: sessions } = await supabase
      .from('dialogue_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('context_type', 'coach')
      .gte('created_at', startDate.toISOString());

    let themeRelationships: { from: string; to: string; strength: number; type: string }[] = [];
    
    if (sessions && sessions.length > 0) {
      const sessionIds = sessions.map(s => s.id);
      const { data: messages } = await supabase
        .from('dialogue_messages')
        .select('content')
        .in('session_id', sessionIds)
        .eq('sender_type', 'user');

      if (messages && messages.length > 0) {
        const allContent = messages.map(m => m.content).join('\n\n');
        
        const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
        if (lovableApiKey && allContent.length > 50) {
          try {
            const aiResponse = await fetch(
              'https://ai.gateway.lovable.dev/v1/chat/completions',
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${lovableApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'google/gemini-2.5-flash-lite',
                  messages: [{
                    role: 'user',
                    content: `Analyze these coaching conversation excerpts and:
1. Extract the 5-8 most important themes or topics the user discussed
2. Identify 2-4 meaningful relationships between themes with relationship types

Return ONLY valid JSON in this exact format:
{
  "keywords": [{"keyword": "decision fatigue", "count": 3}],
  "relationships": [{"from": "stress", "to": "grounding", "strength": 0.8, "type": "grounded by"}]
}

Keywords should be 2-4 word phrases. Count is how many times this theme appeared.
Relationship types must be one of: "often co-occur", "tension between", "feeds into", "grounded by"

Conversation excerpts:
${allContent.slice(0, 3000)}`
                  }],
                })
              }
            );

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              const responseText = aiData.choices?.[0]?.message?.content || '';
              
              const jsonMatch = responseText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                
                if (parsed.keywords && Array.isArray(parsed.keywords)) {
                  parsed.keywords.forEach((k: { keyword: string; count?: number }) => {
                    mergeTheme(k.keyword, 'coach', k.count || 1);
                  });
                }
                
                if (parsed.relationships && Array.isArray(parsed.relationships)) {
                  themeRelationships = parsed.relationships.map((r: { from: string; to: string; strength: number; type?: string }) => ({
                    from: r.from.toLowerCase(),
                    to: r.to.toLowerCase(),
                    strength: r.strength,
                    type: r.type || getRelationshipType(r.from, r.to)
                  }));
                }
              }
            } else if (aiResponse.status === 429 || aiResponse.status === 402) {
              console.warn('AI gateway rate limited or payment required, using algorithmic fallback');
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
      if (p.category) {
        const category = p.category.toLowerCase();
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
      if (p.tags && Array.isArray(p.tags)) {
        p.tags.forEach((tag: string) => {
          mergeTheme(tag.toLowerCase().replace(/-/g, ' '), 'practice', 1);
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
      if (c.outcome) {
        const outcomeThemes: Record<string, string> = {
          'focused': 'high focus', 'steady': 'steady state', 'scattered': 'mental scatter',
          'drained': 'energy drain', 'overwhelmed': 'overwhelm'
        };
        mergeTheme(outcomeThemes[c.outcome] || c.outcome, 'checkins', 1);
      }
      if (c.state_tags && Array.isArray(c.state_tags)) {
        c.state_tags.forEach((tag: string) => mergeTheme(tag, 'checkins', 1));
      }
    });

    // Calculate unified themes — cap at 8
    const maxCount = Math.max(...Array.from(themeMap.values()).map(v => v.count), 1);
    const unifiedThemes: UnifiedTheme[] = Array.from(themeMap.entries())
      .map(([theme, data]) => ({
        theme: theme.charAt(0).toUpperCase() + theme.slice(1),
        totalCount: data.count,
        weight: data.count / maxCount,
        sources: data.sources
      }))
      .sort((a, b) => b.totalCount - a.totalCount)
      .slice(0, 8);

    // Generate algorithmic relationships if AI didn't extract any — cap at 8
    if (themeRelationships.length === 0 && unifiedThemes.length >= 2) {
      const themesLower = unifiedThemes.map(t => t.theme.toLowerCase());
      const knownPairs: [string, string, number][] = [
        ['stress', 'grounding', 0.85], ['stress', 'calm', 0.8],
        ['overwhelm', 'calm & regulate', 0.9], ['overwhelm', 'grounding', 0.8],
        ['energy drain', 'energy renewal', 0.85], ['mental scatter', 'focus & presence', 0.9],
        ['mental scatter', 'grounding', 0.75], ['anxiety', 'calm', 0.85],
        ['decision fatigue', 'clarity', 0.8], ['high focus', 'confidence', 0.7],
        ['steady state', 'balance', 0.75], ['overwhelm', 'release', 0.8],
        ['drained', 'restore', 0.85], ['scattered', 'focus', 0.85]
      ];
      
      for (const [from, to, strength] of knownPairs) {
        const fromExists = themesLower.some(t => t.includes(from) || from.includes(t));
        const toExists = themesLower.some(t => t.includes(to) || to.includes(t));
        
        if (fromExists && toExists) {
          const fromTheme = unifiedThemes.find(t => t.theme.toLowerCase().includes(from) || from.includes(t.theme.toLowerCase()));
          const toTheme = unifiedThemes.find(t => t.theme.toLowerCase().includes(to) || to.includes(t.theme.toLowerCase()));
          
          if (fromTheme && toTheme && fromTheme.theme !== toTheme.theme) {
            themeRelationships.push({ 
              from: fromTheme.theme.toLowerCase(), 
              to: toTheme.theme.toLowerCase(), 
              strength,
              type: getRelationshipType(from, to)
            });
          }
        }
        if (themeRelationships.length >= 8) break;
      }
    }
    // Cap relationships at 8
    themeRelationships = themeRelationships.slice(0, 8);

    // ============================================
    // AI OBSERVATION via Lovable AI Gateway
    // ============================================
    let aiObservation = '';
    
    if (unifiedThemes.length >= 2) {
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      if (lovableApiKey) {
        try {
          const top5 = unifiedThemes.slice(0, 5).map(t => `${t.theme} (${t.totalCount} mentions)`).join(', ');
          const observationResponse = await fetch(
            'https://ai.gateway.lovable.dev/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${lovableApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'google/gemini-2.5-flash-lite',
                messages: [{
                  role: 'user',
                  content: `These are the five most recurring themes across this leader's check-ins, coaching sessions, and practices over the past 30 days: ${top5}. What do they collectively reveal about what is occupying this leader's inner world right now? Two sentences maximum. Speak directly to the leader. No generic language.`
                }],
              })
            }
          );

          if (observationResponse.ok) {
            const obsData = await observationResponse.json();
            aiObservation = obsData.choices?.[0]?.message?.content?.trim() || '';
          }
        } catch (obsError) {
          console.error('AI observation error:', obsError);
        }
      }
      
      // Algorithmic fallback
      if (!aiObservation) {
        aiObservation = generateAlgorithmicObservation(unifiedThemes);
      }
    }

    const response: SemanticAnalysisResponse = {
      themePatterns,
      unifiedThemes,
      themeRelationships,
      aiObservation,
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

// ============================================
// getNodeSummary — V2 Rich AI Summary
// ============================================
async function getNodeSummary(
  supabase: any,
  userId: string,
  keyword: string,
  startDate: Date,
  relationships: { from: string; to: string; strength: number; type?: string }[]
): Promise<NodeSummaryResponse> {
  // Reuse getBubbleDetails to gather source excerpts
  const details = await getBubbleDetails(supabase, userId, keyword, startDate);
  
  // Compute source counts from mentions
  const sources = { coach: 0, practice: 0, wins: 0, checkins: 0 };
  details.recentMentions.forEach(m => { sources[m.source]++; });
  
  // Find most recent date
  const recentDate = details.recentMentions.length > 0 
    ? details.recentMentions[0].date 
    : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Find connected themes from relationships
  const keywordLower = keyword.toLowerCase();
  const connectedThemes = relationships
    .filter(r => r.from.toLowerCase() === keywordLower || r.to.toLowerCase() === keywordLower)
    .map(r => ({
      theme: r.from.toLowerCase() === keywordLower
        ? r.to.charAt(0).toUpperCase() + r.to.slice(1)
        : r.from.charAt(0).toUpperCase() + r.from.slice(1),
      relationshipType: r.type || getRelationshipType(r.from, r.to)
    }))
    .slice(0, 3);

  // Build context for AI summary
  const excerpts = details.recentMentions.map(m => `[${m.source}] "${m.snippet}"`).join('\n');
  const sourceBreakdown = Object.entries(sources).filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${k}`).join(', ');
  const connectedList = connectedThemes.map(c => `${c.theme} (${c.relationshipType})`).join(', ');

  let aiSummary = '';
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  
  if (lovableApiKey && excerpts.length > 20) {
    try {
      const summaryResponse = await fetch(
        'https://ai.gateway.lovable.dev/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite',
            messages: [{
              role: 'user',
              content: `Based on the following data points about this leader, write a 3-5 sentence synthesis of what the theme "${keyword}" reveals about their inner world. Speak directly to the leader. Be specific to their data — not generic. Name the pattern, its context, and what it signals. No soft language.

Source breakdown: ${sourceBreakdown}
Connected themes: ${connectedList || 'none identified'}
Total mentions: ${details.totalCount}
Most recent: ${recentDate}

Recent excerpts:
${excerpts}`
            }],
          })
        }
      );

      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        aiSummary = summaryData.choices?.[0]?.message?.content?.trim() || '';
      }
    } catch (summaryError) {
      console.error('AI node summary error:', summaryError);
    }
  }

  // Algorithmic fallback
  if (!aiSummary) {
    const topSource = Object.entries(sources).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const topSourceName = topSource.length > 0 
      ? { coach: 'coach conversations', practice: 'practices', wins: 'wins', checkins: 'check-ins' }[topSource[0][0]] || 'your reflections'
      : 'your reflections';
    const connectedNote = connectedThemes.length > 0 
      ? ` It tends to surface alongside ${connectedThemes[0].theme}.` 
      : '';
    aiSummary = `${keyword} has appeared ${details.totalCount} times across your ${topSourceName}, most recently on ${recentDate}.${connectedNote}`;
  }

  return {
    keyword,
    totalCount: details.totalCount,
    sources,
    recentDate,
    aiSummary,
    connectedThemes
  };
}

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
          date: new Date(m.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          source: 'coach',
          sessionId: m.session_id
        });
      });
    }
  }

  // 2. Search sanctuary events
  const { data: practiceEvents } = await supabase
    .from('sanctuary_events')
    .select('category, tags, created_at')
    .eq('user_id', userId)
    .eq('event_type', 'completed')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false });

  if (practiceEvents) {
    const matchingPractices = practiceEvents.filter((p: { category?: string; tags?: string[] }) => {
      return p.category?.toLowerCase().includes(keywordLower) || p.tags?.some((t: string) => t.toLowerCase().includes(keywordLower));
    }).slice(0, 2);

    totalCount += matchingPractices.length;
    matchingPractices.forEach((p: { category: string; created_at: string }) => {
      recentMentions.push({
        snippet: `Completed ${p.category} practice`,
        date: new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
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
        date: new Date(w.win_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
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
      return c.outcome?.toLowerCase().includes(keywordLower) || c.state_tags?.some((t: string) => t.toLowerCase().includes(keywordLower));
    }).slice(0, 2);

    totalCount += matchingCheckins.length;
    matchingCheckins.forEach((c: { outcome: string; checkin_date: string }) => {
      recentMentions.push({
        snippet: `Check-in: feeling ${c.outcome}`,
        date: new Date(c.checkin_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        source: 'checkins'
      });
    });
  }

  recentMentions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    keyword,
    totalCount,
    recentMentions: recentMentions.slice(0, 5)
  };
}
