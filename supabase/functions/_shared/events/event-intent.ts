// OWNERSHIP: engineering. Intent layer for the A–H resolver.
//
// Answers exactly ONE question, and nothing else:
//
//   Is the user IN the room, or CONSUMING CONTENT about the room?
//
// "Why Investor Comms are so Important" is a talk about investor relations —
// it is not an investor meeting. Without this layer the dictionary sees the
// token `investor` and routes it to A / gov.investor_meeting, which then
// anchors the Brief, the Plan and the day's load shape on a webinar.
//
// Deliberately narrow. It never assigns a category other than E
// (str.learning), and it defers to user tags and the learning store, which
// run before it. Everything else stays with the existing layers.
//
// HARD RULE: attendee counts are NEVER used. Audience size carries no
// correlation with event importance and must not influence classification.

/** Title shapes that mark an event as content ABOUT a topic. */
const CONTENT_TITLE_MARKERS: RegExp[] = [
  /^\s*why\b/i,                     // "Why Investor Comms are so Important"
  /^\s*how\s+to\b/i,                // "How to run a board process"
  /^\s*what\s+(every|you|the|new)\b/i,
  /\bthe\s+importance\s+of\b/i,
  /\bso\s+important\b/i,
  /\bmasterclass\b/i,
  /\bwebinar\b/i,
  /\bfireside\b/i,
  /\bpanel\s+(discussion|session)\b|\bpanel\b/i,
  /\bAMA\b/,
  /\bbootcamp\b/i,
  /\b101\b/,
  /\bdeep\s+dive\s+(on|into)\b/i,
  /\blessons\s+(from|learned)\b/i,
  /\bexplained\b/i,
  /\bintroduction\s+to\b/i,
  /\bfundamentals\s+of\b/i,
  /\bguide\s+to\b/i,
  /\btraining\s+session\b/i,
];

/**
 * Counter-markers: the user is genuinely in the room. Any single one of
 * these vetoes the intent layer and hands the title back to the normal
 * layers (dictionary, acronym, roles).
 */
const COUNTER_MARKERS: RegExp[] = [
  /\[[^\]]+\]/,                     // "[Sequoia VC] - Term Sheet Sign off"
  /\bterm\s+sheet\b/i,
  /\bsign[-\s]?off\b/i,
  /\bdue\s+diligence\b/i,
  /\bdata\s?room\b/i,
  /\bboard\s+(meeting|pack|papers)\b/i,
  /\bAGM\b/,
  /\b1\s*:\s*1\b/,
  /\bone[-\s]on[-\s]one\b/i,
  /\bnegotiation\b/i,
  /\bcontract\b/i,
  /\boffer\b/i,
  /\bappraisal\b/i,
  /\bperformance\s+review\b/i,
];

/** Structural markers read from provider metadata. No attendee counts. */
const REGISTRATION_URL_RE =
  /(eventbrite|lu\.ma|luma|hopin|zoom\.us\/webinar|on24|gotowebinar|livestorm|crowdcast|streamyard|register|registration|rsvp)/i;

export interface ContentIntentInput {
  title: string;
  eventMetadata?: Record<string, unknown> | null;
  /** Present only as a tie-break. Never evidence of importance. */
  isOrganizer?: boolean | null;
}

export interface ContentIntentResult {
  /** True when the event is content ABOUT a topic, not the room itself. */
  isContent: boolean;
  /** Human-readable cues, surfaced for diagnostics and the parity log. */
  markers: string[];
  counterMarkers: string[];
}

function metadataText(meta: Record<string, unknown> | null | undefined): string {
  if (!meta || typeof meta !== "object") return "";
  try {
    return JSON.stringify(meta).slice(0, 4000);
  } catch (_err) {
    return "";
  }
}

/**
 * Pure. Two or more content markers, and zero counter-markers, means the
 * event is content. One marker alone is never enough — that threshold is
 * what keeps "Board meeting: 101 Ltd" out of the learning bucket.
 */
export function detectContentIntent(input: ContentIntentInput): ContentIntentResult {
  const title = (input.title ?? "").trim();
  const empty: ContentIntentResult = { isContent: false, markers: [], counterMarkers: [] };
  if (!title) return empty;

  const counterMarkers: string[] = [];
  for (const re of COUNTER_MARKERS) {
    if (re.test(title)) counterMarkers.push(re.source);
  }

  const markers: string[] = [];
  for (const re of CONTENT_TITLE_MARKERS) {
    if (re.test(title)) markers.push(re.source);
  }

  // Structural markers (metadata only — never attendee counts).
  const metaText = metadataText(input.eventMetadata);
  if (metaText && REGISTRATION_URL_RE.test(metaText)) markers.push("registration_link");
  const recurrence = input.eventMetadata?.["recurrence"] ??
    input.eventMetadata?.["recurring_event_id"] ??
    input.eventMetadata?.["recurringEventId"];
  const isPublicSeries = !!recurrence && markers.length > 0;
  if (isPublicSeries) markers.push("recurring_series");

  if (counterMarkers.length > 0) {
    return { isContent: false, markers, counterMarkers };
  }

  // Organiser flag is a tie-break only: it can lift a single-marker title to
  // content when the user did not create the event, and it can never on its
  // own make something content.
  const effective = markers.length + (markers.length >= 1 && input.isOrganizer === false ? 1 : 0);

  return { isContent: effective >= 2, markers, counterMarkers };
}
