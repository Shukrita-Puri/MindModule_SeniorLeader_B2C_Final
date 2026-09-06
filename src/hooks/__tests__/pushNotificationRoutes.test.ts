import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The Week-Ahead invite ships an explicit `deep_link_route`, but an older or
 * stripped payload must still land on the Plan page in week-ahead mode
 * rather than the home screen. This guards the fallback route table.
 */
describe('push notification fallback routes', () => {
  const src = readFileSync(
    resolve(__dirname, '../usePushNotificationHandler.ts'),
    'utf8',
  );

  it('maps week_ahead_picker_invite to the Plan page in week-ahead mode', () => {
    expect(src).toContain("week_ahead_picker_invite: '/plan?mode=week-ahead'");
  });

  it('still prefers the server-provided deep link', () => {
    expect(src).toContain('deepLinkRoute || ACTION_ROUTES[notificationType]');
  });
});
