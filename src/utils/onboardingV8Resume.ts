import { supabase } from "@/integrations/supabase/client";
import { getAuthToken } from "@/services/authTokenService";
import { getSupabaseFunctionHeaders, getSupabaseFunctionUrl } from "@/utils/supabaseFunctions";

export type OnboardingV8StepId =
  | "leadership_context"
  | "cognitive_load"
  | "protect_goals"
  | "brief_prefs"
  | "permissions"
  | "connect";

export type OnboardingStepStatus = "not_started" | "in_progress" | "completed";
export type OnboardingSynthesisStatus = "not_started" | "pending" | "ready" | "failed";

export interface OnboardingV8ResumeState {
  completed: boolean;
  currentStep: OnboardingV8StepId | null;
  nextRoute: string | null;
  stepStatus: Record<OnboardingV8StepId, OnboardingStepStatus>;
  responses: Record<string, unknown>;
  connections: Record<string, unknown>;
  synthesisStatus: OnboardingSynthesisStatus;
}

type RawV8Row = {
  brief_timing?: string | null;
  preferred_practice_window?: string | null;
  burden_chips?: string[] | null;
  calendar_selections?: string[] | null;
  completed_at?: string | null;
  cos_profile_status?: string | null;
  freetext_context?: string | null;
  goals?: string[] | null;
  linkedin_url?: string | null;
  load_chips?: string[] | null;
  reset_modality?: string | null;
  stakes_chips?: string[] | null;
  step_status?: Record<string, unknown> | null;
  wearable_selections?: string[] | null;
  weekend_signals?: string | null;
  writing_urls?: string[] | null;
};

const STEP_ORDER: OnboardingV8StepId[] = [
  "leadership_context",
  "cognitive_load",
  "protect_goals",
  "brief_prefs",
  "permissions",
  "connect",
];

const STEP_ROUTE: Record<OnboardingV8StepId, string> = {
  leadership_context: "/onboarding/leadership-context",
  cognitive_load: "/onboarding/cognitive-load",
  protect_goals: "/onboarding/protect-goals",
  brief_prefs: "/onboarding/brief-prefs",
  permissions: "/onboarding/permissions",
  connect: "/onboarding/connect",
};

function toSynthesisStatus(raw: string | null | undefined): OnboardingSynthesisStatus {
  if (raw === "ready") return "ready";
  if (raw === "failed") return "failed";
  if (raw === "in_progress" || raw === "pending") return "pending";
  return "not_started";
}

function isCompletedMarker(value: unknown): boolean {
  if (value === "completed") return true;
  if (typeof value === "string" && value.trim().length > 0) return true;
  if (value && typeof value === "object" && "status" in value) {
    return (value as { status?: unknown }).status === "completed";
  }
  return false;
}

function normalizeStepStatus(row: RawV8Row | null): Record<OnboardingV8StepId, OnboardingStepStatus> {
  const raw = (row?.step_status ?? {}) as Record<string, unknown>;
  const status = Object.fromEntries(
    STEP_ORDER.map((step) => [step, "not_started"]),
  ) as Record<OnboardingV8StepId, OnboardingStepStatus>;

  for (const step of STEP_ORDER) {
    const marker = raw[step];
    if (isCompletedMarker(marker)) {
      status[step] = "completed";
    }
  }

  if (row?.linkedin_url || row?.freetext_context || (row?.writing_urls?.length ?? 0) > 0) {
    status.leadership_context = status.leadership_context === "completed" ? "completed" : "in_progress";
  }
  if ((row?.stakes_chips?.length ?? 0) > 0 || (row?.load_chips?.length ?? 0) > 0 || (row?.burden_chips?.length ?? 0) > 0) {
    status.cognitive_load = status.cognitive_load === "completed" ? "completed" : "in_progress";
  }
  if ((row?.goals?.length ?? 0) > 0) {
    status.protect_goals = status.protect_goals === "completed" ? "completed" : "in_progress";
  }
  if (row?.weekend_signals || row?.brief_timing || row?.preferred_practice_window || row?.reset_modality) {
    status.brief_prefs = status.brief_prefs === "completed" ? "completed" : "in_progress";
  }
  if ((row?.calendar_selections?.length ?? 0) > 0 || (row?.wearable_selections?.length ?? 0) > 0) {
    status.permissions = status.permissions === "completed" ? "completed" : "in_progress";
  }

  return status;
}

