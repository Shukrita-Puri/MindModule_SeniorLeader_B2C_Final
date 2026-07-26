/**
 * Minimal App Store Server API v1 client (Deno).
 *
 * Used to *re-verify* subscription state server-side. The client is never
 * trusted: any `isPro` claim from the app is ignored, and entitlement is only
 * written from Apple-signed data (a signed StoreKit transaction, a signed
 * notification, or the signed statuses returned here).
 *
 * Credentials come exclusively from environment secrets:
 *   APPLE_ISSUER_ID   – App Store Connect API issuer (UUID)
 *   APPLE_KEY_ID      – key id of the .p8 In-App Purchase key
 *   APPLE_PRIVATE_KEY – the .p8 contents (PEM, PKCS#8)
 *   APPLE_BUNDLE_ID   – app bundle id
 *   APPLE_ENVIRONMENT – "Production" | "Sandbox" (preferred starting host)
 */
import {
  verifyAppleSignedPayload,
  type AppleRenewalInfo,
  type AppleTransactionPayload,
} from './apple-entitlement.ts';

const HOSTS = {
  Production: 'https://api.storekit.itunes.apple.com',
  Sandbox: 'https://api.storekit-sandbox.itunes.apple.com',
} as const;

export type AppleEnv = keyof typeof HOSTS;

export function appStoreApiConfigured(): boolean {
  return Boolean(
    Deno.env.get('APPLE_ISSUER_ID') &&
      Deno.env.get('APPLE_KEY_ID') &&
      Deno.env.get('APPLE_PRIVATE_KEY') &&
      Deno.env.get('APPLE_BUNDLE_ID'),
  );
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Build the ES256 bearer token App Store Server API requires. */
async function buildToken(): Promise<string> {
  const issuerId = Deno.env.get('APPLE_ISSUER_ID')!;
  const keyId = Deno.env.get('APPLE_KEY_ID')!;
  const bundleId = Deno.env.get('APPLE_BUNDLE_ID')!;
  const privateKeyPem = Deno.env.get('APPLE_PRIVATE_KEY')!;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 20 * 60, // Apple allows up to 60m; keep it short.
    aud: 'appstoreconnect-v1',
    bid: bundleId,
  };

  const enc = new TextEncoder();
  const signingInput = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(
    enc.encode(JSON.stringify(payload)),
  )}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(privateKeyPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput)),
  );
  return `${signingInput}.${b64url(sig)}`;
}

interface StatusResponseItem {
  originalTransactionId: string;
  status: number; // 1 active, 2 expired, 3 billing retry, 4 grace, 5 revoked
  signedTransactionInfo: string;
  signedRenewalInfo: string;
}

export interface AppleSubscriptionStatus {
  environment: AppleEnv;
  status: number;
  transaction: AppleTransactionPayload;
  renewal: AppleRenewalInfo | null;
}

/**
 * Fetch the authoritative subscription status for an original transaction id.
 * Tries the configured environment first, then the other one (Apple routes
 * sandbox transactions only through the sandbox host).
 * Returns `null` when credentials are absent or Apple has no record.
 */
export async function getSubscriptionStatus(
  originalTransactionId: string,
): Promise<AppleSubscriptionStatus | null> {
  if (!appStoreApiConfigured()) return null;

  const preferred = (Deno.env.get('APPLE_ENVIRONMENT') === 'Sandbox'
    ? 'Sandbox'
    : 'Production') as AppleEnv;
  const order: AppleEnv[] = preferred === 'Sandbox' ? ['Sandbox', 'Production'] : ['Production', 'Sandbox'];

  let token: string;
  try {
    token = await buildToken();
  } catch (err) {
    console.warn('[app-store-api] token build failed:', (err as Error).message);
    return null;
  }

  for (const env of order) {
    let res: Response;
    try {
      res = await fetch(
        `${HOSTS[env]}/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (err) {
      console.warn('[app-store-api] request failed', env, (err as Error).message);
      continue;
    }

    if (res.status === 404) continue; // not in this environment
    if (!res.ok) {
      console.warn('[app-store-api] non-ok status', env, res.status);
      continue;
    }

    const body = await res.json().catch(() => null);
    const items: StatusResponseItem[] =
      body?.data?.flatMap((g: { lastTransactions?: StatusResponseItem[] }) => g.lastTransactions ?? []) ?? [];
    const item = items.find((i) => i.originalTransactionId === originalTransactionId) ?? items[0];
    if (!item) continue;

    try {
      const transaction = await verifyAppleSignedPayload<AppleTransactionPayload>(
        item.signedTransactionInfo,
      );
      let renewal: AppleRenewalInfo | null = null;
      try {
        renewal = await verifyAppleSignedPayload<AppleRenewalInfo>(item.signedRenewalInfo);
      } catch {
        renewal = null;
      }
      return { environment: env, status: item.status, transaction, renewal };
    } catch (err) {
      console.warn('[app-store-api] signature rejected on status payload:', (err as Error).message);
      return null;
    }
  }

  return null;
}