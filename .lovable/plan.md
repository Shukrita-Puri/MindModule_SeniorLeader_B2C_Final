

## Plan: Chief-of-Staff Greeting Variants (≤2 words + name)

### Context
User wants greeting options that mimic how a Chief-of-Staff would address a C-Suite leader — short, capable, time-neutral, signalling "I've got you, ready when you are." Beta feedback liked notifications like "Ready to roll" — that energy.

### Curated greeting options (2 words max + {firstName})

**Tier 1 — Operator energy (recommended)**
1. `Ready, {firstName}.` — minimal, confident, mirrors a CoS quietly signalling readiness
2. `Standing by, {firstName}.` — classic executive aide phrasing
3. `At your signal, {firstName}.` — (3 words but iconic — feels like a flag officer's aide)
4. `Ready to roll, {firstName}.` — the phrase betas already loved
5. `On deck, {firstName}.` — sports/ops crossover, action-ready

**Tier 2 — Composed / steady**
6. `Welcome back, {firstName}.` — current default, warm but generic
7. `Good to see you, {firstName}.` — (4 words — warmer, less ops)
8. `All set, {firstName}.` — quiet competence
9. `Here for you, {firstName}.`

**Tier 3 — Ambient / state-aware**
10. `Briefed and ready, {firstName}.` — implies the system has done prep work (true — the brief is loaded)
11. `Ledger's open, {firstName}.` — niche but premium

### My recommendation
Rotate between 3 phrases (deterministic by day-of-week or random per session) so it doesn't feel templated:
- `Ready, {firstName}.`
- `Standing by, {firstName}.`
- `Ready to roll, {firstName}.`

OR — pick one and stick with it for brand consistency. Recommendation: **`Ready, {firstName}.`** — shortest, most CoS, mobile-friendly, never stale.

### Implementation (after you pick)

In `src/pages/ExecutiveHome.tsx`, update `getGreeting()`:

**Option A — single phrase (recommended for consistency):**
```ts
const getGreeting = () => `Ready, ${firstName}.`;
```

**Option B — rotating set (deterministic by day so it's stable per session):**
```ts
const getGreeting = () => {
  const phrases = [
    `Ready, ${firstName}.`,
    `Standing by, ${firstName}.`,
    `Ready to roll, ${firstName}.`,
  ];
  return phrases[new Date().getDay() % phrases.length];
};
```

### Files edited
- `src/pages/ExecutiveHome.tsx` (one function body)

### Untouched
Everything else — brief card, signals, layout, video, scoring.

### Decision needed from you
1. Pick a single phrase, OR approve the rotating trio
2. Confirm whether you want the trailing period (`Ready, Anand.`) or no punctuation (`Ready, Anand`)

