// JIT v2 — relationship resolver weights. Lives inside Immediate (§1 of
// the v2 plan): identity in the room structurally changes how important
// an event is to a CEO. User tag is sovereign; LLM+LinkedIn fills gaps;
// `unknown` is no-penalty.

export type ResolvedRole =
  | 'boss'
  | 'board_member'
  | 'investor'
  | 'client'
  | 'vendor'
  | 'peer'
  | 'report'
  | 'external_partner'
  | 'unknown';

export const RELATIONSHIP_WEIGHT: Record<ResolvedRole, number> = {
  boss: 25,
  board_member: 25,
  investor: 20,
  client: 18,
  external_partner: 15,
  peer: 8,
  vendor: 5,
  report: 5,
  unknown: 0,
};

/** Highest-weight role wins when multiple attendees resolve. */
export function dominantRole(roles: ResolvedRole[]): ResolvedRole {
  let best: ResolvedRole = 'unknown';
  let bestW = -1;
  for (const r of roles) {
    const w = RELATIONSHIP_WEIGHT[r] ?? 0;
    if (w > bestW) { bestW = w; best = r; }
  }
  return best;
}

export function relationshipWeight(role: ResolvedRole): number {
  return RELATIONSHIP_WEIGHT[role] ?? 0;
}

/** Domains we never send to the LLM/LinkedIn resolver. */
export const GENERIC_EMAIL_DOMAINS = new Set<string>([
  'gmail.com', 'googlemail.com',
  'hotmail.com', 'hotmail.co.uk',
  'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com',
  'proton.me', 'protonmail.com',
]);

export function isGenericDomain(email: string | null | undefined): boolean {
  if (!email) return true;
  const at = email.lastIndexOf('@');
  if (at < 0) return true;
  return GENERIC_EMAIL_DOMAINS.has(email.slice(at + 1).toLowerCase().trim());
}