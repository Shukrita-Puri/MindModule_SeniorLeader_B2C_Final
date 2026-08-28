import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildReadinessAwaitingMessage } from './awaiting.ts';

Deno.test('awaiting copy names calendar as connected when wearable is missing', () => {
  assertEquals(
    buildReadinessAwaitingMessage({ hasCalendar: true, hasWearable: false }),
    'Calendar is connected. Connect your wearable to get an early read, then check in to sharpen it.',
  );
});

Deno.test('awaiting copy names wearable as connected when calendar is missing', () => {
  assertEquals(
    buildReadinessAwaitingMessage({ hasCalendar: false, hasWearable: true }),
    'Wearable is connected. Connect your calendar to get an early read, then check in to sharpen it.',
  );
});

Deno.test('specific connection problems take precedence over missing-source copy', () => {
  assertEquals(
    buildReadinessAwaitingMessage({
      hasCalendar: true,
      hasWearable: false,
      integrationStatus: {
        wearable: { connectionStatus: 'permission_revoked' },
      },
    }),
    'Apple Health access needs attention — reconnect it to restore your readiness read.',
  );
});