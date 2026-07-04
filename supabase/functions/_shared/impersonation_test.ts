// Deno tests for the HS256 impersonation token contract used by
// _shared/auth.ts to validate admin impersonation.

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts';

// A base64-encoded 32-byte key. Any static value works — the tests only
// care about symmetry between sign & verify.
const TEST_KEY = 'dGVzdC1zZWNyZXQta2V5LWZvci1kZW5vLXVuaXQtdGVzdHM=';

Deno.env.set('TOKEN_ENC_KEY_B64', TEST_KEY);

const { signImpersonationToken, verifyImpersonationToken } =
  await import('./impersonation.ts');

function baseInput() {
  return {
    adminSub: 'auth0|admin-1',
    adminEmail: 'shukrita@mindmodule.me',
    targetSub: 'auth0|target-9',
    targetEmail: 'target@example.com',
  };
}

Deno.test('impersonation: valid token round-trips with all claims', async () => {
  const { token, expiresAt } = await signImpersonationToken(baseInput());
  const claims = await verifyImpersonationToken(token);
  assertEquals(claims.iss, 'mm-admin');
  assertEquals(claims.adminSub, 'auth0|admin-1');
  assertEquals(claims.adminEmail, 'shukrita@mindmodule.me');
  assertEquals(claims.targetSub, 'auth0|target-9');
  assertEquals(claims.targetEmail, 'target@example.com');
  assertEquals(claims.exp, expiresAt);
  assert(claims.exp - claims.iat > 60 * 60, 'ttl should be ~2h');
});

Deno.test('impersonation: tampered signature is rejected', async () => {
  const { token } = await signImpersonationToken(baseInput());
  const [h, p, s] = token.split('.');
  // Flip first char of signature (guaranteed to change the raw bytes).
  const first = s[0] === 'A' ? 'B' : 'A';
  const bad = `${h}.${p}.${first}${s.slice(1)}`;
  await assertRejects(() => verifyImpersonationToken(bad), Error, 'Invalid impersonation signature');
});

Deno.test('impersonation: token signed with wrong secret is rejected', async () => {
  const { token } = await signImpersonationToken(baseInput());
  Deno.env.set('TOKEN_ENC_KEY_B64', 'ZGlmZmVyZW50LXNlY3JldC1rZXktZGlmZmVyZW50LXNlY3JldA==');
  try {
    await assertRejects(() => verifyImpersonationToken(token), Error);
  } finally {
    Deno.env.set('TOKEN_ENC_KEY_B64', TEST_KEY);
  }
});

Deno.test('impersonation: malformed token is rejected', async () => {
  await assertRejects(() => verifyImpersonationToken('not.a.jwt.at.all'), Error);
  await assertRejects(() => verifyImpersonationToken('only-one-segment'), Error, 'Malformed');
});

Deno.test('impersonation: expired token is rejected', async () => {
  // Craft a token with iat/exp in the past by monkey-patching Date.now.
  const realNow = Date.now;
  Date.now = () => (realNow() - 3 * 60 * 60 * 1000); // 3h ago
  const { token } = await signImpersonationToken(baseInput());
  Date.now = realNow;
  await assertRejects(() => verifyImpersonationToken(token), Error, 'expired');
});