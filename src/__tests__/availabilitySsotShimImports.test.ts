/**
 * Availability SSOT — shim-import guard (CI-gated).
 *
 * Fails `npm test` if any file imports availability primitives from a
 * deprecated path. This is the belt-and-suspenders companion to the
 * runtime `console.warn` in the two shim files.
 *
 * Rules:
 *  - Nobody except the shim itself may import from
 *    `_shared/availability/holiday-applicability`.
 *  - The regex + region + applicability symbols must be imported from
 *    `_shared/availability/availability-classifier` — NEVER from
 *    `_shared/ceo-behaviour/pto-holiday` or `holiday-applicability`.
 *
 * Scope: walks `.ts` / `.tsx` under `src/` and `supabase/functions/`.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const REPO_ROOT = process.cwd();
const ROOTS = ["src", "supabase/functions"];

// Files that are ALLOWED to reference the deprecated paths (shims + this test).
const SHIM_ALLOWLIST = new Set(
  [
    "supabase/functions/_shared/availability/holiday-applicability.ts",
    "src/__tests__/availabilitySsotShimImports.test.ts",
  ].map((p) => p.split("/").join(sep)),
);

// Symbols that must come from availability-classifier ONLY.
const CLASSIFIER_ONLY_SYMBOLS = [
  "PTO_TITLE_RX",
  "PERSONAL_HOLIDAY_TITLE_RX",
  "parseHolidayRegionFromTitle",
  "isFyiHolidayCalendar",
  "matchesUserCountry",
  "isApplicableHoliday",
  "RegionToken",
];

// Deprecated source paths (substring match on import specifier).
const DEPRECATED_PATHS = [
  "availability/holiday-applicability",
  "ceo-behaviour/pto-holiday",
];

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
}

interface Violation {
  file: string;
  line: number;
  reason: string;
  snippet: string;
}

function analyze(file: string, source: string): Violation[] {
  const rel = relative(REPO_ROOT, file);
  if (SHIM_ALLOWLIST.has(rel)) return [];

  const violations: Violation[] = [];
  const lines = source.split("\n");

  // Match `import ... from "…path…"` and `from "…path…"` in re-exports.
  const importRx = /(?:import\s+[^;]*?from|export\s+[^;]*?from)\s+["']([^"']+)["']/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;
    importRx.lastIndex = 0;
    while ((m = importRx.exec(line)) !== null) {
      const spec = m[1];

      // (a) direct deprecated path
      if (DEPRECATED_PATHS.some((d) => spec.includes(d))) {
        // Special case: pto-holiday.ts is still allowed as a module import
        // for the non-deprecated predicates (isPtoOrHolidayTitle / etc).
        // We only flag it when it imports one of the deprecated regex
        // symbols. Detect by scanning the import clause.
        const clause = line.slice(0, m.index + m[0].length);
        const importsDeprecatedRegex = /\b(PTO_TITLE_RX|PERSONAL_HOLIDAY_TITLE_RX)\b/.test(clause);
        const isPtoHolidayPath = spec.includes("ceo-behaviour/pto-holiday");

        if (isPtoHolidayPath && !importsDeprecatedRegex) {
          // OK — importing the still-supported predicates.
          continue;
        }
        if (spec.includes("availability/holiday-applicability")) {
          violations.push({
            file: rel,
            line: i + 1,
            reason:
              "imports from deprecated shim `availability/holiday-applicability` — use `availability/availability-classifier`",
            snippet: line.trim(),
          });
          continue;
        }
        if (isPtoHolidayPath && importsDeprecatedRegex) {
          violations.push({
            file: rel,
            line: i + 1,
            reason:
              "imports deprecated regex from `ceo-behaviour/pto-holiday` — use `availability/availability-classifier`",
            snippet: line.trim(),
          });
          continue;
        }
      }
    }
  }

  return violations;
}

describe("availability SSOT — shim-import guard", () => {
  const files: string[] = [];
  for (const r of ROOTS) files.push(...walk(join(REPO_ROOT, r)));

  it("no file outside the shims imports availability primitives from a deprecated path", () => {
    const all: Violation[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      all.push(...analyze(f, src));
    }
    if (all.length > 0) {
      const msg = all
        .map((v) => `  ${v.file}:${v.line} — ${v.reason}\n    ${v.snippet}`)
        .join("\n");
      throw new Error(
        "Availability SSOT shim-import guard failed:\n" +
          msg +
          "\n\nImport availability primitives from " +
          "supabase/functions/_shared/availability/availability-classifier.ts",
      );
    }
    expect(all).toEqual([]);
  });

  it("classifier-only symbols are actually exported from the SSOT", () => {
    const ssot = readFileSync(
      join(REPO_ROOT, "supabase/functions/_shared/availability/availability-classifier.ts"),
      "utf8",
    );
    for (const sym of CLASSIFIER_ONLY_SYMBOLS) {
      const rx = new RegExp(`export\\s+(?:const|function|type)\\s+${sym}\\b`);
      expect(rx.test(ssot), `SSOT missing export: ${sym}`).toBe(true);
    }
  });

  // C2 guard (Path B, pre-launch): the previous `AWAY_KEYWORDS`,
  // `OOO_KEYWORDS`, and `TRAVEL_KEYWORDS` string arrays in
  // `_shared/events/event-classifier.ts` duplicated the SSOT vocabulary and
  // drifted (e.g. informal "day off" / "away" matched C2 but not the SSOT).
  // They have been deleted; `detectDayKindFromEvents` now delegates title
  // classification to `isPtoOrHolidayTitle` + `isTravelTitle`. This guard
  // prevents a re-introduction under `supabase/functions/` outside the
  // canonical vocabularies (SSOT + `_shared/events/event-subtypes.ts`
  // where keyword-per-subtype is the intended, structurally-scoped model).
  it("no parallel PTO / travel / OOO keyword arrays under supabase/functions/", () => {
    const FORBIDDEN_NAMES = ["AWAY_KEYWORDS", "OOO_KEYWORDS", "TRAVEL_KEYWORDS"];
    const allowed = new Set(
      [
        // The SSOT itself and the classifier catalog own their vocabularies.
        "supabase/functions/_shared/availability/availability-classifier.ts",
        "supabase/functions/_shared/events/event-subtypes.ts",
        // This test file references the names in string form.
        "src/__tests__/availabilitySsotShimImports.test.ts",
      ].map((p) => p.split("/").join(sep)),
    );
    const violations: string[] = [];
    for (const f of files) {
      const rel = relative(REPO_ROOT, f);
      if (allowed.has(rel)) continue;
      const src = readFileSync(f, "utf8");
      for (const name of FORBIDDEN_NAMES) {
        const rx = new RegExp(`\\b(?:const|let|var)\\s+${name}\\b`);
        if (rx.test(src)) {
          violations.push(`${rel} declares forbidden \`${name}\` — route through the SSOT`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});