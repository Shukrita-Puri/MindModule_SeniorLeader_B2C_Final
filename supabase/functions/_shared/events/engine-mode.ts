// Engine switching mode for A–J taxonomy upgrade (Spec §13, §14)
//
// Environment variable: `AH_ENGINE_MODE`
// - "legacy": today's cascade / behaviour.
// - "shadow": both paths run; users see today's result, and the new result
//             goes to the parity log and structured logs.
// - "v3_canary": the new result is used for an allow-list of users.
// - "v3": the new result is used for everyone.

export type EngineMode = "legacy" | "shadow" | "v3_canary" | "v3";

export function getEngineMode(): EngineMode {
  try {
    const envVal = (Deno.env.get("AH_ENGINE_MODE") ?? "legacy").toLowerCase().trim();
    if (envVal === "shadow" || envVal === "v3_canary" || envVal === "v3" || envVal === "legacy") {
      return envVal as EngineMode;
    }
  } catch {
    return "legacy";
  }
  return "legacy";
}

export function isEngineModeLegacy(): boolean {
  return getEngineMode() === "legacy";
}

export function isEngineModeShadow(): boolean {
  return getEngineMode() === "shadow";
}

export function isEngineModeV3(): boolean {
  return getEngineMode() === "v3";
}

export function isEngineModeCanary(userId?: string | null): boolean {
  try {
    const mode = getEngineMode();
    if (mode === "v3") return true;
    if (mode !== "v3_canary") return false;
    if (!userId) return false;

    // Read comma-separated allow-list from environment
    const canaryList = (Deno.env.get("AH_CANARY_USER_IDS") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    return canaryList.includes(userId.toLowerCase());
  } catch {
    return false;
  }
}
