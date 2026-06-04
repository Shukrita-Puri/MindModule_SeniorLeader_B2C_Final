/**
 * Minimal neutral skeleton used as a route-level Suspense fallback for pages
 * that own their own scripted loaders (Brief / Plan / Insights / Results).
 *
 * Renders nothing visible beyond the app background. Goal: avoid both the
 * generic "Loading…" engraved loader (which collides with page-specific
 * narration) AND a blank flash if the chunk takes >200ms to download.
 */
const RouteSkeleton = () => (
  <div
    className="min-h-screen bg-transparent"
    aria-busy="true"
    aria-live="polite"
  />
);

export default RouteSkeleton;