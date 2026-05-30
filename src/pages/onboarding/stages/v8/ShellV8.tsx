import { ReactNode } from "react";

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
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f5f0e8] text-[#1a1712] overflow-hidden pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
      {/* Art band */}
      <div className="relative shrink-0 h-[120px] bg-[#1a1712] overflow-hidden">
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-[#f5f0e8]" />
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-3">
          <div className="text-[9px] tracking-[2.5px] uppercase text-[#7a7060] mb-1">{step}</div>
          <div className="font-headline text-[20px] leading-[1.2] text-[#1a1712]">{title}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

      <div className="px-5 pt-3 pb-6 shrink-0 bg-[#f5f0e8]">{footer}</div>
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
    ? "bg-[#e8714a] hover:bg-[#c55a35] text-white"
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