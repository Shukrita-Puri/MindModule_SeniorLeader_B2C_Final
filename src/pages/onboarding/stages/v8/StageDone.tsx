import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { markV8Complete, synthesizeCosProfile } from "@/utils/onboardingV8";

export default function StageDone() {
  const navigate = useNavigate();
  const { recordStep } = useOnboardingProgress();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enter = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);

    // 1. Await COS synthesis. It's idempotent — returns cached profile if already ready.
    const syn = await synthesizeCosProfile();
    if (!syn.ok) {
      setBusy(false);
      if (syn.error === "rate_limited") setError("Mind Module is busy — please retry in a moment.");
      else if (syn.error === "payment_required") setError("AI credits unavailable. Please contact support.");
      else setError("Couldn't finish calibrating your profile. Please try again.");
      return;
    }

    // 2. Only mark complete after synthesis succeeded.
    const res = await markV8Complete();
    if (!res.ok) {
      setBusy(false);
      if (res.error === "validation_failed") {
        const fields = (res.validationErrors ?? []).map((e) => e.field);
        if (fields.includes("calendar_selections") || fields.includes("wearable_selections")) {
          setError("Connect at least one calendar and one wearable to finish.");
          setTimeout(() => navigate("/onboarding/permissions"), 1200);
          return;
        }
        if (fields.includes("goals")) {
          setError("Select at least 1 goal to finish.");
          setTimeout(() => navigate("/onboarding/protect-goals"), 1200);
          return;
        }
        if (fields.includes("cos_profile")) {
          setError("Profile calibration didn't complete. Please try again.");
          return;
        }
        setError("Some onboarding info is missing — please complete the previous steps.");
        return;
      }
      setError("Couldn't finalise onboarding. Please try again.");
      return;
    }
    // 3. Only mark legacy onboarding completion after server-side completion succeeded.
    try { await recordStep("context_connection", { completed: true }); } catch { /* non-blocking */ }
    navigate("/daily-check-in");
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-app-surface text-[#1a1712] overflow-hidden pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex items-center justify-between px-6 pt-4 shrink-0">
        <div className="inline-flex items-center gap-2 rounded-full bg-[#1a1712]/5 border border-[#1a1712]/10 py-1.5 pl-1.5 pr-3.5">
          <span className="w-6 h-6 rounded-full bg-[#ba7517]" />
          <span className="text-[10px] tracking-[2px] uppercase text-[#1a1712]/40">Mind Module</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-4 flex flex-col items-center">
        <div className="w-[60px] h-[60px] rounded-full bg-[#ede8dc] border border-[#1a1712]/15 flex items-center justify-center mb-3.5 mt-3 shrink-0">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="13" stroke="#1a1712" strokeWidth="1" />
            <path d="M8 14.5l4.5 4.5 7.5-9" stroke="#1a1712" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h1 className="font-headline text-[24px] text-center leading-[1.2] mb-1.5">
          Mind Module is<br />operational.
        </h1>
        <p className="text-xs text-[#7a7060] text-center leading-[1.65] mb-4">
          Calibrated for your mind. Ready to brief you.<br />
          It acts on mental performance — before it slips.
        </p>

        <div className="w-full bg-[#1a1712] rounded-[14px] p-4 mb-3">
          <div className="text-[9px] tracking-[2px] uppercase text-white/35 mb-3">Your first 24 hours with Mind Module</div>
          <div className="space-y-2.5">
            {[
              { c: "rgba(232,113,74,0.15)", b: "rgba(232,113,74,0.3)", icon: "◎", t: "Check in → Today, Brief & Plan", d: "Mind Module reads your cognitive state and calendar — builds a 24-hour mental performance plan with protocols allocated to your priorities" },
              { c: "rgba(186,117,23,0.18)", b: "rgba(186,117,23,0.35)", icon: "◈", t: "Recalibrate between moments", d: "Pause → Composure · Focus → Clarity · Reenergise → Capacity. Use whenever you need to reset." },
              { c: "rgba(186,117,23,0.15)", b: "rgba(186,117,23,0.3)", icon: "◑", t: "Performance Patterns", d: "Builds over time. Explore whenever you're ready — no action needed today." },
            ].map((r) => (
              <div key={r.t} className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[11px] text-white" style={{ background: r.c, border: `0.5px solid ${r.b}` }}>
                  {r.icon}
                </div>
                <div>
                  <div className="text-xs font-medium text-[#f5f0e8]">{r.t}</div>
                  <div className="text-[11px] text-white/45 mt-0.5 leading-[1.5]">{r.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full bg-[#ede8dc] border border-[#cfc7b8] rounded-[10px] p-3 mb-2">
          <div className="text-[10px] text-[#7a7060] leading-[1.6]">
            Mind Module focuses entirely on your mental performance — not tasks, calendar management, or productivity. Recalibration and Performance Patterns are always available — explore them whenever you want.
          </div>
        </div>
      </div>

      <div className="px-5 pt-3 pb-7 shrink-0">
        {error && (
          <div className="text-[11px] text-saffron mb-2 p-2.5 bg-saffron/10 border border-saffron/25 rounded-[10px] leading-[1.5]">
            {error}
          </div>
        )}
        <button
          onClick={enter}
          disabled={busy}
          className="w-full py-4 rounded-2xl bg-saffron hover:bg-saffron/90 text-white text-sm font-medium transition-colors disabled:opacity-60"
        >
          {busy ? "Calibrating your profile…" : "Enter the brief →"}
        </button>
      </div>
    </div>
  );
}