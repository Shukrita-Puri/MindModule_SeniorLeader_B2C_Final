/**
 * Shared Auth0 JWT Verification Module
 * 
 * Local JWT verification using jose library + Auth0 JWKS.
 * Eliminates per-function copy-paste and /userinfo rate limiting.
 * 
 * Usage in edge functions:
 *   import { verifyAuth0JWT } from "../_shared/auth.ts";
 *   const userId = await verifyAuth0JWT(req.headers.get('Authorization'));
 */

import { createRemoteJWKSet, jwtVerify } from "https://deno.land/x/jose@v5.2.0/index.ts";

// Cache JWKS for the lifetime of the function instance
let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!cachedJWKS) {
    const domain = Deno.env.get('VITE_AUTH0_DOMAIN');
    if (!domain) throw new Error('VITE_AUTH0_DOMAIN not configured');
    cachedJWKS = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
  }
  return cachedJWKS;
}

/**
 * Verify an Auth0 JWT from the Authorization header.
 * Returns the Auth0 user ID (sub claim).
 * Throws on invalid/missing token.
 */
export async function verifyAuth0JWT(authHeader: string | null): Promise<string> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.replace('Bearer ', '');
  const domain = Deno.env.get('VITE_AUTH0_DOMAIN');
  
  if (!domain) {
    throw new Error('VITE_AUTH0_DOMAIN not configured');
  }

  try {
    const audience = Deno.env.get('VITE_AUTH0_AUDIENCE');
    const verifyOptions: any = {
      issuer: `https://${domain}/`,
    };
    if (audience) {
      // Support both single audience and comma-separated list
      const audienceList = audience.split(',').map(a => a.trim()).filter(Boolean);
      verifyOptions.audience = audienceList.length === 1 ? audienceList[0] : audienceList;
    }
    const { payload } = await jwtVerify(token, getJWKS(), verifyOptions);

    const sub = payload.sub;
    if (!sub) {
      throw new Error('Token missing sub claim');
    }

    return sub;
  } catch (err) {
    // If local JWT verification fails (e.g. opaque token), fallback to /userinfo
    console.warn('[shared/auth] JWT verification failed, falling back to /userinfo:', err instanceof Error ? err.message : err);
    return await fallbackUserInfo(token, domain);
  }
}

/**
 * Fallback: call Auth0 /userinfo for opaque tokens.
 * Includes retry with exponential backoff for 429s.
 */
async function fallbackUserInfo(token: string, domain: string): Promise<string> {
  const maxRetries = 3;
  const baseDelay = 2000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(`https://${domain}/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const info = await response.json();
      if (!info.sub) throw new Error('No sub in userinfo response');
      return info.sub;
    }

    if (response.status === 429 && attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`[shared/auth] /userinfo 429, retry ${attempt + 1} in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    throw new Error(`Auth verification failed: ${response.status}`);
  }

  throw new Error('Auth verification failed after retries');
}

/**
 * Helper: Extract userId from request with standard error responses.
 * Returns { userId, errorResponse } — if errorResponse is set, return it immediately.
 */
export async function authenticateRequest(
  req: Request,
  corsHeaders: Record<string, string>
): Promise<{ userId: string; errorResponse?: never } | { userId?: never; errorResponse: Response }> {
  try {
    const userId = await verifyAuth0JWT(req.headers.get('Authorization'));
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
