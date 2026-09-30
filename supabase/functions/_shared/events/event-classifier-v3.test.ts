import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { GOLDEN_SET } from "./golden-set.ts";
import { classifyEventV3 } from "./event-classifier-v3.ts";
import { buildCanonicalItemFromRaw } from "./spine-contracts.ts";

Deno.test("Stage C: Evaluate classifyEventV3 accuracy against Golden Set (N=220)", () => {
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

    const canonical = buildCanonicalItemFromRaw({
      id: item.id,
      title: item.title,
      description: item.description,
      location: item.location,
      durationMinutes: item.durationMinutes,
      isRecurring: item.isRecurring,
      attendees: item.attendees,
    });

    const stamp = classifyEventV3({ item: canonical });

    const catOk = stamp.category === item.expectedCategory;
    const subOk = !item.expectedSubtype || stamp.subtype === item.expectedSubtype;

    if (catOk) {
      categoryMatches++;
      stats.correctCat++;
    } else {
      mismatches.push({
        id: item.id,
        title: item.title,
        expected: item.expectedCategory,
        actual: stamp.category,
        expectedSub: item.expectedSubtype,
        actualSub: stamp.subtype,
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
  console.log(`STAGE C: V3 CLASSIFIER ACCURACY REPORT (Golden Set N=${GOLDEN_SET.length})`);
  console.log(`Overall Category Accuracy: ${catAccuracy.toFixed(1)}% (${categoryMatches}/${GOLDEN_SET.length})`);
  console.log(`Overall Subtype Accuracy:  ${subAccuracy.toFixed(1)}% (${subtypeMatches}/${GOLDEN_SET.length})`);
  console.log("-------------------------------------------------------");
  for (const [cat, s] of Object.entries(categoryStats).sort()) {
    const pct = ((s.correctCat / s.total) * 100).toFixed(0);
    console.log(`Category ${cat}: ${pct}% (${s.correctCat}/${s.total})`);
  }
  console.log("=======================================================\n");

  if (mismatches.length > 0) {
    console.log(`\nALL MISMATCHES (${mismatches.length} total):`);
    for (const m of mismatches) {
      console.log(`- [${m.id}] "${m.title}" -> exp: ${m.expected} (${m.expectedSub}), got: ${m.actual} (${m.actualSub})`);
    }
  }

  // Expect substantial improvement over Stage B's 56.8%
  assertEquals(catAccuracy >= 85, true, `Category accuracy must exceed 85% (got ${catAccuracy.toFixed(1)}%)`);
});
