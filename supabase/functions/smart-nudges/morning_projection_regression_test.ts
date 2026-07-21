import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("ready plan snapshot morning projection preserves legacy route after check-in", () => {
  assert(
    /deepLinkRoute:\s*activeSlot === ["']morning["'] && anchorKind === ["']jit["'] &&[\s\S]*ctx\.morningCheckinOutcome !== null[\s\S]*\?\s*["']\/executive-home["']\s*:\s*["']\/daily-check-in["']/.test(
      SRC,
    ),
    "projected morning JIT must route checked-in users to /executive-home",
  );
});

Deno.test("ready plan snapshot morning state projection is suppressed after morning check-in", () => {
  assert(
    /if \(activeSlot === ["']morning["']\)\s*\{\s*if \(ctx\.morningCheckinOutcome !== null\) return null;/.test(
      SRC,
    ),
    "projected morning state nudge must stop once morning check-in exists",
  );
});

Deno.test("ready plan snapshot morning projection reuses legacy timing window", () => {
  assert(
    SRC.includes("function isWithinMorningAnchorWindow("),
    "expected shared morning timing helper",
  );
  assert(
    SRC.includes("if (!isWithinMorningAnchorWindow(ctx)) return null;"),
    "projected morning state path must enforce the same morning window as legacy nudge one",
  );
});

Deno.test("ready plan snapshot morning JIT projection keeps legacy safety gates", () => {
  assert(
    SRC.includes("async function shouldAllowProjectedMorningJit("),
    "expected dedicated projected-morning JIT gate helper",
  );
  for (const needle of [
    "if (!matchingJit) return false;",
    'if (matchingJit.confidenceBand === "none") return false;',
    "if (sentEventRefs.has(matchingJit.externalId)) return false;",
    "if (suppressJitForNotificationOnlyCategory(slotEventTitle)) return false;",
    '.from("jit_event_context")',
    '.from("daily_ritual_completions")',
  ]) {
    assert(SRC.includes(needle), `missing projected morning JIT safeguard: ${needle}`);
  }
  assert(
    /if \(minutesUntil === null \|\| minutesUntil < 30 \|\| minutesUntil > 180\)\s*\{\s*return false;\s*\}/.test(
      SRC,
    ),
    "missing projected morning JIT safeguard: minutesUntil window check",
  );
});
