// Shared CORS helper for Lovable Edge Functions.
// Origin-allowlist with safe fallback to the production web origin so
// preflight never returns an empty Access-Control-Allow-Origin header.
export const allowedOrigins = [
  "https://mindmoduleme.lovable.app",
  "https://id-preview--aa2cf6b9-05e6-4ace-a37f-0acb08c8d30d.lovable.app",
  "https://app.mindmodule.me",
  "http://localhost:5173",
  "http://localhost:8080",
  // Capacitor iOS webview origins
  "capacitor://localhost",
  "ionic://localhost",
  "https://preview--mindmoduleme.lovable.app",
];

const ALLOWED_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-supabase-auth",
  "x-application-name",
  "x-supabase-client-platform",
  "x-supabase-client-platform-version",
  "x-supabase-client-runtime",
  "x-supabase-client-runtime-version",
  "x-outbox-item-id",
  "x-request-mode",
  "x-plan-caller",
  "x-client-path",
  "x-dev-user-id",
  "x-impersonation-token",
  "x-mm-client-platform",
].join(", ");

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
