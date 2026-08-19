// CI contract: every brief-scoped behaviour rule must have deterministic copy.
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { missingCopyEntries } from "./behaviour-copy.ts";
import { ALL_RULES } from "../../ceo-behaviour/index.ts";

Deno.test("contract: all brief-scoped rules have deterministic copy", () => {
  const missing = missingCopyEntries(
    ALL_RULES.map((r) => ({
      rule: String(r.id ?? r.fn.name),
      scopes: r.scopes as string[],
    })),
  );
  assertEquals(missing, []);
});
