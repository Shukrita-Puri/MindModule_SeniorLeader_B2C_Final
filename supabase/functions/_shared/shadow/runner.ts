// [KIND: infrastructure] [LAYER: shadow] [TIERS: 0] [AUDIENCE: universal]
// Shadow Execution Runner.
// Source: Spine Section 12, Decisions 23 & 24.
// Invariant: Non-blocking, isolated failure boundary, 1.5-second execution timeout guard.

import { classifyDifference } from "./difference-classifier.ts";
import { hashIdentifier, logShadowComparison } from "./parity-logger.ts";

export interface ShadowRunOptions<TResult> {
  surface: string;
  userId: string;
  itemId: string;
  traceId: string;
  runShadow: () => Promise<TResult> | TResult;
  getLegacyCategory: () => string | null;
  extractShadowCategory: (result: TResult) => string;
  timeoutMs?: number;
}

export async function runInShadow<TResult>(
  options: ShadowRunOptions<TResult>,
): Promise<TResult | null> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 1500;

  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const shadowPromise = Promise.resolve(options.runShadow());
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(() => reject(new Error("shadow_timeout")), timeoutMs);
    });

    const result = await Promise.race([shadowPromise, timeoutPromise]);
    // Clear the guard timer once the shadow wins the race — an uncleared
    // timer keeps the isolate busy and trips Deno's test leak detector.
    clearTimeout(timeoutTimer);
    const durationMs = Date.now() - started;

    const legacyCat = options.getLegacyCategory();
    const shadowCat = options.extractShadowCategory(result);

    const diff = classifyDifference(legacyCat, shadowCat, {
      titleLength: 20,
    });

    logShadowComparison({
      traceId: options.traceId,
      surface: options.surface,
      hashedUserId: hashIdentifier(options.userId),
      hashedItemId: hashIdentifier(options.itemId),
      legacyCategory: legacyCat,
      shadowCategory: shadowCat,
      confidence: 0.85,
      differenceSeverity: diff.severity,
      reasonCode: diff.reasonCode,
      durationMs,
    });

    return result;
  } catch (err) {
    console.warn(`[SHADOW_RUNNER_ERROR] surface=${options.surface} msg=${(err as Error)?.message}`);
    return null;
  }
}
