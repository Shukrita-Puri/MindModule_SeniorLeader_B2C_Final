/**
 * Fix 2 verification harness.
 *
 * Every WORKED_EXAMPLES / SAFE EXAMPLES body shipped in the Brief system
 * prompt is run through BOTH live gates:
 *
 *   1. `validateV61Output` — the inline closure in index.ts. It is NOT
 *      re-implemented here: the exact source range (constants + function) is
 *      sliced out of index.ts at test time and evaluated, with the request
 *      scope it closes over supplied as a fixture. If the live rules change,
 *      this test picks the change up automatically.
 *   2. `validateBrief` — the atomic validator in _shared/brief-validators.ts.
 *
 * Word-list grep alone cannot catch structural rejections such as
 * `body_restates_phrase`, `body_abstract_system_phrase`, the four-beat
 * structural gate, or the sentence-count ceiling. This harness does.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BODY_FOUR_BEAT_CONTRACT,
  VALIDATOR_ALIGNED_GUARDRAILS,
  WORKED_EXAMPLES,
} from "../_shared/brief/copy-vocabulary.ts";
import {
  buildLexiconRegex,
  INLINE_LEXICON_WORDS,
  LEXICON_ANCHOR_WORDS,
} from "../_shared/brief/elastic-lexicon.ts";
import { validateBrief } from "../_shared/brief-validators.ts";
import { findForbiddenWord } from "../_shared/copy-vocabulary.ts";
import type { BriefContext } from "../_shared/brief-context.ts";

// ---------------------------------------------------------------------------
// Slice the LIVE validator out of index.ts and evaluate it with a fixture scope.
// ---------------------------------------------------------------------------
const INDEX_SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

const START = INDEX_SRC.indexOf("          const WELLNESS_BLACKLIST =");
const FN_START = INDEX_SRC.indexOf("          function validateV61Output(");
assert(START > 0, "could not locate validator constants block in index.ts");
assert(FN_START > START, "could not locate validateV61Output in index.ts");

// Brace-match from the function body's opening brace to its close. The
// declaration carries an inline return-type annotation (`): { valid: ... } {`),
// so the first brace after the parameter list belongs to that type, not the
// body — skip any brace group that is followed by another `{`.
function matchBrace(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return i;
  }
  throw new Error("unbalanced braces while slicing validateV61Output");
}

function sliceFunction(src: string, fnStart: number): string {
  let open = src.indexOf("{", src.indexOf(")", fnStart));
  let close = matchBrace(src, open);
  // Return-type annotation: the next non-space char after it opens the body.
  const after = src.slice(close + 1).match(/^\s*\{/);
  if (after) {
    open = close + after[0].length;
    close = matchBrace(src, open);
  }
  return src.slice(fnStart, close + 1);
}


const CONSTANTS_SRC = INDEX_SRC.slice(START, FN_START);
const FN_SRC = sliceFunction(INDEX_SRC, FN_START);

type Scope = {
  todayHighStakes: string[];
  materialTravelContextActive: boolean;
  materialWorkEventTitles: string[];
  bandValence: "low" | "mid" | "high" | null;
  calendarLoad: "low" | "medium" | "high" | null;
  hour: number;
  divergenceMode: string | null;
};

type V61Result = { valid: boolean; reason: string; softReject?: boolean };

const MATERIAL_TRAVEL_BODY_RX = /\b(flight|travel|airport|trip|journey)\b/i;

// The slice is real TypeScript, so it is written to a temp module next to
// index.ts (same import specifiers resolve) and imported — Deno compiles it.
// No hand-stripping, no re-implementation of any rule.
const MODULE_SRC = `
import {
  buildLexiconRegex,
  INLINE_LEXICON_WORDS,
} from "../_shared/brief/elastic-lexicon.ts";
import { getTimeOfDay } from "../_shared/signal-engine/day-kind-detector.ts";

type Scope = {
  todayHighStakes: string[];
  materialTravelContextActive: boolean;
  materialWorkEventTitles: string[];
  bandValence: "low" | "mid" | "high" | null;
  calendarLoad: "low" | "medium" | "high" | null;
  hour: number;
  divergenceMode: string | null;
};

export function makeValidator(scope: Scope) {
  const {
    todayHighStakes,
    materialTravelContextActive,
    materialWorkEventTitles,
    bandValence,
    calendarLoad,
    hour,
    divergenceMode,
  } = scope;
  const MATERIAL_TRAVEL_BODY_RX = ${MATERIAL_TRAVEL_BODY_RX.toString()};
${CONSTANTS_SRC}
${FN_SRC}
  return validateV61Output;
}
`;

const TMP_URL = new URL("./__v61_slice.gen.test-only.ts", import.meta.url);
await Deno.writeTextFile(TMP_URL, MODULE_SRC);
const { makeValidator } = await import(TMP_URL.href + `?t=${Date.now()}`);
globalThis.addEventListener("unload", () => {
  try {
    Deno.removeSync(TMP_URL);
  } catch { /* already gone */ }
});

