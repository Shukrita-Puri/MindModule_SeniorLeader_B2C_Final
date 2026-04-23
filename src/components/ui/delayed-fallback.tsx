/**
 * DelayedFallback — invisible placeholder that only reveals a generic loader
 * after a configurable delay (default 3s). Used to silence "session
 * verification" and short-lived Suspense waits so users don't see a flash of
 * loading UI for sub-second transitions. Page-specific loaders (Brief, Plan,
 * Insights, Onboarding Results) continue to own their own scripted loaders;
 * this is the catch-all for everything else.
 */
import { useEffect, useState } from "react";
import EngravedLoader from "@/components/ui/engraved-loader";

interface DelayedFallbackProps {
  /** Milliseconds to wait before revealing the loader. Default 3000. */
  delayMs?: number;
  /** Loader label once shown. */
  label?: string;
}

const DelayedFallback = ({ delayMs = 3000, label = "Loading…" }: DelayedFallbackProps) => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(t);
  }, [delayMs]);

  if (!show) {
    // Transparent placeholder — preserves layout space without any visible UI.
    return <div aria-hidden className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <EngravedLoader label={label} />
    </div>
  );
};

export default DelayedFallback;