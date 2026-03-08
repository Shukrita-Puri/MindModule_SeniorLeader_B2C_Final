

## Permanent Fix for Mid-Session User Switch Bug

### Root Cause
When a user logs out, only client-side state is cleared. The Auth0 session cookie at `auth.mindmodule.me` persists. On next login, Auth0's silent refresh can return tokens for the previous account, causing the email/profile to switch mid-session.

### Plan — 3 Changes

**1. Federated Logout (Tier 1 — Critical)**

**File: `src/hooks/useAuth.tsx`** — `signOut` function (lines 393-427)

- **Web logout** (line 422): Add `federated: true` to `logoutParams` to clear the Auth0 session cookie and upstream IdP session
- **Native iOS logout** (line 413): After `logout({ openUrl: false })`, manually open the Auth0 `/v2/logout` endpoint via `@capacitor/browser` to clear the server-side session cookie without a visible redirect. This is necessary because `openUrl: false` only clears the local SDK cache.

**2. Client-Side Token Validation (Tier 4 — Defensive)**

**File: `src/hooks/useAuth.tsx`** — `syncProfile` effect (lines 239-344)

- Before calling `sync-profile`, decode the access token's `sub` claim and compare it to `auth0User.sub`
- If mismatch detected: log error, force federated logout, show toast, and abort sync
- This catches the case where Auth0 SDK returns a token for the wrong user

**3. Server-Side Token-UserInfo Cross-Check (Tier 3 — Safety Net)**

**File: `supabase/functions/sync-profile/index.ts`**

- After `verifyAuth0JWT` returns the `userId` (from JWT `sub`), and after fetching `/userinfo`, compare `userId` with `userinfo.sub`
- If they differ, return `403` with a clear error — prevents profile corruption even if client-side checks fail
- This check is essentially free since the function already calls `/userinfo`

### What We Skip
- **Tier 2 (disable silent auth)**: Too aggressive. Breaks session persistence and forces re-login frequently. The other 3 tiers provide sufficient protection.

### Summary of Impact
| Change | Prevents | Effort |
|--------|----------|--------|
| Federated logout | Stale Auth0 session cookies | Small |
| Client token validation | Sync with wrong identity | Small |
| Server cross-check | Profile corruption | Small |

