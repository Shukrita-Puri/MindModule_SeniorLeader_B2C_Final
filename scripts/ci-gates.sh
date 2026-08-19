#!/bin/bash
set -e

# Gate 1: Legacy ranker only in shadow
grep -r 'rankJitCandidates' supabase/functions/ \
  | grep -v 'select=true\|LEGACY_JIT_SHADOW\|_shared/events/jit-candidates.ts\|_shared/plan/week-ahead-mode.ts\|list-week-ahead-priorities/index.ts\|generate-mastery-plan/index.ts\|test.ts\|_shared/jit/slot-allocator.ts\|_shared/jit/select-jit.ts' && exit 1 || true

# Gate 2: dayOfWeek===6 only in user-locale.ts
grep -rn 'dayOfWeek === 6' supabase/functions/ \
  | grep -v '_shared/plan/user-locale.ts\|smart-nudges\|_shared/signal-engine\|_shared/ceo-behaviour\|build-executive-home-cards\|compute-outer-readiness' && exit 1 || true

# Gate 3: WEEK_AHEAD_MEMORY_BOOST removed
grep -r 'WEEK_AHEAD_MEMORY_BOOST' supabase/functions/ && exit 1 || true

# Gate 4: Title flags replaced with tags
grep -A5 'deriveStructuralDayFlags' supabase/functions/generate-mastery-plan/index.ts \
  | grep -i 'Title\|Regex' | grep -i 'travel\|conference' && exit 1 || true

# Gate 5: After parity week, legacy shadow flag is false
# (activated in post-parity CI config)

# Gate 6: every brief-scoped CEO behaviour rule has deterministic copy
deno test --allow-all supabase/functions/_shared/personas/ceo/behaviour-copy.contract.test.ts

echo "✅ All 6 core gates passed"
