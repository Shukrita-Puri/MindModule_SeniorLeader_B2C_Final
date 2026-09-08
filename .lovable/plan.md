# Fix "Save win" + single model for the Chief of Staff profile

## 1. Where wins are stored (answer)

Wins are stored in the `tiny_wins` table, written server-side by the
`store-tiny-win` function. The Reflection Corner writes rows with
`source = 'reflection_corner'` (or `post_event_reflection` after an event).

The table has real data — the most recent Reflection Corner entries are from
late April / early May 2026. Nothing has saved since.

## 2. Why "Save win" fails now

The save is signed with the user's login token. The browser log for this
session repeatedly shows `Token retrieval failed: timeout`, so the request goes
out without a valid sign-in, the server rejects it, and the card shows the
generic "Could not save" message. The typed text is then lost.

### What changes

- Before saving, ask for a fresh sign-in token; if the first attempt times out,
  try once more instead of sending an unsigned request.
- On the iPhone app the same save must work: use the native sign-in token
  (with its refresh path) exactly as the other in-app writing does, so a save
  from the installed app behaves identically to the browser.
- If the token still cannot be obtained, tell the user plainly that their
  session needs refreshing (reload / sign in again) rather than a generic
  failure, and keep their typed text in the box.
- If the save is rejected because the session expired, retry once through the
  existing session-recovery path used elsewhere in the app before failing.
- Keep the draft text in local storage while unsaved so a failed attempt or a
  reload never loses what they wrote; clear it on a successful save.
- No visual change: same card, same button, same copy, same success state.

Technical: `src/components/home/ReflectionCorner.tsx` only — keep
`getEdgeFunctionHeaders()` (native token fallback included), add a one-shot
token re-fetch before invoke, rely on the existing 401 auto-retry
(`src/lib/authRetryInterceptor.ts`), add the draft mirror, and branch the error
toast on missing-token vs server error. Verified on both web and the Capacitor
iOS shell. No change to `store-tiny-win`, the table, RLS, or any other surface.


## 3. One model only for the Chief of Staff profile

`supabase/functions/synthesize-cos-profile/index.ts` currently defines three
model constants and walks a fallback chain.

- Keep only `google/gemini-3.1-flash-lite`.
- Remove `AI_MODEL_FALLBACK` (`gemini-3.1-pro-preview`) and the duplicate
  `AI_MODEL_FALLBACK_LITE`, and remove the model-fallback loop.
- The stricter quality retry stays, but runs on flash-lite instead of
  pro-preview.
- If flash-lite fails, behaviour is unchanged from today's final state: the
  locally built profile is stored as usable (`ready`, quality `thin`).
- Prompt text, tool schema, persistence, quality scoring, and every other
  surface stay exactly as they are.

## Verification

- `deno check` on the function; deploy only `synthesize-cos-profile`; force a
  regeneration for the September user and confirm the stored profile is still
  `ready` / `rich` with the seven sections in order.
- Save a win from the Plan page and confirm a new `tiny_wins` row appears with
  `source = 'reflection_corner'` and today's date.
- Existing test suite passes.
