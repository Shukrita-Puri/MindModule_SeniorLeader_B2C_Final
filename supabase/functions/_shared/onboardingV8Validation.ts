// Canonical taxonomy + validation rules for the v8 onboarding flow.
// Mirror of src/utils/onboardingV8Validation.ts (Deno-side).
// Keep these two files in sync.

export const STAKES_CHIPS = [
  "Board session", "Investor meeting", "Fundraise / capital raise", "M&A or due diligence",
  "Restructure or redundancy", "Earnings or reporting", "Major negotiation", "Conference or keynote",
  "Media or PR moment", "Crisis response", "Leadership hiring", "Performance review cycle",
] as const;

export const LOAD_CHIPS = [
  "Market pressure or headwinds", "Competitive disruption", "Regulatory or compliance shifts",
  "Team culture or morale", "Talent retention", "AI adoption pressure", "Board or investor relations",
  "Strategic ambiguity",
] as const;

export const BURDEN_CHIPS = [
  "Regular travel", "Multi-day conferences", "Back-to-back intensity", "Timezone shifting",
  "High interpersonal demand", "Disrupted recovery", "Decision overload", "Carrying unresolved decisions",
] as const;

export const GOAL_IDS = [
  "regulated", "prepare", "recover", "sustain",
  "decision", "people", "models", "patterns",
] as const;

export const BRIEF_TIMING = ["Morning", "Evening", "Use intelligence"] as const;
export const RESET_MODALITY = ["Sound", "Guided", "Mindset", "Use intelligence"] as const;
export const WEEKEND_SIGNALS = ["Reduce", "Keep"] as const;

// Canonical calendar provider IDs. Aligned with CalendarProviderPicker
// (`'google' | 'microsoft' | 'apple'`) so the same value flows from the UI
// through validation, DB persistence, and the post-onboarding Connections
// step without translation. `"outlook"` is kept as a backward-compat alias
// for any pre-existing rows and is rewritten to `"microsoft"` by
// `sanitizePayload`.
export const CALENDAR_PROVIDERS = ["google", "microsoft", "apple"] as const;
const CALENDAR_PROVIDER_ALIASES: Record<string, string> = { outlook: "microsoft" };
export const WEARABLE_PROVIDERS = ["apple-watch", "oura", "whoop"] as const;

export const MAX_GOALS = 3;
export const MAX_WRITING_URLS = 2;
export const MAX_FREETEXT_LEN = 8000;
export const MAX_URL_LEN = 2048;

/** Normalize a URL: trim, lower-case scheme, prepend https:// if missing. */
export function normalizeUrl(raw: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export function isHttpUrl(raw: string): boolean {
  const s = normalizeUrl(raw);
  if (!s || s.length > MAX_URL_LEN) return false;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    // hostname must contain at least one dot
    return !!u.hostname && u.hostname.includes(".");
  } catch {
    return false;
  }
}

export function isLinkedInUrl(raw: string): boolean {
  if (!isHttpUrl(raw)) return false;
  try {
    const u = new URL(normalizeUrl(raw));
    const host = u.hostname.toLowerCase();
    return host === "linkedin.com" || host.endsWith(".linkedin.com");
  } catch {
    return false;
  }
}

export function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export type StepKey =
  | "leadership_context"
  | "cognitive_load"
  | "protect_goals"
  | "brief_prefs"
  | "permissions";

export type ValidationError = { field: string; message: string };

export type V8Payload = {
  linkedin_url?: string | null;
  writing_urls?: string[];
  freetext_context?: string | null;
  stakes_chips?: string[];
  load_chips?: string[];
  burden_chips?: string[];
  goals?: string[];
  brief_timing?: string | null;
  reset_modality?: string | null;
  weekend_signals?: string | null;
  calendar_selections?: string[];
  wearable_selections?: string[];
};

/** Strip whitespace + dedupe + clamp length on arbitrary string arrays. */
function sanitizeArr(arr: unknown, allowed?: readonly string[], cap = 64): string[] {
  if (!Array.isArray(arr)) return [];
  const cleaned = uniq(
    arr
      .filter((v) => typeof v === "string")
      .map((v) => (v as string).trim())
      .filter((v) => v.length > 0),
  );
  const filtered = allowed ? cleaned.filter((v) => (allowed as readonly string[]).includes(v)) : cleaned;
  return filtered.slice(0, cap);
}

