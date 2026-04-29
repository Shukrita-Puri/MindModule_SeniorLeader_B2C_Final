---
name: Typography & Depth System v2 (Pilot)
description: Token-driven typography + tonal-depth pilot on ExecutiveHome. One serif + one sans, no body italics, capped depth (max 2 mechanisms per element).
type: design
---
**Status:** Pilot scope = ExecutiveHome only (Brief card + Today's 3 Priorities slot cards).

**Tokens (in `src/index.css`):**
- Typography: `.text-display` `.text-h1` `.text-h2` `.text-h3` `.text-body` `.text-body-sm` `.text-caption` `.text-eyebrow` `.text-quote`
- Surfaces: `--surface-raised` `--surface-sunken` `--surface-card-v2` `--bg-v2` `--text-secondary` `--muted-foreground-v2`
- Card utilities: `.card-standard` `.card-hero` `.well-sunken`
- Elevation: `--elev-1` `--elev-2` `--elev-3`

**Hard rules (enforced):**
1. One serif (Cormorant Garamond) for `.text-display` `.text-h1` `.text-quote` only — never below 24px.
2. One sans (Inter) for everything else. Crimson Pro / `font-subheadline` will be removed at global rollout.
3. Italics permitted ONLY on `.text-quote`. Banned in body, captions, eyebrows, pills, lists.
4. `.text-h2` = card titles only. `.text-h3` = intra-card section headers only. Not interchangeable.
5. Body text minimum 16px on mobile.
6. Eyebrow style preserved verbatim (users responded positively).
7. **Depth cap: max 2 mechanisms per element** from {border, shadow, tonal background, gradient}.
8. Gradients restricted to hero card vertical wash + existing taupe button. No gradients on standard cards, lists, pills, or dense UI.
9. Saffron stays CTA-only (fails contrast as text on light surfaces — validated).

**Validated contrast (all >= 4.5:1 on cream/white surfaces):**
- foreground #1F1F1F: 14-16:1
- text-secondary #3F3F3F: 8-10:1
- muted-foreground-v2 #5A5A5A: 5.5-6.9:1
