

# Soften Tab Bar Border

## Change

**`src/pages/ExecutiveHome.tsx` line 221:**

Current: `border-b border-border/30`

Replace with: `border-b border-white/[0.06]` — a near-invisible warm divider that feels premium and fluid. The active tab underline already provides visual separation, so the full-width border just needs a whisper of definition rather than a visible line.

Single line change, no logic affected.