/** Produce a canonical, sanitized payload. Unknown enum values are dropped silently. */
export function sanitizePayload(input: V8Payload): V8Payload {
  const out: V8Payload = {};

  if ("linkedin_url" in input) {
    const v = input.linkedin_url;
    if (v === null) out.linkedin_url = null;
    else if (typeof v === "string") {
      const t = v.trim();
      out.linkedin_url = t ? normalizeUrl(t).slice(0, MAX_URL_LEN) : null;
    }
  }
  if ("writing_urls" in input) {
    const arr = Array.isArray(input.writing_urls) ? input.writing_urls : [];
    out.writing_urls = uniq(
      arr
        .filter((v) => typeof v === "string")
        .map((v) => normalizeUrl((v as string).trim()))
        .filter((v) => v.length > 0 && v.length <= MAX_URL_LEN),
    ).slice(0, MAX_WRITING_URLS);
  }
  if ("freetext_context" in input) {
    const v = input.freetext_context;
    if (v === null) out.freetext_context = null;
    else if (typeof v === "string") {
      const t = v.trim();
      out.freetext_context = t ? t.slice(0, MAX_FREETEXT_LEN) : null;
    }
  }
  if ("stakes_chips" in input) out.stakes_chips = sanitizeArr(input.stakes_chips, STAKES_CHIPS);
  if ("load_chips" in input) out.load_chips = sanitizeArr(input.load_chips, LOAD_CHIPS);
  if ("burden_chips" in input) out.burden_chips = sanitizeArr(input.burden_chips, BURDEN_CHIPS);
  if ("goals" in input) out.goals = sanitizeArr(input.goals, GOAL_IDS, MAX_GOALS);
  if ("brief_timing" in input) {
    const v = typeof input.brief_timing === "string" ? input.brief_timing.trim() : input.brief_timing;
    out.brief_timing = (BRIEF_TIMING as readonly string[]).includes(v as string) ? (v as string) : null;
  }
  if ("reset_modality" in input) {
    const v = typeof input.reset_modality === "string" ? input.reset_modality.trim() : input.reset_modality;
    out.reset_modality = (RESET_MODALITY as readonly string[]).includes(v as string) ? (v as string) : null;
  }
  if ("weekend_signals" in input) {
    const v = typeof input.weekend_signals === "string" ? input.weekend_signals.trim() : input.weekend_signals;
    out.weekend_signals = (WEEKEND_SIGNALS as readonly string[]).includes(v as string) ? (v as string) : null;
  }
  if ("calendar_selections" in input) {
    const aliased = Array.isArray(input.calendar_selections)
      ? input.calendar_selections.map((v) =>
          typeof v === "string" ? (CALENDAR_PROVIDER_ALIASES[v.trim().toLowerCase()] ?? v) : v,
        )
      : input.calendar_selections;
    out.calendar_selections = sanitizeArr(aliased, CALENDAR_PROVIDERS);
  }
  if ("wearable_selections" in input) out.wearable_selections = sanitizeArr(input.wearable_selections, WEARABLE_PROVIDERS);

  return out;
}

/** Per-step structural validation. Returns errors on the canonical payload. */
export function validateStep(step: StepKey, p: V8Payload): ValidationError[] {
  const errs: ValidationError[] = [];
  switch (step) {
    case "leadership_context": {
      // Optional step overall, but if a field is provided it must be valid.
      if (p.linkedin_url && !isLinkedInUrl(p.linkedin_url)) {
        errs.push({ field: "linkedin_url", message: "Add a valid LinkedIn URL" });
      }
      const w = p.writing_urls ?? [];
      if (w.length > MAX_WRITING_URLS) {
        errs.push({ field: "writing_urls", message: `You can add up to ${MAX_WRITING_URLS} writing links` });
      }
      for (const u of w) {
        if (!isHttpUrl(u)) {
          errs.push({ field: "writing_urls", message: "Each writing link must be a valid URL" });
          break;
        }
      }
      break;
    }
    case "cognitive_load":
      // No required minimum; rejection of unknown values happens in sanitizePayload.
      break;
    case "protect_goals": {
      const g = p.goals ?? [];
      if (g.length < 1) errs.push({ field: "goals", message: "Select at least 1 goal" });
      if (g.length > MAX_GOALS) errs.push({ field: "goals", message: `Maximum ${MAX_GOALS} goals` });
      break;
    }
    case "brief_prefs": {
      if (!p.brief_timing) errs.push({ field: "brief_timing", message: "Choose a brief timing" });
      if (!p.reset_modality) errs.push({ field: "reset_modality", message: "Choose a reset modality" });
      if (!p.weekend_signals) errs.push({ field: "weekend_signals", message: "Choose weekend signals" });
      break;
    }
    case "permissions": {
      const cal = p.calendar_selections ?? [];
      const wear = p.wearable_selections ?? [];
      if (cal.length < 1) errs.push({ field: "calendar_selections", message: "Choose at least 1 calendar" });
      if (wear.length < 1) errs.push({ field: "wearable_selections", message: "Choose at least 1 wearable" });
      break;
    }
  }
  return errs;
}

/** Final completion gate. Requires goals, prefs, permissions. Leadership step optional. */
export function validateForCompletion(row: V8Payload): ValidationError[] {
  return [
    ...validateStep("protect_goals", row),
    ...validateStep("brief_prefs", row),
    ...validateStep("permissions", row),
  ];
}