/**
 * Native in-app rating prompt (Apple StoreKit / Google Play In-App Review).
 *
 * Compliance:
 * - No pre-rating sentiment gate. We do not ask "do you like the app?" first,
 *   and we do not route happy users elsewhere.
 * - Only Apple's/Google's native prompt is used. Apple enforces a hard cap of
 *   up to 3 displays per user per 365 days at the OS level; we additionally
 *   throttle from our side so we never *request* it more than a few times.
 * - The prompt only fires on native iOS/Android — never on web.
 *
 * Engagement gate (all must be true before we request the native prompt):
 *   - At least 3 completed check-ins
 *   - At least 2 plan views
 *   - At least 3 distinct app sessions (>= 6h apart)
 *   - App has been installed at least 3 days
 *   - Last request was at least 120 days ago (well under the 365-day cap)
 */

import { Capacitor } from "@capacitor/core";

const STORAGE_KEY = "appReview.v1";
const SESSION_GAP_MS = 6 * 60 * 60 * 1000; // 6h between counted sessions
const MIN_INSTALL_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const MIN_INTERVAL_BETWEEN_REQUESTS_MS = 120 * 24 * 60 * 60 * 1000; // 120 days

const MIN_CHECKINS = 3;
const MIN_PLAN_VIEWS = 2;
const MIN_SESSIONS = 3;

/**
 * Never prompt during fragile or transactional flows: onboarding, payment /
 * upgrade, auth, and error surfaces. Apple treats an ill-timed prompt as a
 * poor experience, and a prompt on top of a StoreKit sheet can be dropped
 * silently, burning one of the 3 allowed displays per year.
 */
const SUPPRESSED_PATH_PREFIXES = [
  "/onboarding",
  "/upgrade",
  "/payment",
  "/signup",
  "/login",
  "/callback",
  "/error",
  "/reset-password",
];

export function isReviewPromptSuppressedForPath(pathname: string): boolean {
  const path = (pathname || "").toLowerCase();
  return SUPPRESSED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

type ReviewState = {
  firstOpenAt: number;
  lastSessionAt: number;
  sessions: number;
  checkins: number;
  planViews: number;
  lastRequestedAt: number | null;
};

function readState(): ReviewState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ReviewState>;
      return {
        firstOpenAt: parsed.firstOpenAt ?? Date.now(),
        lastSessionAt: parsed.lastSessionAt ?? 0,
        sessions: parsed.sessions ?? 0,
        checkins: parsed.checkins ?? 0,
        planViews: parsed.planViews ?? 0,
        lastRequestedAt: parsed.lastRequestedAt ?? null,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    firstOpenAt: Date.now(),
    lastSessionAt: 0,
    sessions: 0,
    checkins: 0,
    planViews: 0,
    lastRequestedAt: null,
  };
}

function writeState(state: ReviewState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

function isNativeMobile(): boolean {
  try {
    const platform = Capacitor.getPlatform();
    return platform === "ios" || platform === "android";
  } catch {
    return false;
  }
}

/** Record a fresh app session if enough time has passed since the last one. */
export function recordAppOpen(): void {
  const state = readState();
  const now = Date.now();
  if (!state.firstOpenAt) state.firstOpenAt = now;
  if (now - state.lastSessionAt >= SESSION_GAP_MS) {
    state.sessions += 1;
    state.lastSessionAt = now;
  }
  writeState(state);
}

export function recordCheckinCompleted(): void {
  const state = readState();
  state.checkins += 1;
  writeState(state);
  void maybeRequestReview();
}

export function recordPlanViewed(): void {
  const state = readState();
  state.planViews += 1;
  writeState(state);
  void maybeRequestReview();
}

function meetsEngagementGate(state: ReviewState): boolean {
  const now = Date.now();
  if (now - state.firstOpenAt < MIN_INSTALL_AGE_MS) return false;
  if (state.checkins < MIN_CHECKINS) return false;
  if (state.planViews < MIN_PLAN_VIEWS) return false;
  if (state.sessions < MIN_SESSIONS) return false;
  if (
    state.lastRequestedAt !== null &&
    now - state.lastRequestedAt < MIN_INTERVAL_BETWEEN_REQUESTS_MS
  ) {
    return false;
  }
  return true;
}

/**
 * Ask iOS/Android to *consider* showing its native rating prompt. The OS
 * decides whether to actually show it (Apple caps at 3 per 365 days per user).
 * Safe to call frequently — we throttle from our side too.
 */
export async function maybeRequestReview(): Promise<void> {
  if (!isNativeMobile()) return;
  try {
    if (isReviewPromptSuppressedForPath(window.location.pathname)) return;
  } catch {
    /* no window (tests) – fall through */
  }
  const state = readState();
  if (!meetsEngagementGate(state)) return;

  try {
    const mod = await import("@capacitor-community/in-app-review");
    // Record the attempt *before* awaiting the native call — even if the OS
    // silently suppresses the sheet (its right), we still count it against
    // our own interval so we don't spam requestReview.
    state.lastRequestedAt = Date.now();
    writeState(state);
    await mod.InAppReview.requestReview();
  } catch (err) {
    // Never surface — this is a passive, best-effort prompt.
    console.warn("[appReview] requestReview failed", err);
  }
}
