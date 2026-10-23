// [KIND: step] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Step V6 · Hygiene and Text Normalisation.
// Cleans whitespace, smart quotes, unsupported symbols, and trailing artefacts.
// Source: Part 2 Layer 5 (Section 10).

/**
 * Normalises raw text:
 * - Trims and collapses multiple spaces into a single space
 * - Converts curly quotes to straight quotes
 * - Converts em/en dashes with proper spacing
 * - Strips emojis
 */
export function sanitizeCopy(text: string): string {
  if (!text) return "";

  return text
    // Replace smart single and double quotes
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    // Replace em dashes with spaced en dash or hyphen
    .replace(/\u2014/g, " — ")
    // Strip emojis
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}
