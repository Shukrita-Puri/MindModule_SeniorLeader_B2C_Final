## Goal

Update the three legal/transparency pages in the app to match the new copy the user provided:

- `src/pages/Privacy.tsx` ← `Privacy-Policy-Mind-Module.md`
- `src/pages/Terms.tsx` ← `Terms-of-Use-Mind-Module.md`
- `src/pages/PoweredByAI.tsx` ← `AI-Transparency-Disclosure-Mind-Module.md`

No business logic changes. Layout, navigation, footer links, and design tokens stay exactly as-is.

## Scope of changes

For each page:

1. Keep the existing page shell: `UnifiedTopBar`, container width, headline + meta line, `space-y-8` section list, footer with cross-links to the other two pages, and the existing `text-foreground/80 font-body` typography.
2. Replace section content with the new copy verbatim from the uploaded markdown (numbered sections 1–N, bullet lists, bold emphasis preserved).
3. Strip the bracketed "legal counsel note" callouts at the top of each markdown — those are author notes, not user-facing copy.
4. Set "Last Updated" / "Effective Date" to **June 29, 2026** (the user can edit later). Leave the existing "Last Updated" line styling intact.
5. Preserve existing internal navigation pattern: `navigate('/privacy')`, `navigate('/terms')`, `navigate('/powered-by-ai')` for cross-links; render `contact@mindmodule.me` as a `mailto:` link; render external third-party links (Google AI Principles etc.) with `target="_blank" rel="noopener noreferrer"`.
6. Keep the headline sizes (`text-[22px] sm:text-3xl font-headline`) and H2 sizes (`text-[17px] sm:text-xl font-body`) consistent across all three pages.

## Notable content deltas vs current pages

- **Privacy**: now names Auth0, Stripe, Apple Health/Oura, Google/Microsoft/Apple Calendar, adds wearable signal scope (HRV, RHR, HR, sleep), attendee-relationship inference section (§1.4), GDPR/CCPA/MENA/APAC/HealthKit regional sections, retention table.
- **Terms**: adds 7-day free trial (§5.2), full calendar/wearable provider scope (§10), removes any present-tense conversational AI Coach references, UK/EU vs US pricing (£29/£24 vs $29/$24), England & Wales governing law.
- **Powered by AI**: removes "AI Self-Mastery Coach" as a present-tense feature, adds Mental Readiness Score, Performance Patterns, Smart Nudges, Attendee Relationship Inference (§4), deterministic-fallback note, multi-LLM fallback acknowledgement.

## Out of scope

- No route changes (existing `/privacy`, `/terms`, `/powered-by-ai` are reused).
- No new components, no new design tokens.
- No edits to footer/PrivacyFooter or other entry points.
- No legal review — copy is taken verbatim from the user-provided files.

## Technical notes

Each page is a single self-contained `.tsx` file rendered with Tailwind utilities and shadcn-free primitives. Replacement is a straight content rewrite inside the existing JSX scaffold — no new dependencies, no state, no data fetching.
