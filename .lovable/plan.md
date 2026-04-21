

## Plan: Fix post-check-in Brief crash (real cause) + Beta payment leak + permanent guardrail

### Root cause #1 — Brief still crashing (previous fix missed the actual line)

Edge logs at 18:14 (after the last "fix") still show:
```
ERROR [compute-outer-readiness] Error: consecutiveLowDays is not defined
```

My previous patch added the variable to `getLeanOnWatchFor`'s call site (line ~2050), but the **actual offender is line 3393** inside the LLM `userPrompt` builder:

```ts
userPrompt += `\nConsecutive low days: ${consecutiveLowDays}`;
```

A brace-delta scan from line 3040 (where `let consecutiveLowDays = 0;` is declared inside an inner block) to line 3393 (where it's referenced) shows the net depth drops by **58 closing braces** in between — i.e. line 3393 is in a completely different, outer scope. The declaration is long out of scope by the time the prompt is assembled. DB confirms: still no evening `brief_snapshots` row for today, only the afternoon one from 15:24.

**Fix (minimal, targeted):**

1. **Move the `consecutiveLowDays` computation up** to the same outer scope where `userPrompt` is built (immediately before line 3384 where `userPrompt` is initialised). Keep the inner block's local copy too — those are independent and safe to coexist.

```ts
// At outer scope, just before line 3384
let consecutiveLowDaysForPrompt = 0;
for (const c of recentCheckIns) {
  if ((c as any).energy_balance != null && (c as any).energy_balance < 50) consecutiveLowDaysForPrompt++;
  else break;
}
```

Then change line 3393 to reference `consecutiveLowDaysForPrompt`. Distinct name → zero risk of shadowing and clear semantic ("for the prompt").

### Root cause #2 — Permanent guardrail (so this never silently breaks the dashboard again)

Wrap the entire LLM-generation + response-assembly block in a `try/catch` that, on any thrown error:

1. Logs `[compute-outer-readiness] FATAL` with `userId`, `safeTier`, `userLocalDate`, `getTimeOfDay(hour)`, and the error message/stack (per the Fatal Error Logging standard).
2. Returns a **deterministic fallback brief** built from the existing `tierFallbacks` map already in the file (uses `safeTier` + `checkInOutcome`), with `briefSource: 'deterministic'` so the client labels it correctly and the snapshot still gets written.
3. Still attempts the `brief_snapshots` upsert with the deterministic brief so the sidebar's "Recent" history records something instead of a permanent gap.

This means: even if a future free-variable bug or LLM failure reappears, the user sees a graceful brief — never a blank "NOT YET ASSESSED" state — and the sidebar history stays continuous.

### Root cause #3 — Beta testers seeing the payment page

Confirmed in DB: 17 active beta testers (`beta_user=true`, `beta_expires_at>now()`), all with `subscription_status=NULL`, `subscription_tier='none'`. `hasValidAccess()` correctly grants them access via the beta branch. The leak path is in `Stage6Payment.tsx`:

```ts
// Line 38 — beta auto-skip
if (isBetaValid && !isUpgradeVisit) { … skip … }

// Line 34 — but isUpgradeVisit is TRUE for any user who has finished onboarding
const isUpgradeVisit = hasExplicitUpgradeSource || hasCompletedOnboarding;
```

A returning beta user clicking "Activate My System" (`Stage8Results.tsx` line 377), or any path that lands them on `/onboarding/payment` after `onboarding_completed_at` is set, **never hits the auto-skip** and instead falls to the secondary redirect at line 50 which fires only after a render — producing a flash of the pricing page (and, for some users with stale auth state where `beta_user` hasn't yet hydrated, it never redirects).

**Fix (two layers):**

1. **`Stage6Payment.tsx` line 38** — make beta auto-skip take priority over `isUpgradeVisit` whenever the user has no `hasExplicitUpgradeSource`. If they came in WITHOUT explicitly clicking an upgrade CTA, beta access wins:

```ts
useEffect(() => {
  if (!isBetaValid) return;
  if (hasExplicitUpgradeSource) return; // honor explicit upgrade clicks
  // Beta user, any other path → skip payment, send to home
  console.log('[Stage6Payment] Beta valid + no upgrade source → skipping');
  recordStep('payment', { skipped: true, reason: 'beta_user' });
  navigate(hasCompletedOnboarding ? '/daily-check-in' : '/onboarding/app-intro', { replace: true });
}, [isBetaValid, hasExplicitUpgradeSource, hasCompletedOnboarding, navigate, recordStep]);
```

2. **`Stage8Results.tsx` line 377** — guard the "Activate My System" CTA: if the user is a valid beta tester, route them straight to `/daily-check-in` (or `/onboarding/app-intro` if not yet seen). They've already got access; sending them to a pricing page is wrong:

```tsx
onClick={() => {
  if (isBetaValid) {
    navigate('/daily-check-in');
  } else {
    navigate('/onboarding/payment');
  }
}}
```

3. **First-paint guard** — render a neutral loader while `useEffect` resolves the redirect for valid-access users, so beta testers never see the pricing UI flash. Add at the top of `Stage6Payment.tsx`'s render:

```ts
if (isBetaValid && !hasExplicitUpgradeSource) {
  return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
}
```

### How to ensure the brief regression never happens again

Beyond the deterministic fallback above, three concrete habits:

- **Edge function observability standard**: I'll register `compute-outer-readiness` for the FATAL log scan so any future ReferenceError shows up as a structured fatal, not a silent 500. (Memory: `reliability/edge-function-observability-standard` is already adopted; this fix actually applies it here.)
- **Memory note added** capturing this exact failure mode: "When adding new prompt variables, always declare them in the same scope as `userPrompt` initialization (outer `if (cachedSnapshot === null)` scope), never in nested blocks." Saved as `mem://reliability/brief-prompt-variable-scoping`.
- **Snapshot upsert is now in the catch path** — even when the LLM call or assembly fails, a deterministic snapshot is written. This means the sidebar "Recent" feature can never lose continuity for a working day.

### Files touched

| File | Change |
|---|---|
| `supabase/functions/compute-outer-readiness/index.ts` | Declare `consecutiveLowDaysForPrompt` at outer scope before line 3384; reference it at 3393. Wrap LLM/response block in try/catch with deterministic fallback + FATAL log + snapshot upsert. |
| `src/pages/onboarding/stages/Stage6Payment.tsx` | Beta-skip useEffect now wins whenever no explicit upgrade source; loader guard prevents pricing-page flash for valid-beta users. |
| `src/pages/onboarding/stages/Stage8Results.tsx` | "Activate My System" CTA bypasses payment for valid beta users → routes to `/daily-check-in`. |
| `mem://reliability/brief-prompt-variable-scoping` | New rule: prompt-variable scope must match `userPrompt` scope. |

### Verification

1. After deploy, force a brief refresh on `/executive-home` → no `consecutiveLowDays is not defined` in `compute-outer-readiness` logs.
2. `SELECT … FROM brief_snapshots WHERE local_date='2026-04-21' AND time_window='evening'` returns one row for today's user.
3. Sidebar "Recent" shows the new evening brief once under TODAY, alongside afternoon's "Sustaining state."; opening either still works through `HistoricalBriefOverlay`.
4. As a valid beta user: log out, log in, and walk through `/onboarding/results → Activate My System` → lands on `/daily-check-in`, no payment flash.
5. As a valid beta user with `?source=insights-upgrade` → DOES land on payment (intentional — explicit upgrade click).
6. Force-error simulation in compute-outer-readiness → fallback deterministic brief renders + snapshot row written + FATAL log fires.

### Out of scope

- Changing `hasValidAccess` (already correct).
- Touching `SubscriptionGuard` (correctly grants beta access).
- Re-architecting `Stage6Payment` upgrade-mode logic (only the beta entry path is patched).
- Sidebar / overlay / Sharpness shortening (already shipped and verified).

