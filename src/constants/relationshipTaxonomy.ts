export type RelationshipRole =
  | 'board_member'
  | 'direct_boss'
  | 'investor'
  | 'regulator'
  | 'acquirer_target'
  | 'skip_level'
  | 'journalist_media'
  | 'customer'
  | 'client'
  | 'external_partner'
  | 'report_direct'
  | 'peer'
  | 'vendor'
  | 'report_junior'
  | 'unknown';

export const RELATIONSHIP_TAXONOMY: Record<RelationshipRole, { role: RelationshipRole; label?: string }> = {
  board_member: { role: 'board_member', label: 'Board' },
  direct_boss: { role: 'direct_boss', label: 'Boss' },
  investor: { role: 'investor', label: 'Investor' },
  regulator: { role: 'regulator' },
  acquirer_target: { role: 'acquirer_target' },
  skip_level: { role: 'skip_level', label: 'Leadership' },
  journalist_media: { role: 'journalist_media' },
  customer: { role: 'customer', label: 'Customer' },
  client: { role: 'client', label: 'Client' },
  external_partner: { role: 'external_partner' },
  report_direct: { role: 'report_direct', label: 'Team' },
  peer: { role: 'peer', label: 'Colleague' },
  vendor: { role: 'vendor', label: 'Vendor' },
  report_junior: { role: 'report_junior', label: 'Junior' },
  unknown: { role: 'unknown' },
};
