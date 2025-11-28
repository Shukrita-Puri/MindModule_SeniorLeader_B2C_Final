import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    console.log('Starting sanctuary content seeding...');

    // Import all content data
    const contentData = await import('../../../src/data/practicesAndSoundscapes.ts');
    const allContent = contentData.sanctuaryContent;

    console.log(`Processing ${allContent.length} content items...`);

    let successCount = 0;
    let errorCount = 0;

    for (const item of allContent) {
      try {
        // Insert main content
        const { data: contentRecord, error: contentError } = await supabaseClient
          .from('sanctuary_content')
          .upsert({
            id: item.id,
            title: item.title,
            content_type: item.contentType,
            category: item.category,
            duration: item.duration,
            difficulty: item.difficulty || null,
            creator: item.creator || null,
            origin: item.origin || null,
            story_hook: item.storyHook || null,
            used_by: item.usedBy || null,
            sub_type: item.subType || null,
            voice: item.voice || null,
            language: item.language || 'en',
            thumbnail_url: item.thumbnail || null,
            audio_url: item.audioSrc || null,
            steps_count: item.steps || 0,
            tags: item.tags || [],
            is_active: true,
            display_order: allContent.indexOf(item),
          }, {
            onConflict: 'id'
          });

        if (contentError) {
          console.error(`Error inserting content ${item.id}:`, contentError);
          errorCount++;
          continue;
        }

        // Insert metadata if present
        const hasMetadata = item.introSummary || item.fullStory || item.technique || 
                           item.benefits || item.completionQuote || item.whatYouNeed || 
                           item.expectedOutcomes || item.essence || item.parallel || 
                           item.cue || item.realExamples || item.whyThisWorks || 
                           item.deliveryModality || item.structuredTags;

        if (hasMetadata) {
          const { error: metadataError } = await supabaseClient
            .from('sanctuary_content_metadata')
            .upsert({
              content_id: item.id,
              intro_summary: item.introSummary || null,
              full_story: item.fullStory || null,
              technique: item.technique || null,
              benefits: item.benefits || null,
              completion_quote: item.completionQuote || null,
              what_you_need: item.whatYouNeed || null,
              expected_outcomes: item.expectedOutcomes || null,
              essence: item.essence || null,
              parallel: item.parallel || null,
              cue: item.cue || null,
              real_examples: item.realExamples || null,
              why_this_works: item.whyThisWorks || null,
              delivery_modality: item.deliveryModality || null,
              structured_tags: item.structuredTags || null,
            }, {
              onConflict: 'content_id'
            });

          if (metadataError) {
            console.error(`Error inserting metadata for ${item.id}:`, metadataError);
          }
        }

        // Insert practice steps if present
        if (item.practiceSteps && item.practiceSteps.length > 0) {
          for (const step of item.practiceSteps) {
            const { error: stepError } = await supabaseClient
              .from('sanctuary_content_steps')
              .upsert({
                content_id: item.id,
                step_order: item.practiceSteps.indexOf(step) + 1,
                title: step.title,
                instruction: step.instruction,
                duration: step.duration || null,
                breathing_pattern: step.breathingPattern || null,
                wisdom_note: step.wisdomNote || null,
              });

            if (stepError) {
              console.error(`Error inserting step for ${item.id}:`, stepError);
            }
          }
        }

        // For micro-practices, convert instructions array to steps
        if (item.instructions && item.instructions.length > 0) {
          for (let i = 0; i < item.instructions.length; i++) {
            const { error: stepError } = await supabaseClient
              .from('sanctuary_content_steps')
              .upsert({
                content_id: item.id,
                step_order: i + 1,
                title: `Step ${i + 1}`,
                instruction: item.instructions[i],
              });

            if (stepError) {
              console.error(`Error inserting instruction step for ${item.id}:`, stepError);
            }
          }
        }

        successCount++;
        console.log(`✓ Seeded: ${item.id}`);
      } catch (err) {
        console.error(`Error processing ${item.id}:`, err);
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Seeded ${successCount} items successfully. ${errorCount} errors.`,
        successCount,
        errorCount,
        total: allContent.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error seeding content:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
