import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Contract guards for the Brief/MRS resilience fix.
 *
 * The deterministic MRS score must never be gated by an LLM/Brief-copy
 * failure. Two source-level invariants keep this true:
 *
 *   1. Anthropic 402 / credit-balance errors are treated as a terminal
 *      operational failure inside the LLM attempt loop, so we do not
 *      burn the full retry budget on an account with $0 balance (which
 *      previously pushed total latency past the platform timeout and
 *      surfaced as 503 to the client).
 *
 *   2. The outermost catch preserves MRS: if the caller forwarded a
 *      deterministic score (compute-inner-readiness output), the
 *      function returns HTTP 200 with an awaiting Brief and the MRS
 *      payload intact, instead of a bare 500.
 */
const SRC = readFileSync(
  join(
    process.cwd(),
    'supabase/functions/compute-outer-readiness/index.ts',
  ),
  'utf8',
);

describe('compute-outer-readiness MRS resilience guards', () => {
  it('marks Anthropic 402 / credit-balance as terminal operational failure', () => {
    // The 402/credit-balance branch must set terminalOperational so the
    // remaining Claude attempts are short-circuited.
    const anthropic402Block = SRC.split('providerReason = "anthropic_402_credits"')[1] ?? '';
    expect(anthropic402Block).toContain(
      'terminalOperational = "workspace_credit_limit"',
    );
  });

  it('outer catch returns 200 awaiting-brief with preserved MRS on fatal', () => {
    expect(SRC).toContain('let recoveryBody: any = null');
    expect(SRC).toContain('recoveryBody = body');
    // Recovery response shape — must be an awaiting brief and must carry
    // the deterministic MRS fields forwarded by the client.
    expect(SRC).toContain('awaitingReason: "fatal_recovered"');
    expect(SRC).toContain('briefSource: "awaiting"');
    expect(SRC).toContain('innerReadinessScoreBaseline: numOrNull(');
    expect(SRC).toContain('innerReadinessScoreRefined: numOrNull(');
    expect(SRC).toContain('innerReadinessState:');
  });

  it('recovery only fires when the caller supplied a numeric MRS input', () => {
    // The recovery branch must be gated on at least one numeric MRS field
    // so we never fabricate a score for callers that didn't send one.
    expect(SRC).toMatch(
      /typeof recoveryBody\.innerReadinessScore === "number"[\s\S]*?innerReadinessScoreBaseline === "number"[\s\S]*?innerReadinessScoreRefined === "number"/,
    );
  });
});
