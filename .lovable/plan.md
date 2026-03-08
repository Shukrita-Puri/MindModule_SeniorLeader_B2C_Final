

## Recalibrate Studio — Full End-to-End Audit

---

### CRITICAL BUG 1: `event_type` Mismatch — Production Completions Are Invisible

**Severity: CRITICAL — All production completion tracking is broken**

The client sends `eventType: 'session_complete'` to the `track-sanctuary-event` edge function. The edge function stores it verbatim as `session_complete` (line 47: `event_type: eventData.eventType`).

However, **every single read query** filters by `event_type = 'completed'`:
- `PauseOutcomePage.tsx` line 66
- `PowerUpOutcomePage.tsx` line 46
- `PresenceOutcomePage.tsx` line 51
- `Insights.tsx` line 245
- `PracticeEffectiveness.tsx` line 47
- `CauseEffectInsights.tsx` line 75
- `coachContextBuilder.ts` line 318

The DEV_MODE path in `sanctuaryEventTracking.ts` (line 66) correctly maps `session_complete` → `completed`, but the edge function does NOT do this mapping.

**Result**: In production, completions are stored as `session_complete` but never read. Completion counts on outcome pages always show 0. Insights page shows no practice data. Coach context has no practice history.

**Fix**: Update `track-sanctuary-event/index.ts` line 47 to map the event type:
```typescript
event_type: eventData.eventType === 'session_complete' ? 'completed' : eventData.eventType,
```

Also need a data migration to fix existing records:
```sql
UPDATE sanctuary_events SET event_type = 'completed' WHERE event_type = 'session_complete';
```

---

### CRITICAL BUG 2: Auth Pattern Mismatch in `track-sanctuary-event`

The edge function uses `SUPABASE_ANON_KEY` with `supabaseClient.auth.getUser()` (Supabase Auth). But this project uses **Auth0** for authentication. The `supabase.functions.invoke()` call from the client sends the Supabase anon key header, not an Auth0 JWT.

Since `sanctuary_events` has RLS requiring `service_role`, and the edge function creates a client with the anon key, the insert will **fail silently** for users authenticated via Auth0 (which is all production users).

**Fix**: Refactor `track-sanctuary-event` to use `authenticateRequest()` from `_shared/auth.ts` (the Auth0 JWKS pattern used by all other edge functions) and the service role key for DB operations.

---

### CRITICAL BUG 3: Outcome Pages Query Directly via Client RLS

All three outcome pages (`PauseOutcomePage`, `PowerUpOutcomePage`, `PresenceOutcomePage`) call:
```typescript
const { data: { user } } = await supabase.auth.getUser();
// then query sanctuary_events directly
```

The `sanctuary_events` table has no client-facing RLS SELECT policy — only `service_role` access. This means these queries return empty results for all Auth0 users. The completion counts ("Used 3x") will always show 0.

**Fix**: Route these queries through an edge function (e.g., add a `GET_COMPLETION_COUNTS` action to `user-events`) that uses Auth0 token verification and service role key.

---

### BUG 4: `QuickResetSession` Page Is a Dead End

The "Begin session" buttons on `QuickResetSession.tsx` (line 151-154) only call `console.log()`. No audio plays, no navigation occurs, no tracking happens. The content is hardcoded and doesn't connect to any actual audio files or the `practicesAndSoundscapes` data source.

This page is also **not registered in the router** — `App.tsx` only has `power-up`, `pause`, and `presence` as child routes of `/recalibrate`. The `QuickResetSession` component exists but is unreachable.

**Fix**: Either remove the dead component or wire it up properly.

---

### BUG 5: Duplicate `practice_sessions` + `sanctuary_events` Writes

All three player pages (SoundscapePlayer, GuidedPracticePlayer, MicroPracticePlayerCards) write to BOTH `practice_sessions` AND `sanctuary_events` on completion. This creates duplicate tracking with slightly different schemas and no clear single source of truth.

- `practice_sessions` uses `supabase.auth.getUser()` (Supabase auth — same Auth0 issue)
- `sanctuary_events` goes through the edge function (which also has the auth bug)

**Recommendation**: Consolidate to a single edge function call that writes to both tables using the service role key, authenticated via Auth0.

---

### Favorites — Working Correctly

The `useFavorites` hook correctly uses Auth0 tokens via `getToken()` and calls the `user-favorites` edge function. Favorites toggle, read, and write operations all route through authenticated edge functions. No issues found.

---

### Downstream: Insights Page

The Insights page queries `sanctuary_events` for practice data. Due to Bug 1 (event_type mismatch) and Bug 3 (RLS blocking), the Insights page will show **zero practice sessions** for all production users.

---

### Downstream: Coach Context

`coachContextBuilder.ts` queries `sanctuary_events` and `practice_sessions` directly via client. Same RLS issue — coach will have no visibility into user's practice history.

---

### Asset Organization — Current State & Recommended Subfolder Strategy

**Current structure** (flat):
```
src/assets/          ← 70+ files: ALL thumbnails (jpg/png) in one folder
public/soundscapes/  ← 17 audio files (mp3/wav) in one folder
public/all-visuals/  ← Duplicate structure + videos
  soundscapes/       ← Duplicate of public/soundscapes (17 files)
  videos/            ← 15 check-in background videos
  lovable-uploads/   ← 1 file
public/lovable-uploads/ ← 4 files
```

**Issues**:
1. `public/all-visuals/soundscapes/` is an exact duplicate of `public/soundscapes/` (17 identical audio files)
2. `src/assets/` has 70+ files with no organization — thumbnails for pause, presence, power-up, dialogue, onboarding all mixed together
3. Two separate `lovable-uploads` directories

**Recommended subfolder strategy**:

```text
src/assets/
  recalibrate/
    pause/           ← pause thumbnails (architectural-pause, forest-bathing, etc.)
    presence/        ← presence thumbnails (monastic-resonance, bhramari, etc.)
    power-up/        ← power-up thumbnails (phoenix-resilience, box-breathing, etc.)
  dialogue/          ← dialogue scenario images
  onboarding/        ← onboarding visuals
  brand/             ← logos (mm-logo-*.png, kairos-logo)
  shared/            ← coach visuals, referral images

public/
  audio/
    soundscapes/     ← all soundscape MP3s
    guided/          ← guided practice audio (if added later)
  video/
    check-in/        ← the 15 state-based background videos
  uploads/           ← consolidated lovable-uploads
```

Remove `public/all-visuals/` entirely (it's a duplicate tree). Update imports in `practicesAndSoundscapes.ts` accordingly.

---

### Summary of Fixes Required

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | CRITICAL | `event_type` stored as `session_complete`, queried as `completed` | Map in edge function + backfill data |
| 2 | CRITICAL | `track-sanctuary-event` uses Supabase Auth, not Auth0 | Refactor to Auth0 JWKS pattern |
| 3 | CRITICAL | Outcome pages query `sanctuary_events` directly (RLS blocks Auth0 users) | Route through edge function |
| 4 | Medium | `QuickResetSession` buttons do nothing, page unreachable | Remove or wire up |
| 5 | Medium | Dual writes to `practice_sessions` + `sanctuary_events` | Consolidate to single edge function |
| 6 | Low | Flat asset folder, duplicate audio directory | Reorganize into subfolders |

### Implementation Order

1. Fix Bug 1 (event_type mapping) — quick edge function edit + data backfill
2. Fix Bug 2 (Auth0 pattern in track-sanctuary-event) — refactor edge function
3. Fix Bug 3 (outcome page queries) — add edge function action, update 3 pages
4. Clean up QuickResetSession
5. Asset reorganization (lower priority, larger refactor)

