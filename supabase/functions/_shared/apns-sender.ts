import { validateApnsEnvironment } from "./apns-env.ts";

export function normalizeP8Key(raw: string): string {
  let key = raw
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/[\s\r\n]+/g, '')
    .replace(/-/g, '+').replace(/_/g, '/');
  const pad = key.length % 4;
  if (pad === 2) key += '==';
  else if (pad === 3) key += '=';
  if (key.length === 0) throw new Error('[APNs] APNS_P8_KEY empty after normalization');
  if (!/^[A-Za-z0-9+/=]+$/.test(key)) {
    throw new Error(`[APNs] APNS_P8_KEY has invalid chars`);
  }
  return key;
}

export async function createApnsJwt(
  p8Key: string,
  keyId: string,
  teamId: string,
): Promise<string> {
  const pemBody = normalizeP8Key(p8Key);
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = { alg: "ES256", kid: keyId };
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: teamId, iat: now };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const headerB64 = encode(header);
  const claimsB64 = encode(claims);
  const unsignedToken = `${headerB64}.${claimsB64}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${unsignedToken}.${signatureB64}`;
}

export async function sendApnsSilentPush(
  deviceToken: string,
  bundleId: string,
  jwt: string,
  customData: Record<string, unknown>,
  apnsHost: string = "api.sandbox.push.apple.com",
): Promise<{ success: boolean; status: number; reason?: string }> {
  const apnsPayload = {
    aps: {
      "content-available": 1
    },
    ...customData,
  };

  const url = `https://${apnsHost}/3/device/${deviceToken}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "background",
        "apns-priority": "5",
      },
      body: JSON.stringify(apnsPayload),
    });

    if (res.ok) {
      return { success: true, status: res.status };
    }

    const text = await res.text();
    let reason = "unknown";
    try {
      const json = JSON.parse(text);
      reason = json.reason ?? text;
    } catch {
      reason = text;
    }
    return { success: false, status: res.status, reason };
  } catch (err) {
    return { success: false, status: 0, reason: String(err) };
  }
}
