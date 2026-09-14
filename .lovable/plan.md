# Remove the unused dialogue engine (closes the open AI endpoint)

## What this fixes

The `dialogue-engine` backend function accepts requests from anyone on the internet with no login check and forwards them to the paid Claude AI service. It belongs to a dialogue screen that is no longer reachable in the app, so instead of adding a login check, the whole thing gets removed. No paid AI calls, no open endpoint.

## Confirmed current state

- `dialogue-engine` has no authentication anywhere in its handler (only `serve(async (req) => {` at line 1656).
- It is called from exactly one place: `src/hooks/useDialogueSession.ts` (two calls).
- That hook is used only by `src/components/dialogue/TextFirstDialogue.tsx` and `src/components/dialogue/DialogueInterface.tsx`, and nothing anywhere else in the app imports either of those two screens — they are unreachable.
- The live Coach page (`/coach`) does **not** use it. It uses `useCoachConversation`, which calls `dialogue-session-manage` / `dialogue-data-persist`. `dialogue-session-manage` already verifies the caller's login (`authenticateRequest`, line 27), so the coach feature is unaffected.

## Changes

1. Delete the backend function `supabase/functions/dialogue-engine/` (all Claude calls in it go with it).
2. Remove it from the live backend so the public URL stops responding.
3. Delete the dead frontend files that were its only callers:
   - `src/hooks/useDialogueSession.ts`
   - `src/components/dialogue/TextFirstDialogue.tsx`
   - `src/components/dialogue/DialogueInterface.tsx`
   (and the `src/components/dialogue/` folder if nothing else remains in it)

## Explicitly not touched

The Coach page and its conversation flow, session saving, debriefs, progress data, reminders, the brief, and every other backend function stay exactly as they are.

## Verification

- Search the whole project for `dialogue-engine`, `useDialogueSession`, `TextFirstDialogue`, `DialogueInterface` — only the historical audit document under `docs/` should still mention it.
- Type check passes with no unresolved imports.
- Load `/coach` in the running app and confirm the conversation still starts normally.
- Confirm the removed endpoint no longer answers.
