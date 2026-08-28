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

// Walk braces from the function body to find its closing brace.
function sliceFunction(src: string, fnStart: number): string {
  const bodyStart = src.indexOf("{", src.indexOf(")", fnStart));
  let depth = 0;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(fnStart, i + 1);
    }
  }
  throw new Error("unbalanced braces while slicing validateV61Output");
}

const CONSTANTS_SRC = INDEX_SRC.slice(START, FN_START);
const FN_SRC = sliceFunction(INDEX_SRC, FN_START);

type Scope = {
  todayHighStakes: string[];
  materialTravelContextActive: boolean;
  materialWorkEventTitles: string[];
  bandValence: "low" | "mid" | "high" | null;
  hour: number;
  divergenceMode: string | null;
};

type V61Result = { valid: boolean; reason: string; softReject?: boolean };

// The sliced source is TypeScript-free at this range apart from the function
// signature's type annotations, which we strip for the Function constructor.
function stripTypes(src: string): string {
  return src
    .replace(
      /function validateV61Output\([\s\S]*?\)\s*:\s*\{[^}]*\}\s*\{/,
      "function validateV61Output(parsed, phraseText, bodyTextStr, opts = {}) {",
    )
    .replace(/\(e: string\)/g, "(e)")
    .replace(/\(items: any\[\], label: string\)/g, "(items, label)")
    .replace(/\(p: string\)/g, "(p)")
    .replace(/\(tok: string\)/g, "(tok)")
    .replace(/\(title: string\)/g, "(title)")
    .replace(/\(token: string\)/g, "(token)")
    .replace(/const ONE_LINE_READS: string\[\]/g, "const ONE_LINE_READS")
    .replace(
      /const _tw: "morning" \| "afternoon" \| "evening"/g,
      "const _tw",
    )
    .replace(/\bconsole\.(log|warn|error)\(/g, "(() => {})(");
}

const factory = new Function(
  "scope",
  "buildLexiconRegex",
  "INLINE_LEXICON_WORDS",
  "MATERIAL_TRAVEL_BODY_RX",
  `
  const { todayHighStakes, materialTravelContextActive, materialWorkEventTitles,
          bandValence, hour, divergenceMode } = scope;
  ${stripTypes(CONSTANTS_SRC)}
  ${stripTypes(FN_SRC)}
  return validateV61Output;
  `,
) as (
  scope: Scope,
  b: typeof buildLexiconRegex,
  w: typeof INLINE_LEXICON_WORDS,
  rx: RegExp,
) => (
  parsed: unknown,
  phrase: string | null,
  body: string | null,
  opts?: { strict?: boolean },
) => V61Result;

const MATERIAL_TRAVEL_BODY_RX = /\b(flight|travel|airport|trip|journey)\b/i;

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
    hour: 9,
    divergenceMode: null,
    ...scope,
  };
  const validate = factory(
    full,
    buildLexiconRegex,
    INLINE_LEXICON_WORDS,
    MATERIAL_TRAVEL_BODY_RX,
  );
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
