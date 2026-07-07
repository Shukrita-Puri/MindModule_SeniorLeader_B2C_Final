/**
 * Home snapshot-only mode.
 *
 * When true (default), Executive Home cards (MRS, PRB, Plan) read from
 * persisted snapshots only. Cron (`build-executive-home-cards`) owns
 * generation. Home load must NOT invoke `compute-inner-readiness`,
 * `compute-outer-readiness`, or `generate-mastery-plan`.
 *
 * Manual/admin refresh buttons bypass this flag and may invoke the
 * edge functions directly.
 */
const raw = (import.meta as any)?.env?.VITE_HOME_SNAPSHOT_ONLY;
export const HOME_SNAPSHOT_ONLY: boolean =
  raw === undefined || raw === null || raw === '' ? true : String(raw) !== 'false';