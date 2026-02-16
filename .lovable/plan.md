

## Fix: Restore Coach Sessions and Add Retry Logic

### Problem
1. The `dialogue-session-manage` edge function returns 500 "Invalid or expired token" because it lacks the retry-with-backoff logic added to the other edge functions -- Auth0 rate-limits concurrent `/userinfo` calls.
2. The production coach session fetching was removed from `useRecentActivity` in a previous edit and needs to be restored.

### Changes

#### 1. `supabase/functions/dialogue-session-manage/index.ts`
Add retry logic (3 attempts, 300ms backoff) to the `verifyAuth0Token` function, matching the pattern already applied to `daily-checkins`, `compute-outer-readiness`, and `daily-rituals`.

```typescript
// Replace lines 22-37 with retry loop
for (let attempt = 0; attempt < 3; attempt++) {
  if (attempt > 0) await new Promise(r => setTimeout(r, 300 * attempt));
  const response = await fetch(`https://${auth0Domain}/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.ok) {
    const userInfo = await response.json();
    if (!userInfo.sub) throw new Error("Token verification failed - no sub claim");
    return userInfo.sub;
  }
  if (response.status === 429) {
    console.warn(`[dialogue-session-manage] Auth0 rate limited, attempt ${attempt + 1}/3`);
    continue;
  }
  const errorText = await response.text();
  console.error("Auth0 userinfo failed:", response.status, errorText);
  throw new Error("Invalid or expired token");
}
throw new Error("Auth0 rate limited after retries");
```

#### 2. `src/hooks/useRecentActivity.ts`
Restore the production (non-DEV_MODE) path that calls `dialogue-session-manage` with action `LIST_COACH_SESSIONS` via the edge function, using the Auth0 access token. This block will be added after the DEV_MODE block (after line 77), so coach sessions appear in Recent Activity for authenticated users.

```typescript
// Production: fetch coach sessions via edge function
if (!DEV_MODE) {
  try {
    const accessToken = await getAccessToken();
    if (accessToken) {
      const { data, error } = await supabase.functions.invoke('dialogue-session-manage', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { action: 'LIST_COACH_SESSIONS', limit: 5 },
      });
      if (!error && data?.success && data.sessions) {
        data.sessions.forEach((session: any) => {
          allActivities.push({
            id: session.id,
            type: 'coach',
            title: session.title?.length >= 50 ? `${session.title}...` : (session.title || 'Coach Conversation'),
            date: new Date(session.started_at || Date.now()),
            sessionId: session.id,
          });
        });
      }
    }
  } catch (err) {
    console.error('[useRecentActivity] Failed to fetch coach sessions:', err);
  }
}
```
