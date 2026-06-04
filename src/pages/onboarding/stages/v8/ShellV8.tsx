import { ReactNode } from "react";
import artBand from "@/assets/onboarding/usp-sunrise-engraved.jpg";

/**
 * Shared light/parchment screen shell for the v8 onboarding flow.
 * Pinned full-bleed; renders a small art band, scrollable body, sticky footer.
 */
export function ParchScreen({
  step,
  title,
  children,
  footer,
}: {
  step: string;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-app-surface text-[#1a1712] overflow-hidden pb-[env(safe-area-inset-bottom,0px)]">
      {/* Spacer for the fixed top nav (back + brand lockup) */}
      <div className="shrink-0 h-[calc(53px+env(safe-area-inset-top,0px))]" />

      {/* Art band — uses app artwork (engraved nature-true) fading into parchment */}
      <div className="relative shrink-0 h-[140px] overflow-hidden">
        <img
          src={artBand}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: "grayscale(1) contrast(1.05)" }}
        />
        {/* Bottom scrim → seamless fade into the page canvas */}
        <div
          className="absolute inset-x-0 bottom-0 h-full pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, hsl(var(--canvas-hi)) 0%, hsl(var(--canvas-hi) / 0.85) 35%, hsl(var(--canvas-hi) / 0) 100%)",
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-3">
          <div className="text-[9px] tracking-[2.5px] uppercase text-[#7a7060] mb-1">{step}</div>
          <div className="font-headline text-[20px] leading-[1.2] text-[#1a1712]">{title}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

      <div className="px-5 pt-3 pb-6 shrink-0 bg-transparent">{footer}</div>
    </div>
  );
}

export function PrimaryCTA({
  onClick,
  disabled,
  children,
  tone = "ink",
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  tone?: "ink" | "coral";
}) {
  const cls = tone === "coral"
    ? "bg-saffron hover:bg-saffron/90 text-white"
    : "bg-[#1a1712] hover:bg-[#2e2b24] text-[#f5f0e8]";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-4 rounded-2xl text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${cls}`}
    >
      {children}
    </button>
  );
}

export function SkipLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="block w-full text-center text-xs text-[#7a7060] mt-2 py-2">
      {children}
    </button>
  );
}