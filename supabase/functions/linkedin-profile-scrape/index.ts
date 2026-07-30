// LinkedIn scraping disabled for MVP. Proxycurl is shut down. NinjaPear integration pending.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-mm-client-platform",
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  // LinkedIn scraping is disabled for MVP.
  // Direct user input (PDF upload + paste) replaces scraping.
  return new Response(JSON.stringify({
    ok: false,
    status: 'disabled',
    message: 'LinkedIn scraping is disabled. Please use the paste or PDF upload option instead.',
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
