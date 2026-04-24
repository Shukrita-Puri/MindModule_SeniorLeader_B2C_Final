---
name: forbidden-loading-copy
description: Strings the Brief/Plan/Home empty/loading states must NEVER show — banned forever
type: constraint
---
Never render any of these strings on Brief, Plan, Home, or any empty/awaiting/loading state:
- "Your plan is being prepared. Pull down to refresh."
- "Your plan is being prepared"
- "Pull down to refresh"
- "Pull to refresh" (in brief/plan context)

Why: These strings communicate system uncertainty to a C-suite user and break the executive tone. The awaiting state has its own deterministic copy ("Awaiting today's signal" + assessment/wearable instruction). Loading states use cached-render; revisits never show scripted loaders (per cached-render-and-silent-verification).

How to apply: Before adding any fallback/loading/empty copy to brief or plan components (TodayThreePriorities, DailyRitual, DecisionReadinessBrief, OuterReadinessBrief), grep for these strings — if you would re-introduce them, stop. Use the existing "Awaiting today's signal" pattern instead, or render null.
