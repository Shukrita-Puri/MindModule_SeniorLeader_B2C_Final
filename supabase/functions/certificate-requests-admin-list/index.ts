import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Helper: base64 to Uint8Array
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// Decrypt JSON payload using AES-256-GCM
async function decryptJson(
  ivB64: string,
  ctB64: string,
  keyB64: string
): Promise<unknown> {
  const keyBytes = b64ToBytes(keyB64);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const iv = b64ToBytes(ivB64);
  const ciphertext = b64ToBytes(ctB64);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
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

// Check if user is an admin
function isAdmin(userSub: string): boolean {
  const adminsCsv = Deno.env.get("ADMIN_SUBS_CSV") || "";
  const adminSubs = adminsCsv.split(",").map(s => s.trim()).filter(Boolean);
  return adminSubs.includes(userSub);
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
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow GET
    if (req.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify Auth0 token
    const authHeader = req.headers.get("Authorization");
    const userId = await verifyAuth0Token(authHeader);
    console.log("Verified Auth0 user:", userId);

    // Check admin status
    if (!isAdmin(userId)) {
      console.warn("Non-admin user attempted to access admin list:", userId);
      return new Response(
        JSON.stringify({ error: "Forbidden - admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Admin access granted for:", userId);

    // Initialize Supabase client with service role (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all certificate requests (explicit columns, no select("*"))
    const { data: requests, error: fetchError } = await supabase
      .from("certificate_requests")
      .select("id, user_id, achievement_id, full_name, email, request_status, requested_at, processed_at, shipped_at, tracking_number, notes, address_blob_enc, address_iv, address_enc_v")
      .order("requested_at", { ascending: false });

    if (fetchError) {
      console.error("Fetch error:", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decrypt addresses if encrypted
    const addressEncKey = Deno.env.get("ADDRESS_ENC_KEY_B64");
    const decryptedRequests = await Promise.all(
      (requests || []).map(async (request: Record<string, unknown>) => {
        // Write audit log for each viewed request
        await writeAuditLog(
          supabase,
          userId,
          "CERT_REQUEST_VIEW",
          "certificate_requests",
          request.id as string,
          { viewedBy: userId }
        );

        // If encrypted address exists, decrypt it
        if (request.address_blob_enc && request.address_iv && addressEncKey) {
          try {
            const decryptedAddress = await decryptJson(
              request.address_iv as string,
              request.address_blob_enc as string,
              addressEncKey
            ) as {
              mailingAddress: string;
              city: string | null;
              country: string | null;
              postalCode: string | null;
            };

            // Log that we decrypted (but not the actual address)
            await writeAuditLog(
              supabase,
              userId,
              "CERT_ADDRESS_DECRYPT",
              "certificate_requests",
              request.id as string,
              { decryptedBy: userId }
            );

            return {
              ...request,
              // Override with decrypted values
              mailing_address: decryptedAddress.mailingAddress,
              city: decryptedAddress.city,
              country: decryptedAddress.country,
              postal_code: decryptedAddress.postalCode,
              // Remove encrypted fields from response
              address_blob_enc: undefined,
              address_iv: undefined,
            };
          } catch (decryptErr) {
            console.error("Failed to decrypt address for request:", request.id, decryptErr);
            // Fall back to plaintext fields if decryption fails
            return {
              ...request,
              address_blob_enc: undefined,
              address_iv: undefined,
            };
          }
        }

        // No encryption, return as-is (minus encrypted fields)
        return {
          ...request,
          address_blob_enc: undefined,
          address_iv: undefined,
        };
      })
    );

    console.log(`Returning ${decryptedRequests.length} certificate requests`);

    return new Response(
      JSON.stringify({
        success: true,
        data: decryptedRequests,
        count: decryptedRequests.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error in certificate-requests-admin-list:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
