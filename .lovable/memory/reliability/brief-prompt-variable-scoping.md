---
name: Brief prompt variable scoping
description: All variables referenced inside compute-outer-readiness userPrompt must be declared in the same outer scope as userPrompt (not in nested if-blocks)
type: preference
---
**Rule:** In `supabase/functions/compute-outer-readiness/index.ts`, any variable interpolated into the `userPrompt` string (built around line 3384, inside the `if (cachedSnapshot === null)` branch) MUST be declared in that same outer scope.

**Why:** The prompt builder runs sequentially with many `userPrompt += ...` lines spanning hundreds of lines. Variables declared inside nested helper blocks (e.g. the triage-signals block around line 3040 where `let consecutiveLowDays = 0` lived) are out of scope by the time the prompt body assembles, producing a `ReferenceError` that crashes the entire request and silently blanks the post-check-in Brief on the dashboard.

**How to apply:**
- When adding a new variable that the prompt should reference, declare it in the outer-prompt scope just above `let userPrompt = ...` (~line 3384).
- If the same metric is also computed in a nested triage block, give the prompt copy a distinct name (e.g. `consecutiveLowDaysForPrompt`) to avoid shadowing confusion.
- Never assume a variable from an inner block is still in scope further down — Deno/TS will compile fine, the error only appears at runtime.
