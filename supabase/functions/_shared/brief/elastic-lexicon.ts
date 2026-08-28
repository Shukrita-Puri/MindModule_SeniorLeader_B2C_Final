// OWNERSHIP: engineering. SINGLE SOURCE OF TRUTH for the Elastic Lexicon
// (§2.20) word lists.
//
// Three consumers used to maintain their own copy of these words and drifted
// apart, which produced ~81 `body_no_lexicon_cluster` rejections per week:
//
//   1. `_shared/copy-vocabulary.ts`  → ELASTIC_LEXICON / detectCluster(),
//      used by the atomic validator (`validateBody` in brief-validators.ts)
//      and by the deterministic brief builder.
//   2. `compute-outer-readiness/index.ts` → the inline LEXICON_COGNITION /
//      LEXICON_PHYSIOLOGY / LEXICON_RESILIENCE / LEXICON_EXECUTIVE_CONTEXT
//      regexes inside `validateV61Output`.
//   3. `_shared/brief/copy-vocabulary.ts` → the "LEXICON ANCHOR" block the
//      LLM prompt shows the model.
//
// All three now read from this module. NO validator logic and NO threshold
// changes: the regexes below are byte-equivalent alternations of the lists
// they replaced.
//
// This is a LEAF module — it must not import from `../copy-vocabulary.ts` or
// `./copy-vocabulary.ts`, otherwise the re-export chain becomes a cycle.

import type { PillarCluster } from "../brief-context.ts";

/**
 * §2.20 Elastic Lexicon — three pillar clusters. `detectCluster()` in
 * `_shared/copy-vocabulary.ts` matches these as case-insensitive substrings.
 */
export const ELASTIC_LEXICON: Record<PillarCluster, string[]> = {
  cognition: [
    "Decision Power",
    "Strategic Accuracy",
    "Mental Bandwidth",
    "Processing Capacity",
    "Solving Logic",
    "Sharpness",
    "Mind",
    "Cognitive",
    "Cognition",
  ],
  physiology: [
    "Operational Drive",
    "Leadership Stamina",
    "Physical Recovery",
    "Physical Runway",
    "Stamina",
    "Body",
    "Physiology",
    "Sleep",
  ],
  resilience: [
    "Strategic Composure",
    "Executive Presence",
    "Diplomatic Shield",
    "Reactive Risk",
    "Internal Buffer",
    "Composure",
    "Buffer",
    "Resilience",
    "Mental Energy",
  ],
};

/**
 * Word lists behind the inline `validateV61Output` lexicon regexes in
 * compute-outer-readiness. Kept verbatim — these are the exact alternations
 * that were previously written inline as regex literals.
 */
export const INLINE_LEXICON_WORDS: Record<
  "cognition" | "physiology" | "resilience" | "executiveContext",
  string[]
> = {
  cognition: [
    "intelligence",
    "cognition",
    "decision power",
    "strategic accuracy",
    "mental bandwidth",
    "processing capacity",
    "solving logic",
    "sharpness",
    "sharp",
    "clarity",
  ],
  physiology: [
    "physiology",
    "operational drive",
    "leadership stamina",
    "physical recovery",
    "physical runway",
    "stamina",
    "drive",
    "restoration",
    "restore",
    "recover",
    "recovery",
    "heart rate",
    "pulse",
    "prepare",
    "preparation",
    "body",
  ],
  resilience: [
    "resilience",
    "stability",
    "strategic composure",
    "executive presence",
    "diplomatic shield",
    "reactive risk",
    "internal buffer",
    "composure",
    "buffer",
    "release",
  ],
  executiveContext: [
    "conference",
    "summit",
    "board",
    "pitch",
    "negotiation",
    "travel",
    "landing",
    "back[- ]to[- ]back",
    "compressed",
    "decisions?",
    "density",
    "re[- ]?entry",
    "offsite",
    "speaking",
    "presentation",
    "high[- ]stakes",
    "governance",
  ],
};

/**
 * Builds the `\b(a|b|c)\b` case-insensitive regex the inline validator used.
 * Entries may already contain regex fragments (e.g. `decisions?`), so they are
 * inserted verbatim — exactly as they appeared in the original literals.
 */
export function buildLexiconRegex(words: string[]): RegExp {
  return new RegExp(`\\b(${words.join("|")})\\b`, "i");
}

/**
 * Words that satisfy BOTH gates a Brief body must clear:
 *   - `detectCluster()` (ELASTIC_LEXICON), enforced by validateBody, AND
 *   - the inline cluster regexes, enforced by validateV61Output.
 *
 * The prompt must only ever advertise words in this intersection. Words that
 * pass just one gate (e.g. "clarity", which is inline-only, or "sleep", which
 * is ELASTIC-only) get the body rejected by the other validator, which is the
 * exact drift this module removes.
 */
export const LEXICON_ANCHOR_WORDS: Record<PillarCluster, string[]> = (() => {
  const out = {} as Record<PillarCluster, string[]>;
  for (const cluster of Object.keys(ELASTIC_LEXICON) as PillarCluster[]) {
    const inline = INLINE_LEXICON_WORDS[cluster].map((w) => w.toLowerCase());
    out[cluster] = ELASTIC_LEXICON[cluster]
      .filter((w) => inline.includes(w.toLowerCase()))
      .map((w) => w.toLowerCase());
  }
  return out;
})();

/**
 * The LEXICON ANCHOR block injected into BODY_FOUR_BEAT_CONTRACT. Derived —
 * never hand-written — so the prompt can never advertise a word the
 * validators reject.
 */
export const LEXICON_ANCHOR_PROMPT_BLOCK =
  `LEXICON ANCHOR: the body MUST contain at least one literal word from one of these three clusters. The word must appear verbatim; a near-synonym or paraphrase will be rejected.
  Cognition: ${LEXICON_ANCHOR_WORDS.cognition.join(", ")}
  Physiology: ${LEXICON_ANCHOR_WORDS.physiology.join(", ")}
  Resilience: ${LEXICON_ANCHOR_WORDS.resilience.join(", ")}
Executive-context words (board, conference, travel, negotiation, governance, presentation) are welcome for grounding but do NOT satisfy this anchor on their own.`;
