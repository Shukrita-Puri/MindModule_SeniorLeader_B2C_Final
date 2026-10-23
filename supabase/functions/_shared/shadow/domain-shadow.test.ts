// Tests for the domain shadow wiring helpers (Spine Stage 1-2 protocol).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isDomainShadowEnabled,
  runDomainShadow,
} from "./domain-shadow.ts";

const FLAG = "L5_VOICE";

function withFlag(value: string | undefined, fn: () => void) {
  const orig = Deno.env.get(FLAG);
  try {
    if (value === undefined) Deno.env.delete(FLAG);
    else Deno.env.set(FLAG, value);
    fn();
  } finally {
    if (orig === undefined) Deno.env.delete(FLAG);
    else Deno.env.set(FLAG, orig);
  }
}

Deno.test("isDomainShadowEnabled: unset flag means legacy-only", () => {
  withFlag(undefined, () => assertEquals(isDomainShadowEnabled(FLAG), false));
});

Deno.test("isDomainShadowEnabled: 'shadow' enables, case/whitespace-insensitive", () => {
  withFlag(" Shadow ", () => assertEquals(isDomainShadowEnabled(FLAG), true));
});

Deno.test("isDomainShadowEnabled: other values stay legacy-only", () => {
  for (const v of ["legacy", "v3", "on", "true", ""]) {
    withFlag(v, () => assertEquals(isDomainShadowEnabled(FLAG), false));
  }
});

Deno.test("runDomainShadow: never throws when the shadow engine throws", async () => {
  withFlag("shadow", () => {
    runDomainShadow({
      surface: "test",
      userId: "user-1",
      itemId: "item-1",
      traceId: "trace-1",
      runShadow: () => {
        throw new Error("boom");
      },
      getLegacyCategory: () => "legacy",
      extractShadowCategory: () => "shadow",
    });
  });
  // Give the fire-and-forget promise a tick to settle; no unhandled rejection.
  await new Promise((r) => setTimeout(r, 10));
});

Deno.test("runDomainShadow: runs the shadow engine and resolves", async () => {
  let ran = false;
  withFlag("shadow", () => {
    runDomainShadow({
      surface: "test",
      userId: "user-1",
      itemId: "item-1",
      traceId: "trace-1",
      runShadow: () => {
        ran = true;
        return "shadow-result";
      },
      getLegacyCategory: () => "legacy",
      extractShadowCategory: (r) => r,
    });
  });
  await new Promise((r) => setTimeout(r, 10));
  assert(ran, "shadow engine should have run");
});
