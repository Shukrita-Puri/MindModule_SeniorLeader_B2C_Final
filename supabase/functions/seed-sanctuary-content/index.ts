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

    // Import seed content data
    const { seedContent } = await import('./contentData.ts');
    const allContent = seedContent;

    console.log(`Processing ${allContent.length} content items...`);

    let successCount = 0;
    let errorCount = 0;

    for (const item of allContent) {
      try {
        // Use any to handle varying data structures
        const data: any = item;
        
        // Insert main content
        const { error: contentError } = await supabaseClient
          .from('sanctuary_content')
          .upsert({
            id: data.id,
            title: data.title,
            content_type: data.contentType,
            category: data.category,
            duration: data.duration,
            difficulty: data.difficulty ?? null,
            creator: data.creator ?? null,
            origin: data.origin ?? null,
            story_hook: data.storyHook ?? null,
            used_by: data.usedBy ?? null,
            sub_type: data.subType ?? null,
            voice: data.voice ?? null,
            language: data.language ?? 'en',
            thumbnail_url: data.thumbnail ?? null,
            audio_url: data.audioSrc ?? null,
            steps_count: data.steps ?? 0,
            tags: data.tags ?? [],
            is_active: true,
            display_order: allContent.indexOf(item),
          }, {
            onConflict: 'id'
          });

        if (contentError) {
          console.error(`Error inserting content ${data.id}:`, contentError);
          errorCount++;
          continue;
        }

        // Insert metadata if present
        const hasMetadata = data.introSummary || data.fullStory || data.technique || 
                           data.benefits || data.completionQuote || data.whatYouNeed || 
                           data.expectedOutcomes || data.essence || data.parallel || 
                           data.cue || data.realExamples || data.whyThisWorks || 
                           data.deliveryModality || data.structuredTags;

        if (hasMetadata) {
          const { error: metadataError } = await supabaseClient
            .from('sanctuary_content_metadata')
            .upsert({
              content_id: data.id,
              intro_summary: data.introSummary ?? null,
              full_story: data.fullStory ?? null,
              technique: data.technique ?? null,
              benefits: data.benefits ?? null,
              completion_quote: data.completionQuote ?? null,
              what_you_need: data.whatYouNeed ?? null,
              expected_outcomes: data.expectedOutcomes ?? null,
              essence: data.essence ?? null,
              parallel: data.parallel ?? null,
              cue: data.cue ?? null,
              real_examples: data.realExamples ?? null,
              why_this_works: data.whyThisWorks ?? null,
              delivery_modality: data.deliveryModality ?? null,
              structured_tags: data.structuredTags ?? null,
            }, {
              onConflict: 'content_id'
            });

          if (metadataError) {
            console.error(`Error inserting metadata for ${data.id}:`, metadataError);
          }
        }

        // Insert practice steps if present
        if (data.practiceSteps && data.practiceSteps.length > 0) {
          for (const step of data.practiceSteps) {
            const { error: stepError } = await supabaseClient
              .from('sanctuary_content_steps')
              .upsert({
                content_id: data.id,
                step_order: data.practiceSteps.indexOf(step) + 1,
                title: step.title,
                instruction: step.instruction,
                duration: step.duration || null,
                breathing_pattern: step.breathingPattern || null,
                wisdom_note: step.wisdomNote || null,
              });

            if (stepError) {
              console.error(`Error inserting step for ${data.id}:`, stepError);
            }
          }
        }

        // For micro-practices, convert instructions array to steps
        if (data.instructions && data.instructions.length > 0) {
          for (let i = 0; i < data.instructions.length; i++) {
            const { error: stepError } = await supabaseClient
              .from('sanctuary_content_steps')
              .upsert({
                content_id: data.id,
                step_order: i + 1,
                title: `Step ${i + 1}`,
                instruction: data.instructions[i],
              });

            if (stepError) {
              console.error(`Error inserting instruction step for ${data.id}:`, stepError);
            }
          }
        }

        successCount++;
        console.log(`✓ Seeded: ${data.id}`);
      } catch (err) {
        console.error(`Error processing ${(item as any).id}:`, err);
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
