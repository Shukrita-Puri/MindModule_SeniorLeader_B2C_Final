---
name: Inline Mindset Reflection Capture
description: Optional auto-saving textarea on every step card of mindset protocols inside MicroPracticePlayerCards
type: feature
---
- Applies to card decks on the explicit allowlist in `src/data/reflectionCaptureIds.ts` (`REFLECTION_CAPTURE_IDS`), not to `subType === 'mindset'`. Includes `jobs-simplicity` (reframe, was mis-tagged as a tool). Somatic/breath decks (`wu-wei-flow`, `fudoshin-immovable-mind`, `grounding-touch`, `release-exhale*`, `djokovic-reset`) and soundscape/guided practices never show the box. Server grouping mirror: `MINDSET_CONTENT_IDS` / `SOMATIC_CONTENT_IDS` in `supabase/functions/_shared/content/surfaced-content.ts`; a Vitest guard keeps the two in sync.
- Storage: `practice_reflections` (RLS deny-by-default). Per-step rows, upsert by `(user_id, practice_id, session_id|temp_session_key, step_number)`. Empty response deletes the row.
- Edge functions: `save-practice-reflection` (POST, debounced 1.2s + on blur + on card change + on complete), `get-practice-reflections` (GET, hydrates on mount via direct fetch with query params).
- Drafts mirror to `localStorage` keyed `reflection:{practiceId}:{tempSessionKey}:{stepNumber}` for offline resilience.
- Pre-completion saves use a `tempSessionKey`. After `handleComplete` returns `practiceSessionId`, a final flush re-links rows to that session via the save function.
- Empty input never blocks "Mark Complete".
- iOS native requires the shared edge-function auth headers from `getEdgeFunctionHeaders()` and the native token fallback in `getAuthToken()`; do not call reflection functions with only the Supabase anon/session token.
- iOS WKWebView textarea flicker is avoided with an isolated `translateZ(0)` wrapper and an opaque input background when the textarea sits inside blurred/translucent UI. When a typing surface (e.g. ReflectionCorner) sits inside another `backdrop-blur` parent (Plan card), promote the typing card AND any per-keystroke counter into their own compositing layer with `isolate [transform:translateZ(0)] [contain:paint]` so keystrokes don't re-rasterise the parent blur stack.
- Reflection Corner / `tiny_wins` flow remains the evening summary — not repurposed.
- Insights / Coach consumption is a follow-up; not in this pass.
