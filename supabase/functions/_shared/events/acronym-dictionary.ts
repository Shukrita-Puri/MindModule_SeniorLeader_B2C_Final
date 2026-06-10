// OWNERSHIP: coaching (entries) + engineering (lookup). Token→subtypeId map
// used by classify-event-v2 Layer 5. Each entry resolves to an EXISTING
// subtype id from ./event-subtypes.ts, with one additive exception
// (`gov.nonexec_board`, added in the same patch as v2 land).
//
// REFINE comments mark approximate mappings — refine once the taxonomy
// expands. Do NOT add new subtype rows here; do that in event-subtypes.ts.
//
// Matching is word-boundary aware (case-insensitive). Acronyms that double
// as common English words (e.g. "AGM", "PIP") rely on word-boundary regex
// to avoid spurious hits on "magma" / "pipeline".

export interface AcronymEntry {
  /** Token to match. Lowercased for the lookup; word-boundary enforced. */
  token: string;
  /** Existing EVENT_TYPES.id from event-subtypes.ts. */
  subtypeId: string;
  /** Optional note explaining a near-miss mapping. */
  note?: string;
}

export const ACRONYM_DICTIONARY: AcronymEntry[] = [
  // ── Governance ──
  { token: 'agm',  subtypeId: 'gov.board_meeting' },
  { token: 'egm',  subtypeId: 'gov.board_meeting' },
  { token: 'plc board', subtypeId: 'gov.board_meeting' },
  { token: 'nonexec', subtypeId: 'gov.nonexec_board' },
  { token: 'non-exec', subtypeId: 'gov.nonexec_board' },
  { token: 'ned',  subtypeId: 'gov.nonexec_board' },
  { token: 'audit committee', subtypeId: 'gov.board_committee' },
  { token: 'remco', subtypeId: 'gov.board_committee' },
  { token: 'nomco', subtypeId: 'gov.board_committee' },
  { token: 'qbr',  subtypeId: 'gov.qbr' },
  { token: 'mbr',  subtypeId: 'gov.qbr',
    note: 'Monthly business review — closest existing match' },
  { token: 'obr',  subtypeId: 'gov.qbr',
    note: 'Operational business review — closest existing match' },
  { token: 'opex review', subtypeId: 'gov.budget_review' },
  { token: 'forecast review', subtypeId: 'gov.budget_review' },
  { token: 'p&l review', subtypeId: 'gov.budget_review' },
  { token: 'm&a',  subtypeId: 'gov.ma_discussion' },
  { token: 'lbo',  subtypeId: 'gov.ma_discussion',
    note: 'Leveraged buyout discussion — routed to M&A' },
  { token: 'dd ',  subtypeId: 'gov.ma_discussion',
    note: 'Due diligence' },

  // ── Influence ──
  { token: 'rfp',  subtypeId: 'inf.client_presentation' },
  { token: 'rfi',  subtypeId: 'inf.client_presentation' },
  { token: 'sow',  subtypeId: 'inf.negotiation',
    note: 'Statement of work — usually a negotiation context' },
  { token: 'msa',  subtypeId: 'inf.negotiation',
    note: 'Master service agreement' },
  { token: 'lp meeting', subtypeId: 'gov.investor_meeting' },
  { token: 'lp update', subtypeId: 'gov.investor_meeting' },
  { token: 'series a', subtypeId: 'inf.fundraising' },
  { token: 'series b', subtypeId: 'inf.fundraising' },
  { token: 'series c', subtypeId: 'inf.fundraising' },
  { token: 'term sheet', subtypeId: 'inf.fundraising' },

  // ── Visibility ──
  { token: 'townhall', subtypeId: 'vis.all_hands' },
  { token: 'town hall', subtypeId: 'vis.all_hands' },
  { token: 'all-hands', subtypeId: 'vis.all_hands' },
  { token: 'ama',  subtypeId: 'vis.all_hands',
    note: 'Ask-me-anything — broadcast format' },

  // ── People ──
  { token: '1:1',  subtypeId: 'lead.executive_1on1' },
  { token: '1-1',  subtypeId: 'lead.executive_1on1' },
  { token: '1on1', subtypeId: 'lead.executive_1on1' },
  { token: 'one on one', subtypeId: 'lead.executive_1on1' },
  { token: 'pip',  subtypeId: 'lead.difficult_conversation' },
  { token: 'rif',  subtypeId: 'lead.layoff' },
  { token: '360 review', subtypeId: 'lead.performance_review' },
  { token: 'slt',  subtypeId: 'lead.leadership_sync' },
  { token: 'elt',  subtypeId: 'lead.leadership_sync' },

  // ── Strategy ──
  { token: 'aop',  subtypeId: 'str.strategy_planning',
    note: 'Annual operating plan' },
  { token: 'okr',  subtypeId: 'str.strategy_planning' },
  { token: 'okrs', subtypeId: 'str.strategy_planning' },
  { token: 'v2mom', subtypeId: 'str.strategy_planning' },

  // ── Conferences ──
  { token: 'offsite', subtypeId: 'conf.offsite' },
  { token: 'off-site', subtypeId: 'conf.offsite' },
  { token: 'workshop', subtypeId: 'conf.offsite',
    note: 'No dedicated workshop subtype — closest match' },
  { token: 'kickoff', subtypeId: 'conf.offsite',
    note: 'Team kickoff treated as offsite-shaped' },

  // ── Travel ──
  { token: 'red-eye', subtypeId: 'trv.long_haul' },
  { token: 'redeye',  subtypeId: 'trv.long_haul' },
  { token: 'long-haul', subtypeId: 'trv.long_haul' },
  { token: 'long haul', subtypeId: 'trv.long_haul' },

  // ── Rhythm ──
  { token: 'standup', subtypeId: 'rhy.catchup' },
  { token: 'stand-up', subtypeId: 'rhy.catchup' },
  { token: 'wbr',  subtypeId: 'rhy.catchup',
    note: 'Weekly business review treated as recurring catch-up' },
  { token: 'ooo',  subtypeId: 'rhy.pto' },
  { token: 'pto',  subtypeId: 'rhy.pto' },
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface AcronymMatch {
  entry: AcronymEntry;
  matchedToken: string;
}

/**
 * Returns the first acronym entry whose token appears as a word-boundaried
 * substring of the title (case-insensitive). Tokens are checked in declared
 * order; first hit wins.
 */
export function findAcronymMatch(title: string | null | undefined): AcronymMatch | null {
  if (!title) return null;
  for (const entry of ACRONYM_DICTIONARY) {
    const tok = entry.token.toLowerCase();
    // Tokens that already contain whitespace, ':' or '-' do not need strict
    // word-boundary anchoring on both sides — substring is safe enough.
    if (/[\s:&\-]/.test(tok)) {
      if (title.toLowerCase().includes(tok)) return { entry, matchedToken: tok };
      continue;
    }
    const re = new RegExp(`(^|\\W)${escapeRegex(tok)}($|\\W)`, 'i');
    if (re.test(title)) return { entry, matchedToken: tok };
  }
  return null;
}