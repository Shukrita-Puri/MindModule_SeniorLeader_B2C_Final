import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("checkin_save mode is accepted and normalized to manual_refresh", () => {
  assertStringIncludes(SRC, 'type BuildModeInput = BuildMode | "checkin_save";');
  assertStringIncludes(SRC, 'if (mode === "checkin_save") return "manual_refresh";');
  assertStringIncludes(SRC, 'const requestedMode = (body.mode ?? "scheduled") as BuildModeInput;');
  assertStringIncludes(SRC, "const mode = normalizeBuildMode(requestedMode);");
});
