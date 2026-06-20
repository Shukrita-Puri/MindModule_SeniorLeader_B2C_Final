export type RelationshipRole =
  | "board_member"
  | "direct_boss"
  | "investor"
  | "regulator"
  | "acquirer_target"
  | "skip_level"
  | "journalist_media"
  | "customer"
  | "client"
  | "external_partner"
  | "report_direct"
  | "peer"
  | "vendor"
  | "report_junior"
  | "unknown";

export const RELATIONSHIP_TAXONOMY: Record<RelationshipRole, { weight: number; chip?: string }> = {
  board_member: { weight: 25, chip: "Board" },
  direct_boss: { weight: 25, chip: "Boss" },
  investor: { weight: 25, chip: "Investor" },
  regulator: { weight: 24 },
  acquirer_target: { weight: 24 },
  skip_level: { weight: 22, chip: "Leadership" },
  journalist_media: { weight: 22 },
  customer: { weight: 20, chip: "Customer" },
  client: { weight: 18, chip: "Client" },
  external_partner: { weight: 15 },
  report_direct: { weight: 10, chip: "Team" },
  peer: { weight: 8, chip: "Colleague" },
  vendor: { weight: 8, chip: "Vendor" },
  report_junior: { weight: 5, chip: "Junior" },
  unknown: { weight: 0 },
};
