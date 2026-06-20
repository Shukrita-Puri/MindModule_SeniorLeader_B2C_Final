const IMPORTANCE_HIGH = new Set(["vip", "urgent", "critical", "must-prep", "must-win", "key"]);
const IMPORTANCE_MEDIUM = new Set(["priority"]);
const IMPORTANCE_LOW = new Set(["optional", "fyi", "maybe", "low-pri", "noise"]);
const RELATIONSHIP_SKIP_LEVEL = new Set(["mentor", "sponsor"]);
const RELATIONSHIP_BOARD = new Set(["chair", "trustee", "governor", "ned", "cofounder"]);
const RELATIONSHIP_INVESTOR = new Set(["vc", "pe", "lp", "angel"]);
const RELATIONSHIP_MEDIA = new Set(["journalist", "press", "reporter"]);
const RELATIONSHIP_REGULATOR = new Set(["regulator", "auditor", "ombudsman"]);
const RELATIONSHIP_ACQUIRER = new Set(["acquirer", "counterparty"]);
const RELATIONSHIP_EXTERNAL = new Set(["partner", "alliance"]);
const RELATIONSHIP_HIRING = new Set(["recruiter", "candidate"]);

const URL_RE = /https?:\/\/|www\./i;
const EMOJI_ONLY_RE = /^\p{Extended_Pictographic}+$/u;

export type RoutedCustomTag =
  | { kind: "importance"; value: "high" | "medium" | "low" }
  | { kind: "relationship"; value: "skip_level" | "board_member" | "investor" | "journalist_media" | "regulator" | "acquirer_target" | "external_partner" | "report_direct" | "report_junior" }
  | { kind: "custom"; value: string };

export function routeCustomTag(raw: string): RoutedCustomTag | null {
  const t = String(raw ?? "").trim();
  if (!t || t.length > 40) return null;
  if (URL_RE.test(t)) return null;
  if (EMOJI_ONLY_RE.test(t)) return null;
  const norm = t.toLowerCase();
  if (IMPORTANCE_HIGH.has(norm)) return { kind: "importance", value: "high" };
  if (IMPORTANCE_MEDIUM.has(norm)) return { kind: "importance", value: "medium" };
  if (IMPORTANCE_LOW.has(norm)) return { kind: "importance", value: "low" };
  if (RELATIONSHIP_SKIP_LEVEL.has(norm)) return { kind: "relationship", value: "skip_level" };
  if (RELATIONSHIP_BOARD.has(norm)) return { kind: "relationship", value: "board_member" };
  if (RELATIONSHIP_INVESTOR.has(norm)) return { kind: "relationship", value: "investor" };
  if (RELATIONSHIP_MEDIA.has(norm)) return { kind: "relationship", value: "journalist_media" };
  if (RELATIONSHIP_REGULATOR.has(norm)) return { kind: "relationship", value: "regulator" };
  if (RELATIONSHIP_ACQUIRER.has(norm)) return { kind: "relationship", value: "acquirer_target" };
  if (RELATIONSHIP_EXTERNAL.has(norm)) return { kind: "relationship", value: "external_partner" };
  if (RELATIONSHIP_HIRING.has(norm)) return { kind: "relationship", value: "report_direct" };
  return { kind: "custom", value: t };
}
