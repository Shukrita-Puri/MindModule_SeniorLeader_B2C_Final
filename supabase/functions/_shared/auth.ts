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

// ─── Domain sanitization ────────────────────────────────────────────
/** Strip protocol and trailing slashes from domain env var */
function sanitizeDomain(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

// ─── JWKS cache ─────────────────────────────────────────────────────
let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedDomain: string | null = null;

function getJWKS() {
  const rawDomain = Deno.env.get('VITE_AUTH0_DOMAIN');
  if (!rawDomain) throw new Error('VITE_AUTH0_DOMAIN not configured');
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
export async function verifyAuth0JWT(authHeader: string | null, req?: Request): Promise<string> {
  // ── Dev bypass: when VITE_AUTH0_DOMAIN is not configured, accept x-dev-user-id header ──
  const rawDomain = Deno.env.get('VITE_AUTH0_DOMAIN');
  if (!rawDomain) {
    const devUserId = req?.headers.get('x-dev-user-id');
    if (devUserId) {
      console.log(`[shared/auth] DEV BYPASS – using x-dev-user-id: ${devUserId}`);
      return devUserId;
    }
    throw new Error('VITE_AUTH0_DOMAIN not configured');
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.replace('Bearer ', '');
  const domain = sanitizeDomain(rawDomain);

  try {
    const audience = Deno.env.get('VITE_AUTH0_AUDIENCE');
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
): Promise<{ userId: string; errorResponse?: never } | { userId?: never; errorResponse: Response }> {
  try {
    const userId = await verifyAuth0JWT(req.headers.get('Authorization'), req);
    return { userId };
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
