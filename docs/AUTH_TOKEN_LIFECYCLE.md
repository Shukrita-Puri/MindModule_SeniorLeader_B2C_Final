# Auth Token Lifecycle — Reference

## Environment Variables (must match frontend ↔ edge functions)

| Variable | Frontend (.env) | Edge Functions (Supabase Secrets) | Notes |
|---|---|---|---|
| `VITE_AUTH0_DOMAIN` | `auth.mindmodule.me` | Same value | Hostname only, no `https://` |
| `VITE_AUTH0_AUDIENCE` | `https://dev-knj26zrz4aopg3tg.us.auth0.com/api/v2/` | Same value | Must include `https://` |
| `VITE_AUTH0_CLIENT_ID` | `fOlef5xSQ6JWGKM2U2HGhZrEuaCN7fCk` | Same value | Public client ID |

## Token Type: JWT vs Opaque

Auth0 issues **RS256 JWTs** when an `audience` is specified in the authorize request. Without audience, tokens are opaque.

**How to verify**: Decode any access token at [jwt.io](https://jwt.io):
- JWT: Three dot-separated base64 segments, `iss` = `https://auth.mindmodule.me/`
- Opaque: Random string, no dots

Our config always sends `audience`, so tokens should always be JWTs.

## Token Flow

### Web (Auth0 SPA SDK)
1. Login → Auth0 returns access + refresh tokens → stored in localStorage
2. `getAuthToken()` returns cached token if TTL > 60s
3. On expiry → SDK silently refreshes via refresh token rotation
4. Fallback → iframe-based silent auth if refresh token missing

### Native iOS (Capacitor)
1. Manual PKCE flow → tokens stored in `native_auth_tokens` localStorage
2. `useAuth` hydrates session from stored tokens on reload
3. On expiry → `getAuthToken()` triggers SDK refresh (if SDK synced) or native token refresh via `/oauth/token`
4. If tokens fully expired with no refresh token → user redirected to login

### Edge Functions (Backend)
1. Receive `Authorization: Bearer <jwt>` header
2. Verify locally via JWKS (cached) + issuer + audience check
3. `/userinfo` fallback ONLY for opaque tokens (circuit breaker: 3 failures → 30s cooldown)
4. Return `sub` claim as user ID

## Troubleshooting

### "Auth verification failed: 429"
- **Cause**: Edge functions were falling back to `/userinfo` for every request (JWT verification failing due to issuer mismatch)
- **Fix**: Domain sanitization in `_shared/auth.ts` now strips protocol prefixes
- **Verify**: Edge function logs should show `✅ JWT verified locally` instead of `/userinfo` fallback

### Clear stale cache and re-login
1. Open browser DevTools → Application → Local Storage
2. Delete keys starting with `@@auth0spajs@@`
3. Delete `native_auth_tokens` and `native_auth_completed` (if native)
4. Hard refresh the page

### Validate success in logs
- Frontend: `[authTokenService] ✅ Token acquired (TTL: Xs, path: refresh)`
- Edge function: `[shared/auth] ✅ JWT verified locally (JWKS+issuer+audience)`
- No more: `[shared/auth] JWT verification failed, falling back to /userinfo`

## Files

| File | Purpose |
|---|---|
| `src/services/authTokenService.ts` | Centralized token retrieval with dedup + expiry cache |
| `src/hooks/useAuth.tsx` | Auth context, profile sync, native hydration |
| `src/utils/nativeAuth.ts` | Native iOS PKCE flow + token storage |
| `src/main.tsx` | Auth0Provider configuration |
| `supabase/functions/_shared/auth.ts` | Edge function JWT verification |
