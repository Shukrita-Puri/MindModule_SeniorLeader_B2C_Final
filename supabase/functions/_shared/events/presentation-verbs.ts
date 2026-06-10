// OWNERSHIP: engineering. Lexicon of presentation-shaped verbs used by
// classify-event-v2 Layer 2. When the user is the organizer AND the title
// contains one of these verbs, the event is routed to vis.* regardless of
// what the v1 dictionary said. Pure data, no IO.

export const PRESENTATION_VERB_TOKENS: string[] = [
  'present','presentation','presenting',
  'pitch','pitching',
  'demo','demoing',
  'showcase','showcasing','reveal','unveil',
  'keynote',
  'address','update to','briefing to','brief to',
  'walk through','walkthrough','walk-through',
  'announce','announcement',
  'talk:','talk ','speak to','speaking to',
  'fireside','panel',
  'launch:','launch ',
];

const VERB_BOUNDARY_RE = new RegExp(
  '(^|\\W)(' + PRESENTATION_VERB_TOKENS
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|') + ')',
  'i',
);

export function hasPresentationVerb(title: string | null | undefined): boolean {
  if (!title) return false;
  return VERB_BOUNDARY_RE.test(title);
}