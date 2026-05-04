---
name: Inline Mindset Reflection Capture
description: Optional auto-saving textarea on every step card of mindset protocols inside MicroPracticePlayerCards
type: feature
---
- Applies only to mindset protocols (`subType === 'mindset'` or `id === 'stoic-reflection'`). Somatic/soundscape/guided practices unaffected.
- Storage: `practice_reflections` (RLS deny-by-default). Per-step rows, upsert by `(user_id, practice_id, session_id|temp_session_key, step_number)`. Empty response deletes the row.
- Edge functions: `save-practice-reflection` (POST, debounced 1.2s + on blur + on card change + on complete), `get-practice-reflections` (GET, hydrates on mount via direct fetch with query params).
- Drafts mirror to `localStorage` keyed `reflection:{practiceId}:{tempSessionKey}:{stepNumber}` for offline resilience.
- Pre-completion saves use a `tempSessionKey`. After `handleComplete` returns `practiceSessionId`, a final flush re-links rows to that session via the save function.
- Empty input never blocks "Mark Complete".
- iOS native requires the shared edge-function auth headers from `getEdgeFunctionHeaders()` and the native token fallback in `getAuthToken()`; do not call reflection functions with only the Supabase anon/session token.
- iOS WKWebView textarea flicker is avoided with an isolated `translateZ(0)` wrapper and an opaque input background when the textarea sits inside blurred/translucent UI.
- Reflection Corner / `tiny_wins` flow remains the evening summary — not repurposed.
- Insights / Coach consumption is a follow-up; not in this pass.
