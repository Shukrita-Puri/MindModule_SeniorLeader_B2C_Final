# Evening check-in reminders must never be silently dropped

## What the code actually shows

Confirmed by reading `supabase/functions/smart-nudges/index.ts`:

- The deterministic (built-in) weekend evening text **is** produced — `FB-N3-sat` at line 4320 — but it is then thrown away by the copy-quality gate, so nothing is sent.
- The gate (`validateStaticFallbackCopy`, line 3782) requires every body to cite a "named context token": a number with a unit, a meeting/practice count, a clock time, a real event title, or a check-in word. The weekend body ("Recovery from the week isn't instant — even on the first day off…") contains none, so it is rejected.
- There is a waiver for genuinely low-context text, but `isLowContextStaticFallbackVariant` (line 3700) only recognises variant names ending in `-light`. `FB-N3-sat` does not, so it gets no waiver.
- Same latent hole in several other built-in texts that also carry no number or event name: `FB-N1-sat-recovery`, `FB-N1-sun-reset`, `FB-N1-away`, `FB-N1-travel`, `FB-N1-post-travel`.
- When the AI text also fails, the evaluator returns `null` — there is no last-resort text. That is why the run summary reads `qualified=0 shipped=0`.

So the deterministic copy is not "not utilised" — it is built and then discarded, with no floor beneath it.

## Fix

### 1. Establish the fallback hierarchy explicitly
The intended chain is: **AI copy → deterministic fallback → guaranteed floor**. When the AI path fails (provider error, timeout, or quality rejection), the deterministic fallback is what should be used. Only if the deterministic fallback itself is rejected by the quality gate do we drop to the guaranteed floor. The current code already tries this order, but it has no floor and the deterministic texts are being rejected, so the chain collapses to `null`.

### 2. Make the low-context waiver explicit
Replace the `-light` name-suffix guess with an explicit list of built-in texts that are legitimately low-context (quiet day, day off, weekend, travel, post-travel). Those keep being waived on the named-context rule only — every other quality rule (forbidden words, CTA ending, length, truth/polarity checks) still applies unchanged.

### 3. Rewrite the low-context bodies so they stand on their own
Give each of them a real, factual anchor instead of relying on the waiver — e.g. naming the actual meeting count for the day, or the day-off framing with a concrete count. The waiver then becomes a safety net rather than the normal path. Tone, length and the closing check-in phrasing stay within the existing contract.

### 4. Guarantee a floor for all three reminders
If both the AI text and the deterministic fallback are rejected, fall back to one guaranteed-valid text per reminder type (morning / midday / evening) instead of returning `null`. These floor texts are asserted valid by tests, so a reminder can never again be silently cancelled by the quality gate. The existing suppression reasons (quiet hours, daily cap, do-not-disturb, dry-run) are untouched — this only removes the "no copy" dead end.

### 5. Keep the diagnosis visible
Keep logging the rejection reason when a built-in text is waived or replaced by the floor text, so copy quality problems remain diagnosable rather than hidden.

## Verification

- New contract test enumerating every `FB-*` built-in text: each must pass the quality gate with an empty context (no calendar events, no check-in on file) — the exact condition that broke the weekend path.
- Test asserting the evening evaluator returns copy when the AI path fails on a weekend day with no events.
- Existing smart-nudges tests re-run, then redeploy and confirm the next evening tick records a shipped weekend reminder rather than `all_copy_paths_failed`.
