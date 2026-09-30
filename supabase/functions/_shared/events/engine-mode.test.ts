// Stage E: Canary Mode Test (Step 18)
// Verifies AH_ENGINE_MODE evaluation across "legacy", "shadow", "v3_canary", and "v3"

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getEngineMode,
  isEngineModeLegacy,
  isEngineModeShadow,
  isEngineModeV3,
  isEngineModeCanary,
} from "./engine-mode.ts";

Deno.test("Stage E: Engine Mode switching and Canary allow-list routing", () => {
  const originalMode = Deno.env.get("AH_ENGINE_MODE");
  const originalCanary = Deno.env.get("AH_CANARY_USER_IDS");

  try {
    // 1. Default fallback is legacy
    Deno.env.delete("AH_ENGINE_MODE");
    assertEquals(getEngineMode(), "legacy");
    assertEquals(isEngineModeLegacy(), true);
    assertEquals(isEngineModeShadow(), false);
    assertEquals(isEngineModeV3(), false);
    assertEquals(isEngineModeCanary("user-1"), false);

    // 2. Shadow mode
    Deno.env.set("AH_ENGINE_MODE", "shadow");
    assertEquals(getEngineMode(), "shadow");
    assertEquals(isEngineModeLegacy(), false);
    assertEquals(isEngineModeShadow(), true);
    assertEquals(isEngineModeV3(), false);
    assertEquals(isEngineModeCanary("user-1"), false);

    // 3. Canary mode with allow-list
    Deno.env.set("AH_ENGINE_MODE", "v3_canary");
    Deno.env.set("AH_CANARY_USER_IDS", "user-vip-1, user-vip-2, USER-CANARY");
    assertEquals(getEngineMode(), "v3_canary");
    assertEquals(isEngineModeLegacy(), false);
    assertEquals(isEngineModeShadow(), false);
    assertEquals(isEngineModeV3(), false);

    // Allow-list checks (case-insensitive)
    assertEquals(isEngineModeCanary("user-vip-1"), true);
    assertEquals(isEngineModeCanary("USER-VIP-2"), true);
    assertEquals(isEngineModeCanary("user-canary"), true);
    assertEquals(isEngineModeCanary("user-regular"), false);
    assertEquals(isEngineModeCanary(null), false);
    assertEquals(isEngineModeCanary(undefined), false);

    // 4. V3 global cutover mode (Stage F Step 19)
    Deno.env.set("AH_ENGINE_MODE", "v3");
    assertEquals(getEngineMode(), "v3");
    assertEquals(isEngineModeV3(), true);
    assertEquals(isEngineModeLegacy(), false);
    // When v3 is active, canary returns true for everyone
    assertEquals(isEngineModeCanary("user-regular"), true);
    assertEquals(isEngineModeCanary("user-vip-1"), true);
  } finally {
    if (originalMode !== undefined) {
      Deno.env.set("AH_ENGINE_MODE", originalMode);
    } else {
      Deno.env.delete("AH_ENGINE_MODE");
    }
    if (originalCanary !== undefined) {
      Deno.env.set("AH_CANARY_USER_IDS", originalCanary);
    } else {
      Deno.env.delete("AH_CANARY_USER_IDS");
    }
  }
});
