import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { classifyMicrosoftCalendarError } from './microsoft-calendar-errors.ts';

function headersOf(map: Record<string, string>): { get(name: string): string | null } {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) lower[k.toLowerCase()] = v;
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

Deno.test('401 → auth_failed with unauthorized reason', () => {
  const c = classifyMicrosoftCalendarError(
    401,
    JSON.stringify({ error: { code: 'InvalidAuthenticationToken', message: 'expired' } }),
  );
  assertEquals(c.kind, 'auth_failed');
  assertEquals(c.reason, 'InvalidAuthenticationToken');
});

Deno.test('403 permission → auth_failed', () => {
  const c = classifyMicrosoftCalendarError(
    403,
    JSON.stringify({ error: { code: 'ErrorAccessDenied', message: 'no perms' } }),
  );
  assertEquals(c.kind, 'auth_failed');
});

Deno.test('429 → rate_limited, parses Retry-After seconds', () => {
  const c = classifyMicrosoftCalendarError(
    429,
    JSON.stringify({ error: { code: 'TooManyRequests', message: 'slow down' } }),
    headersOf({ 'Retry-After': '30' }),
  );
  assertEquals(c.kind, 'rate_limited');
  assertEquals(c.reason, 'TooManyRequests');
  assertEquals(c.retryAfterSeconds, 30);
});

Deno.test('503 → rate_limited (transient upstream)', () => {
  const c = classifyMicrosoftCalendarError(503, 'Service Unavailable');
  assertEquals(c.kind, 'rate_limited');
});

Deno.test('504 → rate_limited (gateway timeout)', () => {
  const c = classifyMicrosoftCalendarError(504, '');
  assertEquals(c.kind, 'rate_limited');
});

Deno.test('500 → rate_limited (generic 5xx bucketed as transient)', () => {
  const c = classifyMicrosoftCalendarError(500, '');
  assertEquals(c.kind, 'rate_limited');
});

Deno.test('404 → other_error, NOT auth (avoid disconnect on missing resource)', () => {
  const c = classifyMicrosoftCalendarError(
    404,
    JSON.stringify({ error: { code: 'ResourceNotFound', message: 'gone' } }),
  );
  assertEquals(c.kind, 'other_error');
  assertEquals(c.reason, 'ResourceNotFound');
});

Deno.test('400 → other_error, connection stays active', () => {
  const c = classifyMicrosoftCalendarError(
    400,
    JSON.stringify({ error: { code: 'BadRequest', message: 'bad filter' } }),
  );
  assertEquals(c.kind, 'other_error');
});

Deno.test('non-JSON body still classifies by status', () => {
  const c = classifyMicrosoftCalendarError(429, '<html>throttled</html>');
  assertEquals(c.kind, 'rate_limited');
  assertEquals(c.reason, 'TooManyRequests');
});