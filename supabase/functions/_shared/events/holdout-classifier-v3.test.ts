// Stage D: Evaluate classifyEventV3 against the Holdout Set (N=50)
// Spec §14, Stage D Step 17:
// "Review the differences, tune signatures and weights, and re-score. Tuning uses the golden set only; the holdout is scored at the end."
// "Success measures met on the golden set and the holdout."

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { HOLDOUT_SET } from "./holdout-set.ts";
import { classifyEventV3 } from "./event-classifier-v3.ts";
import { DEFAULT_MIND_MODULE_CONTEXT } from "./relationship-context.ts";

Deno.test("Stage D: Evaluate classifyEventV3 accuracy against Holdout Set (N=50)", () => {
  let correctCategory = 0;
  let correctSubtype = 0;
  const categoryStats: Record<string, { total: number; correctCat: number; correctSub: number }> = {};
  const mismatches: Array<{ id: string; title: string; expectedCat: string; actualCat: string; expectedSub?: string | null; actualSub?: string | null; reasons: string[] }> = [];

  for (const item of HOLDOUT_SET) {
    if (!categoryStats[item.expectedCategory]) {
      categoryStats[item.expectedCategory] = { total: 0, correctCat: 0, correctSub: 0 };
    }
    categoryStats[item.expectedCategory].total++;

    const stamp = classifyEventV3({
      id: item.id,
      title: item.title,
      description: item.description,
      attendees: item.attendees,
      location: item.location,
      durationMinutes: item.durationMinutes,
      isRecurring: item.isRecurring,
    }, { companyContext: DEFAULT_MIND_MODULE_CONTEXT });

    const isCatMatch = stamp.category === item.expectedCategory;
    const isSubMatch = item.expectedSubtype ? stamp.subtype === item.expectedSubtype : true;

    if (isCatMatch) {
      correctCategory++;
      categoryStats[item.expectedCategory].correctCat++;
    } else {
      mismatches.push({
        id: item.id,
        title: item.title,
        expectedCat: item.expectedCategory,
        actualCat: stamp.category ?? "none",
        expectedSub: item.expectedSubtype,
        actualSub: stamp.subtype,
        reasons: stamp.reasons,
      });
    }

    if (isSubMatch) {
      correctSubtype++;
      categoryStats[item.expectedCategory].correctSub++;
    }
  }

  const catAccuracy = (correctCategory / HOLDOUT_SET.length) * 100;
  const subAccuracy = (correctSubtype / HOLDOUT_SET.length) * 100;

  console.log("\n=======================================================");
  console.log(`STAGE D: V3 CLASSIFIER HOLDOUT SET REPORT (N=${HOLDOUT_SET.length})`);
  console.log(`Overall Category Accuracy: ${catAccuracy.toFixed(1)}% (${correctCategory}/${HOLDOUT_SET.length})`);
  console.log(`Overall Subtype Accuracy:  ${subAccuracy.toFixed(1)}% (${correctSubtype}/${HOLDOUT_SET.length})`);
  console.log("-------------------------------------------------------");
  for (const [cat, stats] of Object.entries(categoryStats).sort()) {
    const pct = ((stats.correctCat / stats.total) * 100).toFixed(0);
    console.log(`Category ${cat}: ${pct}% (${stats.correctCat}/${stats.total})`);
  }
  console.log("=======================================================\n");

  if (mismatches.length > 0) {
    console.log("Mismatches on Holdout Set:");
    for (const m of mismatches) {
      console.log(`  [${m.id}] "${m.title}" => Expected ${m.expectedCat}, got ${m.actualCat} (${m.actualSub})`);
      console.log(`     Reasons: ${m.reasons.join("; ")}`);
    }
  }

  // Stage D gate: Category accuracy on unseen holdout set must be at least 95%
  assertEquals(catAccuracy >= 95.0, true, `Holdout category accuracy should be >= 95% (got ${catAccuracy.toFixed(1)}%)`);
});
