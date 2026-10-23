// [KIND: security] [LAYER: 0] [TIERS: 2] [AUDIENCE: universal]
// SSRF Guard and Security Validation for Public Lookup.
// Source: Part 2 Layer 0 (Section 3).

import type { LookupSecurityValidation } from "./types.ts";
import { BLOCKED_HOSTNAMES } from "./constants.ts";

/**
 * Checks if an IPv4 or IPv6 string falls into private, loopback, or link-local ranges.
 */
export function isPrivateIp(ip: string): boolean {
  const clean = ip.trim().toLowerCase();

  // IPv6 checks
  if (clean === "::1" || clean.startsWith("fe80:") || clean.startsWith("fc00:") || clean.startsWith("fd00:")) {
    return true;
  }

  // IPv4 checks
  const parts = clean.split(".").map((p) => parseInt(p, 10));
  if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 10.0.0.0/8 (Private)
    if (parts[0] === 10) return true;
    // 172.16.0.0/12 (Private)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (Link-local / cloud metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0
    if (parts[0] === 0) return true;
  }

  return false;
}

/**
 * Strict SSRF Guard: ensures the target URL is HTTPS only, has no credentials,
 * and does not point to internal infrastructure, metadata services, or loopback.
 */
export function validatePublicLookupTarget(rawInput: string): LookupSecurityValidation {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { isValid: false, error: "Empty target provided." };
  }

  let urlString = trimmed;
  if (!/^https?:\/\//i.test(urlString)) {
    urlString = `https://${urlString}`;
  }

  let url: URL;
  try {
    url = new URL(urlString);
  } catch (_) {
    return { isValid: false, error: "Invalid URL syntax." };
  }

  // Enforce HTTPS
  if (url.protocol !== "https:") {
    return { isValid: false, error: "HTTPS protocol is strictly required for public lookup." };
  }

  // Refuse credentials
  if (url.username || url.password) {
    return { isValid: false, error: "Embedded user credentials in lookup URLs are forbidden." };
  }

  const hostname = url.hostname.toLowerCase();

  // Block known internal names
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".internal") || hostname.endsWith(".local")) {
    return { isValid: false, error: `Hostname ${hostname} is disallowed.` };
  }

  // Check IP addresses
  if (isPrivateIp(hostname)) {
    return { isValid: false, error: `Private or loopback IP ${hostname} is disallowed.` };
  }

  return { isValid: true, sanitizedUrl: url };
}
