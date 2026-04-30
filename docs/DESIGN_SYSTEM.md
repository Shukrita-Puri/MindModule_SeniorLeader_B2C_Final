# Design System v2

Single source of truth for typography, color, surfaces, and depth.
Pilot validated on ExecutiveHome (Brief + Today's 3 Priorities).

## Fonts

- **Cormorant Garamond** (serif) — display + h1 + theme quote only. Never below 24px.
- **Inter** (sans) — everything else, including h2 and below.
- **Crimson Pro retired.** Removed from `index.html` and `tailwind.config.ts`.

## Typography tokens

Defined in `src/index.css`. Use these classes — do not hand-roll sizes.

| Class | Font | Mobile → Desktop | Weight | Usage |
|---|---|---|---|---|
| `.text-display` | Cormorant | 32 → 44 | 500 | Page hero opener (one per page) |
| `.text-h1` | Cormorant | 26 → 32 | 500 | Page-level section title |
| `.text-h2` | Inter | 19 → 22 | 600 | Card titles only |
| `.text-h3` | Inter | 16 → 17 | 600 | Intra-card section headers |
| `.text-body` | Inter | 16 → 17 | 400 | Paragraphs |
| `.text-body-sm` | Inter | 14 | 400 | Dense lists, secondary copy |
| `.text-caption` | Inter | 12 | 500 | Metadata, timestamps |
| `.text-eyebrow` | Inter | 11 (uppercase, 0.12em) | 600 | Section markers, pill headlines |
| `.text-quote` | Cormorant italic | 18 → 20 | 400 | Brief theme phrase only |

### Hard rules

1. **Italics banned** outside `.text-quote`. No italic body, captions, eyebrows, pills, lists.
2. **No serif below 24px.**
3. **H2 ≠ H3 ≠ body-lg.** Each has one job.
4. **Eyebrow** is the only uppercase style.
5. **Body floor: 16px on mobile** (enforced via `body { font-size: 16px }`).

## Color & surfaces

| Role | Token | Value |
|---|---|---|
| App background | `--background` | `#FAFAF8` (legacy) / `--bg-v2` `#F2EFEA` (v2 pages) |
| Standard card | `--surface-card-v2` | `#FAF8F4` |
| Raised (hero/modal) | `--surface-raised` | `#FFFFFF` |
| Sunken well | `--surface-sunken` | `#EAE6DF` |
| Border | `--border-strong` | `rgba(0,0,0,0.10)` |
| Text primary | `--foreground` | `#1F1F1F` (validated 14-16:1) |
| Text secondary | `--text-secondary` | `#3F3F3F` (validated 8-10:1) |
| Text muted | `--muted-foreground-v2` | `#5A5A5A` (validated 5.5-6.9:1) |

Brand accents preserved: Saffron `#ff825a` (CTA-only), Warm Taupe `#9B8B7E`, Charcoal `#2C2C2C`.

### Saffron is CTA-only

Saffron fails contrast as text on light surfaces. Buttons only. Never as score color (use `--tier-*`).

## Depth — strict 2-mechanism cap

Each element picks **at most two** of {border, shadow, tonal background, gradient}.

| Utility | Mechanisms | Use for |
|---|---|---|
| `.card-standard` | tonal bg + border + elev-1 | Default cards |
| `.card-hero` | tonal bg + elev-2 | Brief, hero-only |
| `.well-sunken` | sunken bg + inset border | Pill backs, inset wells |

**Gradients restricted to:** hero card vertical wash, existing taupe button. Nothing else.

### Elevation tokens

- `--elev-1`: `0 1px 2px rgba(0,0,0,0.04)` — standard cards
- `--elev-2`: `0 4px 12px rgba(0,0,0,0.06)` — hero cards
- `--elev-3`: `0 12px 32px rgba(0,0,0,0.10)` — modals

## Tier traffic-light palette (score-only)

`--tier-strong` sage / `--tier-moderate` muted amber / `--tier-low` coral / `--tier-neutral` graphite.
Only on tier word + signal pills. Never on buttons.

## Rollout status

- ✅ Tokens shipped (v2 utilities exist alongside legacy).
- ✅ Pilot: `DecisionReadinessBrief`, `TodayThreePriorities` adopt v2.
- ✅ Body floor 16px applied globally.
- ✅ Crimson Pro retired.
- ⏳ **Phase 3 (deferred):** sweep ~22 components removing inline `font-body italic` spans → migrate to non-italic body + `.text-quote` where appropriate. Higher risk; ship per-component as touched.
- ⏳ Default `<Card>` primitive untouched (37 usages — safer to migrate to `.card-standard` opt-in).

## What does NOT change

- B&W pencil/engraving illustrations.
- Routes, flows, navigation structure.
- Coach prompts, scoring algorithms, edge functions.
- Tier traffic-light tokens and their score-only rule.
