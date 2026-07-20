/**
 * First Session Tour — single source of truth for the spotlight walkthrough's
 * sessionStorage state.
 *
 * Why this exists:
 * - Three call sites (Stage7 onboarding completion, Profile retake, sidebar
 *   retake) used to set the same 4 sessionStorage keys by hand. They drifted:
 *   one cleared the intro flag, another cleared a different subset, a third
 *   forgot the user-id binding. That caused two visible bugs:
 *     (a) Back from step 2 to step 1 re-mounted the "Let's show you around"
 *         intro modal, which the user read as "tour restarted onboarding".
 *     (b) New users who finished onboarding sometimes landed on
 *         /daily-check-in?tour=1 without `first_session_guide_user`, so the
 *         user-scoped checks in DailyCheckIn rejected the tour.
 *
 * Contract:
 * - `startFirstSessionTour` is the only function that sets the active flag
 *   and step. It always navigates to /daily-check-in?tour=1 with replace=false
 *   so the user can return via Back to wherever they triggered it.
 * - `markIntroSeen` is called once the intro modal is dismissed; from then on
 *   re-mounts of FirstSessionGuide (e.g. Back navigation between
 *   /executive-home and /daily-check-in) MUST NOT re-show the intro.
 * - `clearFirstSessionTour` is called exactly once on tour finish or skip.
 *
 * Keys (kept exported for backward compatibility with existing readers):
 * - first_session_guide_active   "1" while the tour is in progress
 * - first_session_guide_step     "0".."N" current step index (string)
 * - first_session_guide_user     auth user id the tour is bound to
 * - first_session_guide_retake   auth user id (presence = retake mode)
 * - first_session_intro_seen     "1" once the intro modal was dismissed
 * - first_session_guide_done     "1" once the tour finished (one-shot)
 */

export const FST_KEYS = {
  active: 'first_session_guide_active',
  step: 'first_session_guide_step',
  user: 'first_session_guide_user',
  retake: 'first_session_guide_retake',
  introSeen: 'first_session_intro_seen',
  done: 'first_session_guide_done',
  source: 'first_session_guide_source',
} as const;

export const FIRST_SESSION_TOUR_STARTED_EVENT = 'first-session-tour-started';

type StartSource = 'onboarding' | 'retake';

export interface StartTourOptions {
  userId?: string | null;
  source: StartSource;
}

const safeSet = (k: string, v: string) => {
  try { sessionStorage.setItem(k, v); } catch { /* private mode */ }
};
const safeRemove = (k: string) => {
  try { sessionStorage.removeItem(k); } catch { /* private mode */ }
};
const safeGet = (k: string): string | null => {
  try { return sessionStorage.getItem(k); } catch { return null; }
};
const TOUR_MOCK_KEY = 'tour_mock_active';
const TOUR_MOCK_EVENT = 'tour-mock-changed';

/**
 * Initialise tour state and return the route the caller should navigate to.
 * Callers do their own navigate() so React Router context isn't required here.
 */
export function startFirstSessionTour({ userId, source }: StartTourOptions): string {
  // Always reset cross-step state so a retake starts at step 1 with intro.
  safeSet(FST_KEYS.active, '1');
  safeSet(FST_KEYS.step, '0');
  safeSet(FST_KEYS.source, source);
  if (userId) {
    safeSet(FST_KEYS.user, userId);
    if (source === 'retake') safeSet(FST_KEYS.retake, userId);
  }
  // Both fresh onboarding and retake should show the intro card once.
  safeRemove(FST_KEYS.introSeen);
  // A previous completion marker would suppress the new tour run.
  safeRemove(FST_KEYS.done);
  // Set this before navigation so MRS, Brief, and Plan render their populated
  // tour examples on the first paint, including Profile retakes.
  safeSet(TOUR_MOCK_KEY, '1');
  try {
    window.dispatchEvent(new CustomEvent(TOUR_MOCK_EVENT));
    window.dispatchEvent(new CustomEvent(FIRST_SESSION_TOUR_STARTED_EVENT, {
      detail: { userId: userId || null, source },
    }));
  } catch { /* non-browser/test environment */ }
  return '/daily-check-in?tour=1';
}

export function markIntroSeen(): void {
  safeSet(FST_KEYS.introSeen, '1');
}

export function hasIntroBeenSeen(): boolean {
  return safeGet(FST_KEYS.introSeen) === '1';
}

export function setTourStep(step: number): void {
  safeSet(FST_KEYS.step, String(Math.max(0, step | 0)));
}

export function getTourStep(): number {
  const raw = safeGet(FST_KEYS.step);
  const n = raw == null ? 0 : parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * True when the tour is in progress for the supplied user. Accepts a falsy
 * user id (DEV mode) and treats user-binding as advisory in that case.
 */
export function isTourActiveForUser(userId?: string | null): boolean {
  if (safeGet(FST_KEYS.active) !== '1') return false;
  const bound = safeGet(FST_KEYS.user);
  if (!userId) return true; // permissive in dev / pre-auth
  if (!bound) return true;  // tour set up before user id was known
  return bound === userId;
}

export function isRetakeForUser(userId?: string | null): boolean {
  // CONTRACT: the "Retake Tour" entry point in Profile is only visible to
  // existing users. So a truthy retake flag is a deterministic
  // "this is NOT a first-time user" signal. The TourMock gate relies on
  // this to show demo Brief/Plan content without classifying retakes as new
  // onboarding users.
  const r = safeGet(FST_KEYS.retake);
  if (!r) return false;
  if (!userId) return true;
  return r === userId;
}

/**
 * Returns the source that launched the active tour, or null if absent.
 * Used by the TourMock gate to suppress demo data for retake users even
 * before the user id has been bound.
 */
export function getTourSource(): StartSource | null {
  const s = safeGet(FST_KEYS.source);
  return s === 'onboarding' || s === 'retake' ? s : null;
}

/**
 * Same intent as `startFirstSessionTour` but for the in-progress case where
 * the tour state already exists and we just need to ensure it's still bound
 * to the active user. Used by DailyCheckIn when ?tour=1 is in the URL.
 */
export function ensureTourBoundToUser(userId?: string | null): void {
  if (safeGet(FST_KEYS.active) !== '1') safeSet(FST_KEYS.active, '1');
  if (userId && safeGet(FST_KEYS.user) !== userId) safeSet(FST_KEYS.user, userId);
}

/** Clear every tour key. Called on finish, skip, or sign-out. */
export function clearFirstSessionTour(opts: { markDone?: boolean } = {}): void {
  safeRemove(FST_KEYS.step);
  safeRemove(FST_KEYS.active);
  safeRemove(FST_KEYS.user);
  safeRemove(FST_KEYS.retake);
  safeRemove(FST_KEYS.introSeen);
  safeRemove(FST_KEYS.source);
  safeRemove(TOUR_MOCK_KEY);
  if (opts.markDone) safeSet(FST_KEYS.done, '1');
  try { window.dispatchEvent(new CustomEvent(TOUR_MOCK_EVENT)); } catch { /* non-browser/test environment */ }
}
