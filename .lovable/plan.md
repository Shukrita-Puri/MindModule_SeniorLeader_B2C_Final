# Shut off the dialogue engine's paid AI calls (minimal, launch-safe)

## What this fixes

The `dialogue-engine` backend function accepts requests from anyone on the internet with no login check and forwards them to the paid Claude AI service. It belongs to a dialogue screen that is no longer reachable in the app.

Given how close launch is, this does the smallest possible change that removes the risk: one backend file is replaced with a short "this feature is retired" responder. Nothing is deleted anywhere else.

## Confirmed current state

- `dialogue-engine` has no authentication anywhere in its handler (only `serve(async (req) => {` at line 1656).
- It is called from exactly one place: `src/hooks/useDialogueSession.ts` (two calls).
- That hook is used only by `src/components/dialogue/TextFirstDialogue.tsx` and `src/components/dialogue/DialogueInterface.tsx`, and nothing anywhere else in the app imports either screen — they are unreachable, so no live screen can hit the endpoint.
- The live Coach page (`/coach`) does **not** use it. It uses `useCoachConversation`, which calls `dialogue-session-manage` / `dialogue-data-persist`. `dialogue-session-manage` already verifies the caller's login (`authenticateRequest`, line 27), so the coach feature is unaffected.

## The change — exactly one file

Replace the contents of `supabase/functions/dialogue-engine/index.ts` with a small responder that:

- requires a verified login before doing anything (same helper the sibling coach functions use),
- makes **no** AI calls at all — the Claude code and prompts are gone,
- returns a plain "feature retired" response (HTTP 410) to any caller,
- keeps the standard cross-origin headers so a stray call fails cleanly rather than erroring oddly.

Then deploy that one function on its own.

## Why this is the safe option

- No files are deleted — not the frontend hook, not the dialogue screens, not the function folder. Anything removed now is a rollback risk; anything left in place is inert.
- The deployed function keeps existing, so nothing that references its name can 404 unexpectedly; it simply refuses politely and costs nothing.
- Only `dialogue-engine` is deployed. No other backend function, no app code, no database change, no configuration change.
- Fully reversible: restoring the old file is a single revert if the feature is ever revived.

## Explicitly not touched

The Coach page and its conversation flow, session saving, debriefs, progress data, reminders, the brief, the plan, onboarding, and every other backend function stay exactly as they are.

## Verification

- Confirm no remaining reference to Anthropic or Claude inside the `dialogue-engine` folder.
- Type check the function cleanly.
- Confirm the diff touches only `supabase/functions/dialogue-engine/index.ts`.
- Load `/coach` in the running app and confirm the conversation still starts normally.
- Call the retired endpoint once and confirm it returns the retired response without any AI usage.

## Optional cleanup, later (not part of this change)

After launch, the dead frontend files (`useDialogueSession.ts`, `TextFirstDialogue.tsx`, `DialogueInterface.tsx`) and the function folder itself can be removed. Left alone for now.
