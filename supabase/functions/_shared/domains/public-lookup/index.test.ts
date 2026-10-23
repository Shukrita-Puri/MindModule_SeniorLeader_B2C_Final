// [KIND: test] [LAYER: 0] [TIERS: 2] [AUDIENCE: universal]
// Unit tests for Layer 0 Public Lookup domain.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isPrivateIp,
  validatePublicLookupTarget,
  PublicLookupService,
} from "./index.ts";

Deno.test("Public Lookup Domain: SSRF guard blocks private/loopback/metadata addresses", () => {
  // Loopback
  assertEquals(isPrivateIp("127.0.0.1"), true);
  assertEquals(isPrivateIp("::1"), true);
  assertEquals(validatePublicLookupTarget("127.0.0.1").isValid, false);
  assertEquals(validatePublicLookupTarget("localhost").isValid, false);

  // Cloud metadata endpoint
  assertEquals(validatePublicLookupTarget("http://169.254.169.254/latest/meta-data/").isValid, false);
  assertEquals(validatePublicLookupTarget("metadata.google.internal").isValid, false);

  // Private RFC 1918 subnets
  assertEquals(isPrivateIp("10.0.0.1"), true);
  assertEquals(isPrivateIp("192.168.1.1"), true);
  assertEquals(isPrivateIp("172.16.0.5"), true);
  assertEquals(validatePublicLookupTarget("192.168.1.1").isValid, false);

  // Plain HTTP rejected (HTTPS required)
  assertEquals(validatePublicLookupTarget("http://example.com").isValid, false);

  // Valid public HTTPS domain
  const valid = validatePublicLookupTarget("https://acme.com");
  assertEquals(valid.isValid, true);
  assertEquals(valid.sanitizedUrl?.hostname, "acme.com");
});

Deno.test("Public Lookup Domain: Safe invalid target handling", async () => {
  const service = new PublicLookupService();
  const res = await service.lookupDomain("127.0.0.1", "trace_test");
  assertEquals(res.isAccessible, false);
});
