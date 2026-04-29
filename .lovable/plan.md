# UI Refinement v2: Pilot-First, Token-Driven, Guardrailed

Revised after design review. Key shifts: **pilot typography + color together on one stress-test page first**, **fully retire Crimson Pro**, **enforce usage rules not just tokens**, and **cap depth mechanisms to two per element**.

---

## Strategy

```text
Step 0  Pick stress-test page: ExecutiveHome (/) — Brief + Priorities + nav + cards + eyebrows + dense pills
Step 1  Pilot typography + color together on that page only
Step 2  Validate (mobile 390px, desktop 1280px) — readability, layout integrity, contrast ratios, premium feel
Step 3  Tune TOKENS (not components) based on findings
Step 4  Global rollout via base layer + Card primitive
Step 5  Targeted fixes: BottomNavigation, dense components, anything with fixed height
Step 6  Document in docs/DESIGN_SYSTEM.md
```

Each step is independently shippable.

---

## Phase 1 — Typography (committed, simplified)

### Hard commitments
- **One serif, one sans.** Cormorant Garamond (display) + Inter (everything else).
- **Crimson Pro removed entirely** — from `index.html` font preload, from `tailwind.config.ts` (`font-subheadline`), and from all 12 components currently using it. No transitional period.
- **Italics: display-only at H1+ sizes.** Banned in body, captions, eyebrows, pills, lists. Only the brief's "theme phrase" pull-quote keeps italics.
- **Serif retreats above mobile-readable threshold.** Cormorant only at H1+ (≥24px). H2 and below switch to Inter to avoid thin-stroke issues on small screens.

### Token table

| Token | Font | Mobile → Desktop | Weight | Line-height | Usage rule (enforced) |
|---|---|---|---|---|---|
| `text-display` | Cormorant | 32 → 44px | 500 | 1.15 | Page hero opener only — one per page |
| `text-h1` | Cormorant | 26 → 32px | 500 | 1.2 | Page-level section title only |
| `text-h2` | **Inter** | 19 → 22px | 600 | 1.3 | **Only card titles** |
| `text-h3` | Inter | 16 → 17px | 600 | 1.4 | **Only intra-card section headers** |
| `text-body` | Inter | **16 → 17px** | 400 | 1.55 | All paragraphs |
| `text-body-sm` | Inter | 14px | 400 | 1.5 | Dense lists, secondary copy only |
| `text-caption` | Inter | 12px | 500 | 1.4 | Metadata, timestamps |
| `text-eyebrow` | Inter | 11px, `tracking-[0.12em]` uppercase | 600 | 1.3 | Section markers, pill headlines (preserved as-is) |
| `text-quote` | Cormorant italic | 18 → 20px | 400 | 1.4 | Brief theme phrase only |

### Letter-spacing (simplified)
- Display + H1: `-0.01em` (tight, visually obvious at large sizes).
- Everything else: `0` (default).
- Eyebrow: `0.12em` (preserved — users responded positively).
- No micro-tweaks elsewhere.

### Usage rules (documented + enforced)
- H2 ≠ H3 ≠ body-lg. Each has one job.
- No italics outside `text-quote`.
- No serif below 24px.
- Eyebrow is the only uppercase style.

---

## Phase 2 — Color + Depth (Oura-inspired, strictly capped)

### Brand commitments preserved
Saffron `#ff825a`, Warm Taupe `#9B8B7E`, Charcoal `#2C2C2C`, Black, Cream surfaces. Saffron stays CTA-only.

### Roles

| Role | Token | Value | Usage |
|---|---|---|---|
| App background | `--background` | `#F2EFEA` (deeper cream) | Page canvas |
| Surface (default card) | `--card` | `#FAF8F4` | Standard cards |
| Surface raised (hero) | `--surface-raised` | `#FFFFFF` | Brief, modals |
| Surface sunken | `--surface-sunken` | `#EAE6DF` | Pill backs, inset wells |
| Border subtle | `--border` | `rgba(0,0,0,0.06)` | Default |
| Text primary | `--foreground` | `#1F1F1F` | Headings, body |
| Text secondary | `--text-secondary` | `#3F3F3F` | Body when on raised surface |
| Text muted | `--muted-foreground` | `#5A5A5A` (validated, see below) | Captions |

### Depth system — strict caps

**Rule: max 2 depth mechanisms per element.** Choose from {border, shadow, tonal background, gradient}.

- **Standard card**: `border` + `elev-1` shadow. No gradient.
- **Hero card** (Brief only): `tonal background` + `elev-2` shadow. No border, no gradient.
- **Sunken well** (pill back): `surface-sunken background` + 1px inner border. No shadow.
- **Modal**: `border` + `elev-3` shadow.

