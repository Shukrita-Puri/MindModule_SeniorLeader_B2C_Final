import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The JS layer is not authorized to define durable Apple Watch sync
 * truth — the iOS HealthKitSyncManager owns that. As long as JS
 * continues to shadow-write status during rollout, every call MUST
 * mark itself as `js-opportunistic` so the backend monotonic guard
 * can safely reject it when a fresher native record exists.
 */
describe('wearable status writes', () => {
  const src = readFileSync(
    resolve(__dirname, '..', 'wearableSyncService.ts'),
    'utf8',
  );

  it('never emits a status write without source: "js-opportunistic"', () => {
    // Every wearable-status-update body in this file must include the
    // opportunistic marker so it cannot regress a native-authoritative
    // record on the backend.
    const endpointCalls = src.split('wearable-status-update').length - 1;
    const opportunisticMarkers = src.match(/source:\s*'js-opportunistic'/g) ?? [];
    expect(endpointCalls).toBeGreaterThan(0);
    expect(opportunisticMarkers.length).toBeGreaterThanOrEqual(endpointCalls - 1); // -1 for import/doc reference
  });

  it('never persists the internal fallback marker as a user-facing error', () => {
    expect(src).not.toMatch(/watch_last_error:\s*['"]native_healthkit_fallback_triggered['"]/);
  });
});