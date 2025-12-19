import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Helper: base64 to Uint8Array
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// Helper: Uint8Array to base64
function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Encrypt JSON payload using AES-256-GCM
async function encryptJson(
  payload: unknown,
  keyB64: string
): Promise<{ ivB64: string; ctB64: string }> {
  const keyBytes = b64ToBytes(keyB64);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    plaintext
  );
  return {
    ivB64: bytesToB64(iv),
    ctB64: bytesToB64(new Uint8Array(ciphertext)),
  };
}

// Verify Auth0 token via /userinfo endpoint
async function verifyAuth0Token(authHeader: string | null): Promise<string> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  
  const token = authHeader.replace("Bearer ", "");
  const auth0Domain = Deno.env.get("AUTH0_DOMAIN");
  
  if (!auth0Domain) {
    throw new Error("AUTH0_DOMAIN not configured");
  }
  
  const response = await fetch(`https://${auth0Domain}/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Auth0 userinfo failed:", response.status, errorText);
    throw new Error("Invalid or expired token");
  }
  
  const userInfo = await response.json();
  if (!userInfo.sub) {
    throw new Error("Token verification failed - no sub claim");
  }
  
  return userInfo.sub;
}

// Write audit log entry
// deno-lint-ignore no-explicit-any
async function writeAuditLog(
  supabase: any,
  actor: string,
  action: string,
  tableName: string,
  recordId: string,
  metadata?: Record<string, unknown>
) {
  const { error } = await supabase.from("audit_logs").insert({
    actor,
    action,
    table_name: tableName,
    record_id: recordId,
    metadata: metadata || {},
  });
  
  if (error) {
    console.error("Failed to write audit log:", error);
    // Don't throw - audit log failure shouldn't break the main operation
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify Auth0 token
    const authHeader = req.headers.get("Authorization");
    const userId = await verifyAuth0Token(authHeader);
    console.log("Verified Auth0 user:", userId);

    // Parse request body
    const body = await req.json();
    const {
      achievementId,
      fullName,
      email,
      mailingAddress,
      city,
      country,
      postalCode,
    } = body;

    // Validate required fields
    if (!achievementId || !fullName || !email || !mailingAddress) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: achievementId, fullName, email, mailingAddress" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client with service role (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Encrypt address data
    const addressEncKey = Deno.env.get("ADDRESS_ENC_KEY_B64");
    if (!addressEncKey) {
      console.error("ADDRESS_ENC_KEY_B64 not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const addressPayload = {
      mailingAddress,
      city: city || null,
      country: country || null,
      postalCode: postalCode || null,
    };

    const { ivB64, ctB64 } = await encryptJson(addressPayload, addressEncKey);
    console.log("Address encrypted successfully");

    // Insert certificate request
    const { data: insertedRow, error: insertError } = await supabase
      .from("certificate_requests")
      .insert({
        user_id: userId,
        achievement_id: achievementId,
        full_name: fullName,
        email,
      // Plaintext no longer stored - only encrypted address in address_blob_enc
      mailing_address: null,
      city: null,
      country: null,
      postal_code: null,
        // Encrypted fields
        address_blob_enc: ctB64,
        address_iv: ivB64,
        address_enc_v: 1,
      })
      .select("id, achievement_id, request_status, requested_at")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Write audit log
    await writeAuditLog(
      supabase,
      userId,
      "CERT_REQUEST_CREATE",
      "certificate_requests",
      insertedRow.id,
      { achievementId, email }
    );

    console.log("Certificate request created:", insertedRow.id);

    return new Response(
      JSON.stringify({
        success: true,
        data: insertedRow,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error in certificate-request-create:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