function runV61(
  phrase: string,
  body: string,
  scope: Partial<Scope> = {},
): V61Result {
  const full: Scope = {
    todayHighStakes: [],
    materialTravelContextActive: false,
    materialWorkEventTitles: [],
    bandValence: null,
    calendarLoad: "medium",
    hour: 9,
    divergenceMode: null,
    ...scope,
  };
  const validate = makeValidator(full);

  return validate(
    {
      phrase,
      body,
      leanOn: [{ signal: "Post-board composure", source: "PATTERN" }],
      watchFor: [{ signal: "Spending early", source: "PATTERN" }],
    },
    phrase,
    body,
  );
}

// ---------------------------------------------------------------------------
// Atomic validator fixture.
// ---------------------------------------------------------------------------
function briefCtx(): BriefContext {
  return {
    signals: {
      hrvDeviationPct: -8,
      sleepHours: 6.5,
      sleepDeviationPct: -10,
      rhrDeviationPct: 4,
      hrElevatedProxy: false,
      emotionalSelfDeclared: 3,
      mentalSharpness: 3,
      confidence: 3,
      highStakesEventInNext24h: true,
      emotionalDrainEventInNext4h: false,
    },
    behaviourFlags: [],
  } as unknown as BriefContext;
}

// ---------------------------------------------------------------------------
// Parse the examples out of the prompt strings.
// ---------------------------------------------------------------------------
type Example = { label: string; phrase: string; body: string; hour: number };

function parseExamples(): Example[] {
  const out: Example[] = [];
  const lines = WORKED_EXAMPLES.split("\n");
  let label = "";
  let phrase = "";
  for (const line of lines) {
    if (line.startsWith("EXAMPLE ")) label = line.trim();
    const p = line.match(/^phrase:\s*"(.+)"\s*$/);
    if (p) phrase = p[1];
    const b = line.match(/^body:\s*"(.+)"\s*$/);
    if (b) {
      const lower = label.toLowerCase();
      const hour = lower.includes("evening") ? 20 : lower.includes("afternoon") ? 14 : 9;
      out.push({ label, phrase, body: b[1], hour });
    }
  }
  // SAFE EXAMPLES block inside the guardrails string.
  const safe = VALIDATOR_ALIGNED_GUARDRAILS.match(
    /- phrase: "(.+)"\n\s+body: "(.+)"/,
  );
  if (safe) {
    out.push({
      label: "SAFE EXAMPLE",
      phrase: safe[1],
      body: safe[2],
      hour: 9,
    });
  }
  return out;
}

const EXAMPLES = parseExamples();

Deno.test("all prompt examples were parsed", () => {
  assertEquals(EXAMPLES.length, 12, `parsed: ${EXAMPLES.map((e) => e.label).join(" | ")}`);
});

for (const ex of EXAMPLES) {
  Deno.test(`[${ex.label}] passes the live validateV61Output`, () => {
    const r = runV61(ex.phrase, ex.body, { hour: ex.hour });
    assert(r.valid, `rejected: ${r.reason}\nbody: ${ex.body}`);
  });

  Deno.test(`[${ex.label}] passes the atomic validateBrief`, () => {
    const r = validateBrief(ex.phrase, ex.body, briefCtx());
    assert(r.ok, `rejected: ${r.reason}\nbody: ${ex.body}`);
  });

  Deno.test(`[${ex.label}] contains no forbidden word`, () => {
    for (const text of [ex.phrase, ex.body]) {
      const w = findForbiddenWord(text);
      assertEquals(w, null, `forbidden word "${w}" in: ${text}`);
    }
  });

  Deno.test(`[${ex.label}] is exactly 3 sentences`, () => {
    const sentences = ex.body.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
    assertEquals(sentences.length, 3, ex.body);
  });
}

Deno.test("BODY_FOUR_BEAT_CONTRACT states the exactly-3-sentence rule", () => {
  assert(BODY_FOUR_BEAT_CONTRACT.includes("exactly 3 short human sentences"));
  assert(!BODY_FOUR_BEAT_CONTRACT.includes("3–5 short human sentences"));
  assert(
    !BODY_FOUR_BEAT_CONTRACT.includes(
      "Never merge beats into one long sentence with semicolons",
    ),
  );
});

Deno.test("prompt lexicon anchor words satisfy BOTH validators", () => {
  const inlineRegexes = [
    buildLexiconRegex(INLINE_LEXICON_WORDS.cognition),
    buildLexiconRegex(INLINE_LEXICON_WORDS.physiology),
    buildLexiconRegex(INLINE_LEXICON_WORDS.resilience),
  ];
  for (const [cluster, words] of Object.entries(LEXICON_ANCHOR_WORDS)) {
    assert(words.length > 0, `${cluster} anchor list is empty`);
    for (const w of words) {
      assert(
        inlineRegexes.some((re) => re.test(w)),
        `"${w}" (${cluster}) is advertised in the prompt but the inline validator rejects it`,
      );
    }
  }
});
