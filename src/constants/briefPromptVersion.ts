/**
 * Frontend mirror of `supabase/functions/_shared/brief-prompt-version.ts`.
 *
 * Edge functions and the frontend cannot share modules across the
 * Deno/Vite boundary, so this constant must be kept in sync by hand when
 * the backend `BRIEF_PROMPT_VERSION` changes.
 *
 * Used by `useCurrentBriefSnapshot` to filter `brief_snapshots` to the
 * row written by the current prompt version. Without this filter, a row
 * from an older prompt version (e.g. produced just before a rollback)
 * could legitimately be the most-recently-updated row for the window
 * and would otherwise be served to the UI.
 */
export const BRIEF_PROMPT_VERSION = 'v7.3-behaviour-lead-rank';