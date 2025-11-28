import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Import content data (simplified structure for seeding)
const contentData = [
  // Pause - Soundbaths
  {
    id: 'harmonic-calm',
    title: 'Harmonic Calm',
    content_type: 'soundbath',
    category: 'pause',
    duration: 8,
    difficulty: 'beginner',
    creator: 'Sanctuary Sound',
    origin: 'Inspired by Tibetan sound healing',
    story_hook: 'Ancient healing frequencies meet modern neuroscience',
    used_by: 'Elite athletes, CEOs',
    voice: 'none',
    thumbnail_url: '/lovable-uploads/harmonic-calm-singing-bowl.jpg',
    audio_url: '/soundscapes/harmonic-calm.mp3',
    tags: ['calming', 'stress-relief', 'meditation'],
    display_order: 10,
  },
  // Add more content items here...
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    console.log('Starting content seeding...');

    // Insert content
    for (const item of contentData) {
      const { error: contentError } = await supabaseClient
        .from('sanctuary_content')
        .upsert({
          ...item,
          steps_count: 0,
        });

      if (contentError) {
        console.error(`Error inserting ${item.id}:`, contentError);
        continue;
      }

      console.log(`Inserted: ${item.id}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Seeded ${contentData.length} content items` 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error seeding content:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
