## Inline Mindset Reflection Capture

Add an optional, auto-saving writing area to each **step card** of mindset protocols inside `MicroPracticePlayerCards`. Somatic protocols, soundscapes, guided practices, plan slot logic, brief logic, recommendation engine, smart nudges, and the evening Reflection Corner / tiny-win flow are untouched.

### 1. Database (new migration)

`public.practice_reflections`:
- `id uuid pk default gen_random_uuid()`
- `user_id text not null` (Auth0 sub)
- `practice_id text not null`
- `practice_type text not null default 'mindset'`
- `session_id uuid null` (links to `practice_sessions` once `handleComplete` returns it)
- `step_number int not null`
- `step_title text`, `prompt text` (snapshotted)
- `response text not null`
- `entry_context text` (`'plan' | 'standalone' | 'jit'`)
- `local_date date not null`
- `created_at`, `updated_at timestamptz default now()`
- Unique on `(user_id, practice_id, coalesce(session_id,'00000000-0000-0000-0000-000000000000'::uuid), step_number)` for per-step upsert
- Index on `(user_id, practice_id, local_date desc)`
- RLS **enabled, deny-by-default** (no policies). All access via service-role edge functions.
- `update_updated_at_column()` trigger reused.

### 2. Edge functions (new)

**`save-practice-reflection`** (POST)
- Auth via shared `authenticateRequest` (DEV_MODE header supported).
- Zod-validated body: `practiceId`, `stepNumber (int 1..20)`, `stepTitle`, `prompt`, `response (string ≤2000, trimmed)`, `entryContext`, `localDate (YYYY-MM-DD)`, optional `sessionId`, optional `tempSessionKey` (for pre-completion drafts).
- Upserts on conflict key. If `response` empty after trim → delete existing row instead.
- Returns `{ id, updated_at }`.

**`get-practice-reflections`** (GET)
- Query: `practiceId`, optional `sessionId`, optional `localDate` (default today user-local).
- Returns latest session's rows (or rows for the date) ordered by `step_number`.

Both functions: CORS, structured logging, service-role client. `verify_jwt = false` (in-code auth), no config.toml change needed unless default differs.

### 3. Frontend

**`src/hooks/useReflectionDraft.ts` (new)**
- Signature: `useReflectionDraft({ practiceId, isMindset, entryContext, sessionId, tempSessionKey, steps })` where `steps` is `[{ stepNumber, title, prompt }]`.
- On mount (mindset only): one `get-practice-reflections` call → seeds `Record<stepNumber, string>`.
- Exposes `getDraft(n)`, `setDraft(n, value)`, `flush(n?)`, `flushAll()`.
- Debounced save (1.2s) per step; immediate save on blur, on carousel `select` change, and on `handleComplete`.
- `localStorage` mirror keyed `reflection:{practiceId}:{tempSessionKey}:{stepNumber}` for offline; flushed when fetch succeeds.
- After `handleComplete` returns a real `session_id`, calls `flushAll({ sessionId })` so all rows attach to the session row.

**`src/pages/MicroPracticePlayerCards.tsx`**
- Import `getProtocolType` from `@/utils/protocolMatcher`; compute `isMindset = practice && getProtocolType(practice as any) === 'mindset'`.
- Derive `entryContext`: `fromIntervention → 'jit'`, else `fromRitual → 'plan'`, else `'standalone'`.
- Generate `tempSessionKey` (uuid via `crypto.randomUUID()`) once per mount; pass to hook.
- Build `steps` array from `cards.filter(c => c.type === 'step')`.
- Wire hook; pass `draft`, `setDraft`, `onBlurFlush` into `StepCardContent` for step cards (only when `isMindset`).
- In carousel `onSelect` effect: call `flush(previousStepNumber)`.
- In `handleComplete`: `await flushAll()` before `trackSanctuaryEvent`; after sanctuary returns `practiceSessionId`, call `flushAll({ sessionId })` to re-link.

**`StepCardContent`** gets new optional props `{ isMindset, draft, onDraftChange, onBlurFlush }`. When `isMindset`, render below the instruction (above the More toggle):

```tsx
<div className="w-full max-w-[300px] space-y-1.5">
  <Textarea
    value={draft ?? ''}
    onChange={(e) => onDraftChange?.(e.target.value)}
    onBlur={onBlurFlush}
    placeholder="Your response… (optional)"
    maxLength={2000}
    className="bg-white/5 border-white/15 text-white/90 placeholder:text-white/35 min-h-[88px] rounded-xl text-sm focus-visible:ring-saffron/40"
  />
  <p className="text-[11px] text-white/40 text-left">
    {draft?.length ? `Saved · ${draft.length} chars` : 'Optional reflection'}
  </p>
</div>
```

Empty input never blocks "Mark Complete".

### 4. Memory

Add `mem://features/mastery-plan/inline-mindset-reflection-capture.md` documenting:
- Mindset protocols only (`subType === 'mindset'` or stoic-reflection).
- Per-step rows in `practice_reflections`, upsert by `(user_id, practice_id, session_id, step_number)`.
- Reflection Corner / tiny_wins remain the evening summary; no overlap.
- Coach/Insights consumption is a follow-up, not part of this pass.

### Files touched

- New: `supabase/functions/save-practice-reflection/index.ts`
- New: `supabase/functions/get-practice-reflections/index.ts`
- New migration: `practice_reflections` table + RLS deny-by-default + indexes + updated_at trigger
- Edited: `src/pages/MicroPracticePlayerCards.tsx`
- New: `src/hooks/useReflectionDraft.ts`
- New: `mem://features/mastery-plan/inline-mindset-reflection-capture.md`

### Out of scope (confirmed)

Recommendation/sequencing, tiny-win storage, Insights surfacing, Coach prompt consumption, somatic/soundscape/guided practices.

### Open question — defaulting to your stated assumption

Storing **per-step rows** (not one JSON blob). Reply if you'd rather a single JSON blob per session; otherwise I'll proceed with rows.
