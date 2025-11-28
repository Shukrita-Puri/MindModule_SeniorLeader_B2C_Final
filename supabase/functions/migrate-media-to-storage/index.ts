import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FileMapping {
  localPath: string;
  storagePath: string;
  contentType: string;
}

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

    console.log('Starting media migration to Storage...');

    // Define all files to migrate
    const audioFiles: FileMapping[] = [
      { localPath: './public/soundscapes/basque-txalaparta.mp3', storagePath: 'audio/basque-txalaparta.mp3', contentType: 'audio/mpeg' },
      { localPath: './public/soundscapes/bhramari-pranayama.mp3', storagePath: 'audio/bhramari-pranayama.mp3', contentType: 'audio/mpeg' },
      { localPath: './public/soundscapes/box-breathing.mp3', storagePath: 'audio/box-breathing.mp3', contentType: 'audio/mpeg' },
      { localPath: './public/soundscapes/cathedral-choir-flow.mp3', storagePath: 'audio/cathedral-choir-flow.mp3', contentType: 'audio/mpeg' },
      { localPath: './public/soundscapes/didgeridoo-bowls.mp3', storagePath: 'audio/didgeridoo-bowls.mp3', contentType: 'audio/mpeg' },
      { localPath: './public/soundscapes/earth-resonance.mp3', storagePath: 'audio/earth-resonance.mp3', contentType: 'audio/mpeg' },
      { localPath: './public/soundscapes/energy-forge.mp3', storagePath: 'audio/energy-forge.mp3', contentType: 'audio/mpeg' },
      { localPath: './public/soundscapes/forest-bathing.mp3', storagePath: 'audio/forest-bathing.mp3', contentType: 'audio/mpeg' },
      { localPath: './public/soundscapes/harmonic-calm.mp3', storagePath: 'audio/harmonic-calm.mp3', contentType: 'audio/mpeg' },
      { localPath: './public/soundscapes/himalayan-monastery.wav', storagePath: 'audio/himalayan-monastery.wav', contentType: 'audio/wav' },
      { localPath: './public/soundscapes/ina-night-fields.mp3', storagePath: 'audio/ina-night-fields.mp3', contentType: 'audio/mpeg' },
      { localPath: './public/soundscapes/kapalabhati-pranayama.mp3', storagePath: 'audio/kapalabhati-pranayama.mp3', contentType: 'audio/mpeg' },
      { localPath: './public/soundscapes/monastic-resonance.mp3', storagePath: 'audio/monastic-resonance.mp3', contentType: 'audio/mpeg' },
      { localPath: './public/soundscapes/tibetan-bowls.mp3', storagePath: 'audio/tibetan-bowls.mp3', contentType: 'audio/mpeg' },
      { localPath: './public/soundscapes/trataka-single-focus.mp3', storagePath: 'audio/trataka-single-focus.mp3', contentType: 'audio/mpeg' },
      { localPath: './public/soundscapes/vagus-wind-down.mp3', storagePath: 'audio/vagus-wind-down.mp3', contentType: 'audio/mpeg' },
      { localPath: './public/soundscapes/warrior-drums.mp3', storagePath: 'audio/warrior-drums.mp3', contentType: 'audio/mpeg' },
    ];

    const imageFiles: FileMapping[] = [
      { localPath: './public/lovable-uploads/basque-txalaparta-hero.jpg', storagePath: 'images/basque-txalaparta-hero.jpg', contentType: 'image/jpeg' },
      { localPath: './public/lovable-uploads/monastic-resonance-hero.jpg', storagePath: 'images/monastic-resonance-hero.jpg', contentType: 'image/jpeg' },
      { localPath: './public/lovable-uploads/warrior-drums-hero.jpg', storagePath: 'images/warrior-drums-hero.jpg', contentType: 'image/jpeg' },
    ];

    const allFiles = [...audioFiles, ...imageFiles];

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const file of allFiles) {
      try {
        // Read file from local filesystem
        const fileData = await Deno.readFile(file.localPath);

        // Upload to Storage
        const { error: uploadError } = await supabaseClient
          .storage
          .from('content-assets')
          .upload(file.storagePath, fileData, {
            contentType: file.contentType,
            upsert: true,
          });

        if (uploadError) {
          console.error(`Error uploading ${file.storagePath}:`, uploadError);
          errors.push(`${file.storagePath}: ${uploadError.message}`);
          errorCount++;
        } else {
          console.log(`✓ Uploaded: ${file.storagePath}`);
          successCount++;
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`Error processing ${file.localPath}:`, err);
        errors.push(`${file.localPath}: ${errorMessage}`);
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Migration complete. ${successCount} files uploaded, ${errorCount} errors.`,
        successCount,
        errorCount,
        total: allFiles.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error migrating media:', error);
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
