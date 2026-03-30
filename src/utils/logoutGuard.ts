/**
 * Logout Guard — prevents auto-login flows from firing immediately after sign-out.
 *
 * A short-lived sessionStorage flag is set during sign-out.
 * Login/Signup pages and ProtectedRoute check this flag and skip
 * automatic auth redirects while it is active.
 *
 * The flag is cleared when:
 *  1. The user explicitly taps "Sign In" / "Get Started".
 *  2. A safety timeout expires (default 30 s).
 *  3. The session/tab is closed (sessionStorage is ephemeral).
 */

const LOGOUT_GUARD_KEY = 'logout_guard_active';
const LOGOUT_GUARD_TS_KEY = 'logout_guard_ts';
const GUARD_TTL_MS = 30_000; // 30 seconds (increased from 10s for slow networks)

/** Activate the logout guard (call right before signing out). */
export function activateLogoutGuard(): void {
  sessionStorage.setItem(LOGOUT_GUARD_KEY, 'true');
  sessionStorage.setItem(LOGOUT_GUARD_TS_KEY, String(Date.now()));
  console.log('[LogoutGuard] Activated');
}

/** Returns true if the guard is active and within TTL. */
export function isLogoutGuardActive(): boolean {
  if (sessionStorage.getItem(LOGOUT_GUARD_KEY) !== 'true') return false;

  const ts = Number(sessionStorage.getItem(LOGOUT_GUARD_TS_KEY) || '0');
  if (Date.now() - ts > GUARD_TTL_MS) {
    clearLogoutGuard();
    return false;
  }
  return true;
}

/** Clear the guard — call when user explicitly initiates login. */
export function clearLogoutGuard(): void {
  sessionStorage.removeItem(LOGOUT_GUARD_KEY);
  sessionStorage.removeItem(LOGOUT_GUARD_TS_KEY);
  console.log('[LogoutGuard] Cleared');
}
