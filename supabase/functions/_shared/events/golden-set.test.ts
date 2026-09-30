import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { GOLDEN_SET } from "./golden-set.ts";
import { HOLDOUT_SET } from "./holdout-set.ts";
import { resolveEvent } from "./resolve-event-category.ts";
import type { EventCategoryId } from "./event-categories.ts";

Deno.test("Stage B Baseline: Golden Set integrity and size check", () => {
  assertEquals(GOLDEN_SET.length >= 190, true, "Golden set must contain ~200 events");
  assertEquals(HOLDOUT_SET.length >= 50, true, "Holdout set must contain 50 events");

  // Verify all categories A through J are represented
  const allCategories: EventCategoryId[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
  for (const cat of allCategories) {
    const count = GOLDEN_SET.filter((c) => c.expectedCategory === cat).length;
    assertEquals(count >= 15, true, `Category ${cat} must have at least 15 golden cases (found ${count})`);
  }
});

Deno.test("Stage B Baseline: Record today's classifier accuracy against Golden Set", () => {
  let categoryMatches = 0;
  let subtypeMatches = 0;
  const categoryStats: Record<string, { total: number; correctCat: number; correctSub: number }> = {};

  const mismatches: Array<{
    id: string;
    title: string;
    expected: string;
    actual: string | null;
    expectedSub?: string | null;
    actualSub?: string | null;
  }> = [];

  for (const item of GOLDEN_SET) {
    const stats = categoryStats[item.expectedCategory] ?? { total: 0, correctCat: 0, correctSub: 0 };
    stats.total++;

    const resolved = resolveEvent({
      id: item.id,
      title: item.title,
      description: item.description,
      location: item.location,
    });

    const catOk = resolved.categoryId === item.expectedCategory;
    const subOk = !item.expectedSubtype || resolved.subtype?.id === item.expectedSubtype;

    if (catOk) {
      categoryMatches++;
      stats.correctCat++;
    } else {
      mismatches.push({
        id: item.id,
        title: item.title,
        expected: item.expectedCategory,
        actual: resolved.categoryId,
        expectedSub: item.expectedSubtype,
        actualSub: resolved.subtype?.id,
      });
    }

    if (subOk) {
      subtypeMatches++;
      stats.correctSub++;
    }

    categoryStats[item.expectedCategory] = stats;
  }

  const catAccuracy = (categoryMatches / GOLDEN_SET.length) * 100;
  const subAccuracy = (subtypeMatches / GOLDEN_SET.length) * 100;

  console.log("\n=======================================================");
  console.log(`STAGE B BASELINE ACCURACY REPORT (Golden Set N=${GOLDEN_SET.length})`);
  console.log(`Overall Category Accuracy: ${catAccuracy.toFixed(1)}% (${categoryMatches}/${GOLDEN_SET.length})`);
  console.log(`Overall Subtype Accuracy:  ${subAccuracy.toFixed(1)}% (${subtypeMatches}/${GOLDEN_SET.length})`);
  console.log("-------------------------------------------------------");
  for (const [cat, s] of Object.entries(categoryStats).sort()) {
    const pct = ((s.correctCat / s.total) * 100).toFixed(0);
    console.log(`Category ${cat}: ${pct}% (${s.correctCat}/${s.total})`);
  }
  console.log("-------------------------------------------------------");
  console.log(`Initial Mismatches: ${mismatches.length}`);
  for (const m of mismatches.slice(0, 10)) {
    console.log(`  [${m.id}] "${m.title}" -> Exp: ${m.expected} | Got: ${m.actual}`);
  }
  if (mismatches.length > 10) {
    console.log(`  ... and ${mismatches.length - 10} more`);
  }
  console.log("=======================================================\n");

  // In Stage B, we establish and record this baseline without breaking tests.
  // Stage C will optimize the classifier to target >90% category accuracy.
  assertEquals(GOLDEN_SET.length > 0, true);
});
