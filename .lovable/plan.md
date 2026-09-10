# Remove "see in Insights" prompt from ReflectionCorner

## What's wrong

After saving a win in the ReflectionCorner, a persistent button appears reading "✓ Win captured — see it in Insights" with an arrow that navigates to `/insights`. The reflection box currently does not surface any content in the Insights cards, so this prompt promises a destination that does not exist in the MVP and can confuse users.

## Change

1. In `src/components/home/ReflectionCorner.tsx`, remove the post-save "✓ Win captured — see it in Insights" button/link block entirely.
2. Update the success toast description from "Saved to your Insights." to a neutral "Saved." so it no longer implies the win is visible in Insights.
3. Remove any imports that become unused after deleting the link (`useNavigate`, `ArrowRight`).
4. Keep all other behavior unchanged: the textarea, the "Saved" tick beside the Save Win button, the Save Win button logic, draft persistence, token refresh/retry, the Stoic companion card, and the `onSaved` callback.

## Verification

- TypeScript typecheck passes.
- Run focused tests that touch `TodayThreePriorities` / Plan slot rendering to ensure the ReflectionCorner still mounts and saves correctly.
- No schema, edge function, or other page changes.
