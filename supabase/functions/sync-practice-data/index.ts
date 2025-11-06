import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get user from auth
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      throw new Error('Not authenticated')
    }

    const { practiceData } = await req.json()

    console.log('Syncing practice data for user:', user.id, 'Data:', practiceData)

    // Map practice data to sanctuary_events format
    const events = practiceData.map((practice: any) => ({
      user_id: user.id,
      event_type: 'practice_completed',
      content_id: practice.contentId || practice.id || 'unknown',
      content_type: practice.contentType || 'unknown',
      category: practice.category || practice.outcome || 'pause',
      tags: practice.tags || [],
      effectiveness_rating: mapOutcomeToRating(practice.outcome),
      duration_seconds: (practice.duration || 10) * 60, // Convert minutes to seconds
      context_data: {
        outcome: practice.outcome,
        completedAt: practice.completedAt,
        ...practice
      },
      timestamp: practice.completedAt || new Date().toISOString()
    }))

    // Insert events into sanctuary_events table
    const { data, error } = await supabaseClient
      .from('sanctuary_events')
      .insert(events)
      .select()

    if (error) {
      console.error('Error inserting sanctuary events:', error)
      throw error
    }

    console.log('Successfully synced practice data:', data?.length, 'events')

    return new Response(
      JSON.stringify({ success: true, syncedCount: data?.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in sync-practice-data:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function mapOutcomeToRating(outcome: string): number {
  const ratingMap: Record<string, number> = {
    'power-up': 5,
    'ready': 5,
    'presence': 4,
    'calm': 3,
    'pause': 2
  }
  return ratingMap[outcome] || 3
}
