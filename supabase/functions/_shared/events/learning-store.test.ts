import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  extractDistinctiveTokens,
  lookupLearned,
  normaliseTitleKey,
  type LearningContext,
} from "./learning-store.ts";
import { classifyEventV2 } from "./classify-event-v2.ts";
import { enrichEvent } from "./enrich-event.ts";

function ctx(
  titles: Record<string, string> = {},
  tokens: Record<string, string> = {},
): LearningContext {
  const c: LearningContext = { titles: new Map(), tokens: new Map() };
  for (const [k, v] of Object.entries(titles)) {
    c.titles.set(k, {
      category: v as any,
      subcategory: null,
      subtypeId: null,
      confidence: "high",
      source: "user_override",
      via: "confirmed_title",
    });
  }
  for (const [k, v] of Object.entries(tokens)) {
    c.tokens.set(k, {
      category: v as any,
      subcategory: null,
      subtypeId: null,
      confidence: "medium",
      source: "token_generalisation",
      via: "learned_token",
    });
  }
  return c;
}

Deno.test("normaliseTitleKey strips punctuation and case", () => {
  assertEquals(normaliseTitleKey("Stay: DoubleTree — NYC!"), "stay doubletree nyc");
});

Deno.test("extractDistinctiveTokens drops short/numeric/stopwords", () => {
  assertEquals(
    extractDistinctiveTokens("Weekly AI Forum with Team 2026"),
    ["forum"],
  );
});

Deno.test("confirmed title beats learned token", () => {
  const c = ctx({ "yoshoku dinner": "H" }, { yoshoku: "G" });
  assertEquals(lookupLearned(c, "Yoshoku Dinner")?.category, "H");
  assertEquals(lookupLearned(c, "Yoshoku Dinner")?.via, "confirmed_title");
});

Deno.test("learned token generalises to new titles", () => {
  const c = ctx({}, { doubletree: "G" });
  const hit = lookupLearned(c, "Stay: DoubleTree Manchester");
  assertEquals(hit?.category, "G");
  assertEquals(hit?.via, "learned_token");
});

Deno.test("empty stores degrade to dictionary", () => {
  assertEquals(lookupLearned(ctx(), "Board Meeting"), null);
  assertEquals(enrichEvent({ title: "Board Meeting", learned: ctx() }).categoryId, "A");
});

Deno.test("resolver reads the learning layers", () => {
  const c = ctx({ "quarterly supper club": "H" }, { yoshoku: "H" });
  const r1 = classifyEventV2({ title: "Quarterly Supper Club", learned: c });
  assertEquals(r1.category, "H");
  assertEquals(r1.resolvedBy, "layer1_confirmed_title");
  const r2 = classifyEventV2({ title: "Yoshoku tasting", learned: c });
  assertEquals(r2.category, "H");
  assertEquals(r2.resolvedBy, "layer2_learned_token");
});

Deno.test("explicit user tags still outrank learning", () => {
  const c = ctx({ "town hall": "H" });
  const r = classifyEventV2({ title: "Town Hall", userTags: ["all-hands"], learned: c });
  assertEquals(r.category, "C");
  assertEquals(r.resolvedBy, "layer1_tags");
});

Deno.test("enrichEvent applies learned category override", () => {
  const c = ctx({ "national day": "H" });
  assertEquals(enrichEvent({ title: "National Day", learned: c }).categoryId, "H");
});