import { getAuthToken } from "@/services/authTokenService";

export interface OnboardingProgressSnapshot {
  beta_expires_at?: string | null;
  beta_user?: boolean | null;
  completed_at?: string | null;
  context_connection_at?: string | null;
  first_session_walkthrough_at?: string | null;
  onboarding_completed_at?: string | null;
  payment_at?: string | null;
  results_at?: string | null;
  signup_step_at?: string | null;
}

function getOnboardingProgressUrl() {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  return `https://${projectId}.supabase.co/functions/v1/onboarding-progress`;
}

export function hasValidBetaAccess(snapshot: OnboardingProgressSnapshot | null | undefined): boolean {
  return !!(
    snapshot?.beta_user &&
    snapshot?.beta_expires_at &&
    new Date(snapshot.beta_expires_at) > new Date()
  );
}

export function isOnboardingCompleteSnapshot(snapshot: OnboardingProgressSnapshot | null | undefined): boolean {
  return !!(
    snapshot?.onboarding_completed_at ||
    snapshot?.completed_at ||
    snapshot?.context_connection_at
  );
}

export function hasCompletedFirstSessionWalkthrough(snapshot: OnboardingProgressSnapshot | null | undefined): boolean {
  return !!snapshot?.first_session_walkthrough_at;
}

export async function fetchOnboardingProgressSnapshot(): Promise<OnboardingProgressSnapshot | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const token = await getAuthToken();
      if (!token) return null;

      const res = await fetch(getOnboardingProgressUrl(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "GET" }),
      });

      if (!res.ok) {
        if (attempt === 1) return null;
        continue;
      }

      const payload = await res.json();
      return payload?.data ?? null;
    } catch {
      if (attempt === 1) return null;
    }
  }

  return null;
}