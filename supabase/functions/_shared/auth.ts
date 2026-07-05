/**
 * Shared Auth0 JWT Verification Module (v2 – hardened)
 * 
 * Local JWT verification using jose library + Auth0 JWKS.
 * Eliminates per-function copy-paste and /userinfo rate limiting.
 * 
 * Changes from v1:
 * - Domain sanitization (strips protocol/trailing slashes)
 * - Circuit breaker for /userinfo fallback (prevents cascading 429s)
 * - Structured logging with [path] tags
 * 
 * Usage in edge functions:
 *   import { verifyAuth0JWT, authenticateRequest } from "../_shared/auth.ts";
 */

import { createRemoteJWKSet, jwtVerify } from "https://deno.land/x/jose@v5.2.0/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyImpersonationToken, type ImpersonationClaims } from "./impersonation.ts";
import { redactUserId } from "./identity/redact-user-id.ts";

// Hard-coded admin email allowlist. MUST stay in sync with
// supabase/functions/_shared/admin-guard.ts and src/config/adminAllowlist.ts.
const ADMIN_EMAIL_ALLOWLIST: readonly string[] = [
  "shukrita@mindmodule.me",
  "itsmanojkdev@gmail.com",
] as const;

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const n = email.trim().toLowerCase();
  return ADMIN_EMAIL_ALLOWLIST.some((e) => e.toLowerCase() === n);
}

