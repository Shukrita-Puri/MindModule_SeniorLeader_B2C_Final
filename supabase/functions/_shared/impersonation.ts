/**
 * Impersonation token — short-lived HS256 JWT that lets an authorized admin
 * temporarily act as another user WITHOUT touching Auth0 credentials.
 *
 * Signed with TOKEN_ENC_KEY_B64 (base64) — already provisioned as a project
 * secret. Never touch Auth0 tokens or the user's password.
 *
 * Token lifetime: 2 hours. Payload:
 *   { iss: "mm-admin", adminSub, adminEmail, targetSub, targetEmail, iat, exp }
 */

const IMPERSONATION_TTL_SECONDS = 2 * 60 * 60;

export interface ImpersonationClaims {
  iss: "mm-admin";
  adminSub: string;
  adminEmail: string;
  targetSub: string;
  targetEmail: string;
  iat: number;
  exp: number;
}

function b64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlEncodeString(str: string): string {
  return b64UrlEncode(new TextEncoder().encode(str));
}

function b64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeKey(): Uint8Array {
  const raw = Deno.env.get("TOKEN_ENC_KEY_B64");
  if (!raw) throw new Error("TOKEN_ENC_KEY_B64 not configured");
  return b64UrlDecode(raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
}

async function importHmacKey(): Promise<CryptoKey> {
  const bytes = decodeKey();
  return crypto.subtle.importKey(
    "raw",
    bytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signImpersonationToken(
  input: { adminSub: string; adminEmail: string; targetSub: string; targetEmail: string },
): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const claims: ImpersonationClaims = {
    iss: "mm-admin",
    adminSub: input.adminSub,
    adminEmail: input.adminEmail,
    targetSub: input.targetSub,
    targetEmail: input.targetEmail,
    iat: now,
    exp: now + IMPERSONATION_TTL_SECONDS,
  };
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = b64UrlEncodeString(JSON.stringify(header));
  const payloadB64 = b64UrlEncodeString(JSON.stringify(claims));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importHmacKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput).buffer as ArrayBuffer,
  );
  const sigB64 = b64UrlEncode(new Uint8Array(sig));
  return { token: `${signingInput}.${sigB64}`, expiresAt: claims.exp };
}

export async function verifyImpersonationToken(token: string): Promise<ImpersonationClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed impersonation token");
  const [headerB64, payloadB64, sigB64] = parts;
  const key = await importHmacKey();
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    b64UrlDecode(sigB64).buffer as ArrayBuffer,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`).buffer as ArrayBuffer,
  );
  if (!ok) throw new Error("Invalid impersonation signature");
  const claims = JSON.parse(new TextDecoder().decode(b64UrlDecode(payloadB64))) as ImpersonationClaims;
  if (claims.iss !== "mm-admin") throw new Error("Bad impersonation issuer");
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp < now) throw new Error("Impersonation token expired");
  if (!claims.adminSub || !claims.targetSub) throw new Error("Impersonation token missing subjects");
  return claims;
}