**Gradients are restricted to**:
- Hero card vertical wash (3-5% delta, single instance per page)
- Existing taupe button gradient (preserved)
- Nothing else. No gradients on standard cards, lists, pills, or dense UI.

**Elevation tokens** (replaces ad-hoc shadows):
- `elev-1`: `0 1px 2px rgba(0,0,0,0.04)`
- `elev-2`: `0 4px 12px rgba(0,0,0,0.06)`
- `elev-3`: `0 12px 32px rgba(0,0,0,0.10)`

### Contrast — validated, not eyeballed

I'll measure contrast ratios on actual surfaces using the chosen hex values:
- `--muted-foreground #5A5A5A` on `--card #FAF8F4` → must be ≥ 4.5:1 for body, ≥ 3:1 for large text
- Same check on `--surface-raised`, `--surface-sunken`, and the taupe button surface
- Saffron `#ff825a` text on white → check; if it fails, restrict saffron to ≥18px or button-only (likely already true)

Validated values land in tokens; no value ships unmeasured.

---

## Pilot scope (Step 1) — ExecutiveHome

Touched in pilot:
- `src/index.css` — add tokens
- `src/components/ui/card.tsx` — add `variant="hero" | "sunken"` (default behavior unchanged)
- `src/components/home/DecisionReadinessBrief.tsx` — adopt `text-h2`/`text-body`/`text-quote`/hero variant
- `src/components/home/TodayThreePriorities.tsx` — adopt typography + standard card
- `src/components/home/StrategicIntentionCard.tsx` — adopt typography + standard card
- `src/components/home/CheckInBanner.tsx` — text scale check
- `src/components/BottomNavigation.tsx` — pin caption size to prevent reflow

Untouched in pilot: Insights, Mastery Plan, Onboarding, Coach, Profile.

### Validation checklist (Step 2)

- [ ] Mobile 390px: no horizontal scroll, no clipped text, no broken nav
- [ ] Desktop 1280px: cards visually separate from background
- [ ] All body text ≥ 16px on mobile
- [ ] No italics anywhere except brief theme phrase
- [ ] Contrast ratios measured and ≥ 4.5:1 for body
- [ ] Bottom nav height unchanged
- [ ] Eyebrow style identical to current (the one users like)
- [ ] Brief card feels distinct from standard cards (hero treatment lands)
- [ ] Screenshots captured: home mobile + desktop, before/after

---

## Global rollout (Step 4) — only after pilot validates

1. Move pilot tokens into base layer rules so existing `<h1>/<h2>/<h3>/<p>` inherit.
2. Update default `Card` primitive (border + elev-1 + new bg). ~80% of cards inherit instantly.
3. Sweep remaining `font-subheadline` and `italic` body usages (~12 files) — straight find-and-replace once tokens are validated.
4. Remove Crimson Pro from `index.html` font link.
5. Remove `font-subheadline` from `tailwind.config.ts`.

## Targeted fixes (Step 5)

Components flagged as moderate-risk under font scaling:
- `BottomNavigation` — pin labels to `text-caption` (12px) so 16px body bump doesn't push nav height
- `LeftSidebar` — same caption pin
- Any `min-h-[Xpx]` / `h-[Xpx]` cards — audit and convert to `min-h` based on content
- Truncated single-line elements (`truncate`, `line-clamp-1`) — recheck at 16px
- Button heights — `Button` size variants already use rem; spot-check

## What is explicitly NOT touched
- Black-and-white pencil/engraving illustrations.
- Flow / navigation / route structure.
- Tier traffic-light tokens (sage/amber/coral) and their score-only usage rule.
- Saffron-as-CTA-only rule (reinforced).
- Coach prompts, scoring, edge functions.

## Deliverables
- Pilot diff (steps 1-2) with mobile + desktop before/after screenshots and measured contrast ratios.
- After pilot approval: global rollout diff + `docs/DESIGN_SYSTEM.md`.
- Memory update: `mem://style/typography-system` and `mem://style/depth-system` with the enforced usage rules.

## Risk register
| Risk | Likelihood | Mitigation |
|---|---|---|
| 14px → 16px breaks fixed-height components | Moderate | Pilot exposes it; Step 5 fixes nav/sidebar before global rollout |
| Cormorant unreadable at H2 on mobile | Mitigated | H2 already moved to Inter |
| Gradients creep beyond hero | Low | Documented rule + only one gradient utility class shipped |
| Contrast fails on taupe surfaces | Possible | Measured in Step 2 before rollout; tokens adjust if needed |
| Two serifs creep back | Eliminated | Crimson Pro fully deleted from config + index.html |