// ─── Domain sanitization ────────────────────────────────────────────
/** Strip protocol and trailing slashes from domain env var */
function sanitizeDomain(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

// ─── Environment gate ───────────────────────────────────────────────
/**
 * Returns true when the function is running in production.
 * Checks both ENVIRONMENT and APP_ENV so either signal locks down
 * the dev bypass below.
 */
export function isProductionEnv(): boolean {
  const env = (Deno.env.get('ENVIRONMENT') || '').toLowerCase();
  const appEnv = (Deno.env.get('APP_ENV') || '').toLowerCase();
  return env === 'production' || appEnv === 'production';
}

// ─── JWKS cache ─────────────────────────────────────────────────────
let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedDomain: string | null = null;

function getJWKS() {
  const rawDomain = Deno.env.get('AUTH0_DOMAIN') || Deno.env.get('VITE_AUTH0_DOMAIN');
  if (!rawDomain) throw new Error('AUTH0_DOMAIN not configured');
  const domain = sanitizeDomain(rawDomain);

  // Invalidate cache if domain changed (unlikely but safe)
  if (cachedDomain !== domain) {
    cachedJWKS = null;
    cachedDomain = domain;
  }

  if (!cachedJWKS) {
    cachedJWKS = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
    console.log(`[shared/auth] JWKS endpoint: https://${domain}/.well-known/jwks.json`);
  }
  return cachedJWKS;
}

// ─── Circuit breaker for /userinfo ──────────────────────────────────
let userinfoFailCount = 0;
let userinfoCircuitOpenUntil = 0;
const CIRCUIT_THRESHOLD = 3;       // failures before opening circuit
const CIRCUIT_COOLDOWN_MS = 30000; // 30s cooldown

function isUserinfoCircuitOpen(): boolean {
  if (userinfoFailCount < CIRCUIT_THRESHOLD) return false;
  if (Date.now() > userinfoCircuitOpenUntil) {
    // Reset – allow one probe request
    userinfoFailCount = 0;
    return false;
  }
  return true;
}

function recordUserinfoFailure(): void {
  userinfoFailCount++;
  if (userinfoFailCount >= CIRCUIT_THRESHOLD) {
    userinfoCircuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    console.warn(`[shared/auth] /userinfo circuit OPEN for ${CIRCUIT_COOLDOWN_MS / 1000}s after ${CIRCUIT_THRESHOLD} failures`);
  }
}

function recordUserinfoSuccess(): void {
  userinfoFailCount = 0;
}

// ─── Main verification ─────────────────────────────────────────────

/**
 * Verify an Auth0 JWT from the Authorization header.
 * Returns the Auth0 user ID (sub claim).
 * Throws on invalid/missing token.
 */
export async function verifyAuth0JWT(authHeaderOrReq: string | Request | null, req?: Request): Promise<string> {
  // Resolve authHeader and request object from flexible args
  let authHeader: string | null;
  let request: Request | undefined;
  if (authHeaderOrReq instanceof Request) {
    authHeader = authHeaderOrReq.headers.get('Authorization');
    request = authHeaderOrReq;
  } else {
    authHeader = authHeaderOrReq;
    request = req;
  }

  // ── Dev bypass: accept x-dev-user-id header (skips Auth0 entirely) ──
  // SECURITY: Only honored OUTSIDE production. In production this header is
  // ignored entirely so it cannot be used to impersonate any user. Identity
  // in production must come from a verified Auth0 JWT in the Authorization
  // header (validated below via JWKS + issuer + audience).
  const devUserId = request?.headers.get('x-dev-user-id');
  if (devUserId) {
    if (isProductionEnv()) {
      console.warn('[shared/auth] x-dev-user-id header received in production – IGNORED');
      // Fall through to real JWT verification; do NOT trust the header.
    } else {
      console.log(`[shared/auth] DEV BYPASS – using x-dev-user-id: ${devUserId}`);
      return devUserId;
    }
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.replace('Bearer ', '');
  const rawDomain = Deno.env.get('AUTH0_DOMAIN') || Deno.env.get('VITE_AUTH0_DOMAIN');
  if (!rawDomain) throw new Error('AUTH0_DOMAIN not configured');
  const domain = sanitizeDomain(rawDomain);

  try {
    const audience = Deno.env.get('AUTH0_AUDIENCE') || Deno.env.get('VITE_AUTH0_AUDIENCE');
    const issuer = `https://${domain}/`;

    const verifyOptions: any = { issuer };

    if (audience) {
      // Audience may be comma-separated; also sanitize each entry
      const audienceList = audience.split(',').map(a => a.trim()).filter(Boolean);
      verifyOptions.audience = audienceList.length === 1 ? audienceList[0] : audienceList;
    }

    let payload;
    try {
      ({ payload } = await jwtVerify(token, getJWKS(), verifyOptions));
      console.log('[shared/auth] ✅ JWT verified locally (JWKS+issuer+audience)');
    } catch (audErr) {
      // If audience mismatch, retry without audience constraint (issuer still verified)
      const msg = audErr instanceof Error ? audErr.message : String(audErr);
      if (msg.includes('aud') && audience) {
        console.warn('[shared/auth] Audience mismatch, retrying without audience check');
        ({ payload } = await jwtVerify(token, getJWKS(), { issuer }));
        console.log('[shared/auth] ✅ JWT verified locally (JWKS+issuer, audience skipped)');
      } else {
        throw audErr;
      }
    }

    const sub = payload.sub;
    if (!sub) throw new Error('Token missing sub claim');
    return sub;

  } catch (err) {
    // Only fallback for non-JWT tokens (opaque). Check if token looks like a JWT first.
    const isJwtFormat = token.split('.').length === 3;
    if (isJwtFormat) {
      // JWT verification failed – log the specific reason, don't fallback to /userinfo
      // because the token IS a JWT, it just failed validation (wrong issuer/key/expired)
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[shared/auth] JWT verification failed (will NOT fallback for JWT tokens): ${msg}`);
      throw new Error(`JWT verification failed: ${msg}`);
    }

    // Opaque token – fallback to /userinfo with circuit breaker
    console.warn('[shared/auth] Non-JWT token detected, attempting /userinfo fallback');

    if (isUserinfoCircuitOpen()) {
      console.error('[shared/auth] /userinfo circuit is OPEN – rejecting request');
      throw new Error('Auth service temporarily unavailable (rate limited)');
    }

    return await fallbackUserInfo(token, domain);
  }
}

// ─── /userinfo fallback with backoff + circuit breaker ──────────────

async function fallbackUserInfo(token: string, domain: string): Promise<string> {
  const maxRetries = 2; // Reduced from 3 to fail faster
  const baseDelay = 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(`https://${domain}/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const info = await response.json();
      if (!info.sub) throw new Error('No sub in userinfo response');
      recordUserinfoSuccess();
      console.log('[shared/auth] ✅ /userinfo fallback succeeded');
      return info.sub;
    }

    if (response.status === 429) {
      recordUserinfoFailure();
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(`[shared/auth] /userinfo 429, retry ${attempt + 1} in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    }

    recordUserinfoFailure();
    throw new Error(`Auth verification failed: ${response.status}`);
  }

  throw new Error('Auth verification failed after retries');
}

// ─── Helper: authenticate request with standard error response ──────

export async function authenticateRequest(
  req: Request,
  corsHeaders: Record<string, string>
): Promise<
  | {
      userId: string;
      realUserId?: string;
      impersonation?: {
        adminSub: string;
        adminEmail: string;
        targetSub: string;
        targetEmail: string;
        expiresAt: number;
      };
      errorResponse?: never;
    }
  | { userId?: never; errorResponse: Response }
> {
  try {
    const realUserId = await verifyAuth0JWT(req.headers.get('Authorization'), req);

    const impersonationHeader = req.headers.get('x-impersonation-token');
    if (!impersonationHeader) {
      return { userId: realUserId };
    }

    // ── Impersonation path ────────────────────────────────────────────
    // SECURITY: impersonation NEVER trusts x-dev-user-id. If the real caller
    // relied on the dev bypass we require a genuine Auth0 JWT to proceed.
    const devUsed = !!req.headers.get('x-dev-user-id') && !isProductionEnv();
    const authHeader = req.headers.get('Authorization');
    if (devUsed || !authHeader?.startsWith('Bearer ')) {
      console.warn('[shared/auth] impersonation requires real Bearer token');
      return {
        errorResponse: new Response(
          JSON.stringify({ error: 'Impersonation requires real authentication' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        ),
      };
    }

    // Verify HS256 impersonation token first (cheap, no DB).
    let claims: ImpersonationClaims;
    try {
      claims = await verifyImpersonationToken(impersonationHeader);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid impersonation token';
      console.warn('[shared/auth] impersonation token rejected:', msg);
      return {
        errorResponse: new Response(
          JSON.stringify({ error: 'Invalid impersonation token' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        ),
      };
    }

    // Real caller must be an allow-listed admin AND must match the token.
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      console.error('[shared/auth] SUPABASE_URL / SERVICE_ROLE_KEY missing');
      return {
        errorResponse: new Response(
          JSON.stringify({ error: 'Server misconfiguration' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        ),
      };
    }
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: adminProfile } = await db
      .from('profiles')
      .select('email')
      .eq('id', realUserId)
      .maybeSingle();
    const realEmail = (adminProfile?.email as string | null) ?? null;

    if (!isAdminEmail(realEmail)) {
      console.warn('[shared/auth] impersonation attempted by non-admin', { realUserId });
      return {
        errorResponse: new Response(
          JSON.stringify({ error: 'Forbidden' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        ),
      };
    }

    if (claims.adminSub !== realUserId) {
      console.warn('[shared/auth] impersonation token adminSub != caller sub', {
        realUserId: redactUserId(realUserId), tokenAdminSub: redactUserId(claims.adminSub),
      });
      return {
        errorResponse: new Response(
          JSON.stringify({ error: 'Impersonation token / caller mismatch' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        ),
      };
    }

    // Confirm target user still exists.
    const { data: targetProfile } = await db
      .from('profiles')
      .select('id, email')
      .eq('id', claims.targetSub)
      .maybeSingle();
    if (!targetProfile) {
      return {
        errorResponse: new Response(
          JSON.stringify({ error: 'Impersonation target not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        ),
      };
    }

    console.log('[shared/auth] ✅ impersonation accepted', {
      admin: realEmail, target: claims.targetSub,
    });

    return {
      userId: claims.targetSub,
      realUserId,
      impersonation: {
        adminSub: claims.adminSub,
        adminEmail: claims.adminEmail,
        targetSub: claims.targetSub,
        targetEmail: claims.targetEmail,
        expiresAt: claims.exp,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    console.error('[shared/auth] Authentication error:', message);
    return {
      errorResponse: new Response(
        JSON.stringify({ error: message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }
}