function deriveStepStatusFromFields(row: RawV8Row | null): Record<OnboardingV8StepId, OnboardingStepStatus> {
  const status = normalizeStepStatus(row);
  if ((row?.goals?.length ?? 0) > 0) status.protect_goals = "completed";
  if ((row?.calendar_selections?.length ?? 0) > 0 && (row?.wearable_selections?.length ?? 0) > 0) status.permissions = "completed";
  if (
    row?.weekend_signals != null && String(row.weekend_signals).length > 0 ||
    row?.preferred_practice_window != null && String(row.preferred_practice_window).length > 0
  ) {
    status.brief_prefs = "completed";
  }
  return status;
}

function firstIncompleteStep(status: Record<OnboardingV8StepId, OnboardingStepStatus>): OnboardingV8StepId | null {
  return STEP_ORDER.find((step) => status[step] !== "completed") ?? null;
}

export async function loadOnboardingV8ResumeState(): Promise<OnboardingV8ResumeState> {
  const token = await getAuthToken();
  if (!token) {
    return {
      completed: false,
      currentStep: STEP_ORDER[0],
      nextRoute: STEP_ROUTE[STEP_ORDER[0]],
      stepStatus: Object.fromEntries(STEP_ORDER.map((step) => [step, "not_started"])) as Record<OnboardingV8StepId, OnboardingStepStatus>,
      responses: {},
      connections: {},
      synthesisStatus: "not_started",
    };
  }

  const headers = getSupabaseFunctionHeaders(token);
  const response = await fetch(getSupabaseFunctionUrl("onboarding-v8-save"), {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "GET" }),
  });
  if (!response.ok) {
    throw new Error(`onboarding_v8_get_${response.status}`);
  }

  const payload = await response.json();
  const row = (payload?.data ?? null) as RawV8Row | null;
  const synthesisStatus = toSynthesisStatus(row?.cos_profile_status);
  const stepStatus = deriveStepStatusFromFields(row);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .maybeSingle();
  if (profileError) {
    throw profileError;
  }

  const completed = Boolean(profile?.onboarding_completed_at);
  const currentStep = firstIncompleteStep(stepStatus);
  const nextRoute = completed
    ? "/executive-home"
    : currentStep
      ? STEP_ROUTE[currentStep]
      : synthesisStatus === "failed"
        ? "/onboarding/done"
        : "/onboarding/done";

  return {
    completed,
    currentStep,
    nextRoute,
    stepStatus,
    responses: {
      linkedin_url: row?.linkedin_url ?? null,
      writing_urls: row?.writing_urls ?? [],
      freetext_context: row?.freetext_context ?? null,
      stakes_chips: row?.stakes_chips ?? [],
      load_chips: row?.load_chips ?? [],
      burden_chips: row?.burden_chips ?? [],
      goals: row?.goals ?? [],
      brief_timing: row?.brief_timing ?? null,
      preferred_practice_window: row?.preferred_practice_window ?? null,
      reset_modality: row?.reset_modality ?? null,
      weekend_signals: row?.weekend_signals ?? null,
    },
    connections: {
      calendar_selections: row?.calendar_selections ?? [],
      wearable_selections: row?.wearable_selections ?? [],
    },
    synthesisStatus,
  };
}

export function getResumeRouteFromState(state: OnboardingV8ResumeState): string {
  if (state.completed) return "/executive-home";
  if (state.nextRoute) return state.nextRoute;
  return "/onboarding/app-intro";
}
