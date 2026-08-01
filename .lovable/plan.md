Confirmed the country variable: at the `buildDeterministicBriefFallback({ ... })` call site (line 8734) the in-scope home-country variable is **`localeWeekendHomeCountry`** (declared line 3396, assigned line 4654 from the user's profile country). It is already used for exactly this purpose at lines 5909 and 10000, and it drives `briefWeekendDaysForCountry` → `[5,6]` for Gulf/Israel and `[0,6]` elsewhere, so Fri–Sat detection is correct. `homeCountry` does not exist at that scope.

## 1. Brief card "Updating" indicator (frontend, low risk)

`src/components/home/DecisionReadinessBrief.tsx`
- Line 1864: destructure `isFetching: briefSnapshotFetching` from `useCurrentBriefSnapshot()`.
- Immediately after the eyebrow row `</div>` (line 2483), render a pulsing dot + "Updating" label gated on `briefSnapshotFetching && snapshotIsRenderable`, so it never competes with the first-load `EngravedLoader`.
- `showLoader` (line 2418) untouched.

## 2. MRS card "Updating" label (frontend, low risk)

`src/components/home/mrs/MrsPage.tsx`
- Inside the `hasScore && oneLiner && ...` block, add an inline `Updating` span gated on `refreshCards.isPending`, placed alongside the state label so the gauge layout is undisturbed.

## 3. Deterministic brief: weekend awareness + beat expansion (edge function)

`supabase/functions/_shared/brief/deterministic-brief.ts`
- **A** — add `isWeekend?: boolean` to `DeterministicBriefFallbackOpts`.
- **B** — `buildEvidence()` wearable-only fallback (lines 129–131): expand to the 15–18 word weekday/weekend variants, keeping `wearableFact ?? "Recovery signals are in"` as the lead. All earlier branches untouched.
- **C** — `buildDirective()`: the current tail is a bare `return "Keep pace and protect the most important block";` (not an `else` assignment as written in the prompt). Replace that single return with the weekend/weekday branch, wording as specified.
- **D** — `closeFor()`: insert the weekend override ahead of the existing evening override and band map.

`supabase/functions/compute-outer-readiness/index.ts`
- Add `isWeekend: isBriefWeekendDay(dayOfWeek, localeWeekendHomeCountry),` to the opts object at line 8734.

### Verification
- `tsgo` clean; `rg "isWeekend"` shows the interface field plus use in `buildEvidence`, `buildDirective`, `closeFor`, and the new call site.
- Run brief unit tests; assert a Saturday + wearable + sharp body is 25–70 words with beat (a) ≥ 15 words.
- Check new copy against the phrase/forbidden-word validator before deploy; adjust wording (not the validator) if anything trips. `readMap` unchanged.
- Deploy `compute-outer-readiness` after the above passes.

Issue 1 (pill unlock): no code change — I'll read `build-executive-home-cards` logs around 16:55 on 2026-08-01 and report whether the check-in → refresh chain failed.
