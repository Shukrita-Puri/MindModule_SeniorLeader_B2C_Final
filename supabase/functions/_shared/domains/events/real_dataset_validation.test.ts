// [KIND: test] [LAYER: 1] [TIERS: 0-3] [AUDIENCE: universal]
// Full Real-Event Validation against Shukrita's labeled calendar dataset.
// Source: UPDATED -shukrita_real_calendar_events_labelled.csv

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveEvent } from "./classifier.ts";
import type { CompanyContextProfile } from "../relationships/types.ts";

const CSV_PATH = "/Users/manojkumar/Downloads/October Shadow Work 2/2- PART 2 - LAYERS/2b- Layer 1 · Demand (A–J)/3- Calendar Event Labelling and Learning /UPDATED -shukrita_real_calendar_events_labelled.csv";

const shukritaContext: CompanyContextProfile = {
  userId: "shukrita_puri",
  userOrgDomain: "mindmodule.me",
  sectorsSoldTo: ["education", "schools"],
  partners: [],
  investors: ["acme_ventures"],
  declaredDomains: ["mindmodule.me"],
};

interface LabeledRow {
  index: number;
  id: string;
  title: string;
  durationMinutes: number;
  isRecurring: boolean;
  attendeesCount: number;
  attendeeDomains: string[];
  location: string;
  expectedCategory: string;
  expectedSubtype: string;
  difficulty: string;
  notes: string;
  duplicateOfIndex?: string;
}

function parseCsv(text: string): LabeledRow[] {
  const lines = text.split("\n");
  const rows: LabeledRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple regex parse for CSV with quoted fields
    const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
    // Alternatively parse character by character to handle quotes cleanly
    const cols: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cols.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cols.push(current.trim());

    if (cols.length < 19) continue;

    const idx = parseInt(cols[0], 10);
    const id = cols[1];
    const title = cols[2].replace(/^"|"$/g, "").replace(/""/g, '"');
    const durationMinutes = parseInt(cols[4], 10) || 60;
    const isRecurring = cols[5] === "true";
    const attendeesCount = parseInt(cols[6], 10) || 0;
    const attendeeDomains = cols[7] ? cols[7].replace(/^"|"$/g, "").split(";").map((s) => s.trim()) : [];
    const location = cols[8] ? cols[8].replace(/^"|"$/g, "") : "";
    const expectedCategory = cols[17] ? cols[17].replace(/^"|"$/g, "").trim() : "";
    const expectedSubtype = cols[18] ? cols[18].replace(/^"|"$/g, "").trim() : "";
    const difficulty = cols[19] ? cols[19].replace(/^"|"$/g, "").trim() : "medium";
    const notes = cols[20] ? cols[20].replace(/^"|"$/g, "") : "";
    const duplicateOf = cols[25] ? cols[25].replace(/^"|"$/g, "").trim() : undefined;

    if (expectedCategory && expectedCategory.length === 1) {
      rows.push({
        index: idx,
        id,
        title,
        durationMinutes,
        isRecurring,
        attendeesCount,
        attendeeDomains,
        location,
        expectedCategory,
        expectedSubtype,
        difficulty,
        notes,
        duplicateOfIndex: duplicateOf,
      });
    }
  }

  return rows;
}

const CSV_AVAILABLE = (() => {
  try { Deno.statSync(CSV_PATH); return true; } catch { return false; }
})();

Deno.test({ name: "Events Domain: Evaluation across full Shukrita labeled dataset", ignore: !CSV_AVAILABLE }, async () => {
  const content = await Deno.readTextFile(CSV_PATH);
  const rows = parseCsv(content);
  assertNotEquals(rows.length, 0, "Labeled dataset must not be empty");

  let correctCount = 0;
  let totalEvaluated = 0;
  const mismatches: Array<{ title: string; expected: string; actual: string; notes: string }> = [];

  for (const row of rows) {
    const rawEvent = {
      id: row.id,
      title: row.title,
      durationMinutes: row.durationMinutes,
      isRecurring: row.isRecurring,
      attendees_count: row.attendeesCount,
      location: row.location,
      attendees: row.attendeeDomains.map((d) => ({ email: `contact@${d}`, domain: d })),
    };

    const resolved = resolveEvent(rawEvent, { userContext: shukritaContext });
    totalEvaluated++;

    if (resolved.categoryId === row.expectedCategory) {
      correctCount++;
    } else {
      mismatches.push({
        title: row.title,
        expected: row.expectedCategory,
        actual: resolved.categoryId ?? "null",
        notes: row.notes,
      });
    }
  }

  const accuracy = (correctCount / totalEvaluated) * 100;
  console.log(`\n============================================================`);
  console.log(`REAL-EVENT VALIDATION REPORT`);
  console.log(`Evaluated events: ${totalEvaluated}`);
  console.log(`Correct: ${correctCount}`);
  console.log(`Accuracy: ${accuracy.toFixed(1)}%`);
  console.log(`Mismatches: ${mismatches.length}`);
  if (mismatches.length > 0) {
    console.log(`ALL MISMATCHES (${mismatches.length}):`);
    for (const m of mismatches) {
      console.log(`"${m.title}" -> Expected ${m.expected}, Got ${m.actual} | Notes: ${m.notes}`);
    }
  }
  console.log(`============================================================\n`);

  // Assert accuracy is high (>85%)
  assertEquals(accuracy >= 85, true, `Accuracy was ${accuracy.toFixed(1)}%, expected >= 85%`);
});
