Three isolated polish changes on the Plan page. No logic, no data, no routing changes.

## 1. Greeting "Ready to roll, Shuk"

File: `src/components/today/TodayGreeting.tsx`

- Match the H1 used on Insights and Reset pages: `font-headline text-[26px] md:text-[42px] tracking-tight`. (Currently `text-[33px]` — inconsistent with the other two pages.)
- Keep it bold per request → `font-semibold` (today it's already semibold; only the size changes).
- Vertically center on the **same line as the sidebar toggle button**. Today the greeting sits at `top: env(safe-area-inset-top) + 0.5rem` while the header sits at `pt-[calc(env(safe-area-inset-top)+0.75rem)]` with a ~40px round button → greeting baseline floats above button center.
  - Change: anchor greeting to the same top as the header (`top: calc(env(safe-area-inset-top,0px) + 0.75rem)`), height `2.5rem`, `flex items-center justify-center`. Now greeting vertical-centers with button vertical-center.
  - Keep `pl-14 md:pl-0` so text isn't pushed off-center on mobile by the sidebar button.

## 2. Plan-page expanded priority — text hierarchy

File: `src/components/home/TodayThreePriorities.tsx` (~lines 1002–1075)

New order and weights inside an expanded slot:

```text
Before Shukrita Puri and Pradnya          ← Tier 1: bold, foreground (the WHEN)
[ in 63 min ]   [ Priority event ]        ← pill row (only when JIT event)
WHY THIS MATTERS                          ← eyebrow (uppercase, muted)
Clarity low, address it before the        ← Tier 3: body, normal weight
afternoon compounds...
Regulate your state for the morning ahead ← italic, muted (action line)
[ practice cards ]
[ Start ]
```

Changes:

- **Header line ("Before Shukrita…")** — currently rendered as small `text-xs text-muted-foreground/60` inside the time-label row. Promote to top of hierarchy on its own line: `text-[15px] md:text-[16px] font-semibold text-foreground`. The string is `hm.timeLabel` for JIT slots ("Before {event}"); for non-JIT morning/evening slots it is "Morning"/"Evening" — also rendered bold so the WHEN is always the visual anchor.
- **Pill row** — render below the bold WHEN line. Show `timeLabel` chip ("In 63 min", "in 4 days") + "Priority event" pill **only when `hm.isJit`**. For morning/evening non-JIT slots: hide both pills entirely (per request: "if its a morning or evening card then no time pill and we don't need priority pill").
  - Time-until pill styling: `text-[11px] px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground`.
- **WHY THIS MATTERS eyebrow** — keep current style.
- **whyLine body** — keep current `text-[13px] text-foreground/85 leading-relaxed`.
- **Recommended action** (`hm.recommendedAction`) — switch from current bold medium to **italic, muted**: `text-[13px] italic text-muted-foreground font-body leading-relaxed`. Per spec: "any action based text… should be in italics".
- Remove the duplicate header rendering inside the collapsed-button area when expanded so the new bold WHEN line is the only header.

## 3. Practice cards — smaller visual, all text retained

Same file (~lines 1126–1178).

User clarification: keep title, step, time, and context. Only the **image side gets smaller**; the white text panel stays. Tighten title and context copy weight/size for crispness. Horizontal scroll stays.

Changes:
- Card height: `h-44 md:h-40` → `h-36 md:h-36` (slightly shorter; text still fits at 4 lines).
- **Thumbnail** (visual): `w-24 md:w-28` → `w-16 md:w-20` (the only real shrink — image becomes a smaller bookmark on the left, freeing ~32 px for the text panel).
- Multi-card scroll width: `w-[88%] md:w-[80%]` → `w-[80%] md:w-[70%]` so the next card peeks more prominently as a scroll affordance. (Still scrolls horizontally; not all cards on one line.)
- **Title** (`practice.title`): `text-[15px] md:text-[14px] line-clamp-3` → `text-[13px] font-semibold line-clamp-2 leading-tight`. Crisper, bolder, fewer lines.
- **Step indicator** ("Step 1 of 2"): kept (visible whenever `hasMultiple`). Tightened: `text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-0.5`. Single-step priorities don't show it (already conditional).
- **Time** ("2.47 min"): kept. `text-xs` → `text-[11px] text-muted-foreground` so it sits between title and context without crowding.
- **Context** (`practice.reasoning`): kept and **fully visible** (no clamp removed by space — just smaller text). `line-clamp-3 text-xs` → `line-clamp-3 text-[11px] leading-snug text-muted-foreground/85`. The smaller thumbnail gives the context room to breathe so the user reads the reason for the practice in full.
- Slot card inner padding: `px-4 py-1` → `px-3 py-1` (frees ~8 px for cards on 360–414 px screens).

Net effect: image is the only thing that shrinks; the text column gets wider and the four pieces of copy (step → title → time → context) stack tighter and crisper.

## Files touched

- `src/components/today/TodayGreeting.tsx` — size + vertical alignment.
- `src/components/home/TodayThreePriorities.tsx` — expanded-slot hierarchy + practice-card resizing.

Nothing else. No backend, no scoring, no JIT logic, no routes.

## UX rationale

1. **WHEN as anchor**: bold event title first turns each slot into a "Before X" headline. Pills become metadata, not headlines.
2. **Italic action line**: italics signal verb/outcome without competing with the bold WHEN. One bold + one italic = clean primary→secondary hierarchy.
3. **Shrink visual, keep copy**: the practice card's job here is to *introduce* a practice, not to be a hero tile. A smaller bookmark image keeps brand/atmosphere while the text panel — which is what tells the user *what* and *why* — gets more room and crisper type.
