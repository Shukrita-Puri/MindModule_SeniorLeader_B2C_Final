import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ParchScreen, PrimaryCTA } from "./ShellV8";
import { saveV8 } from "@/utils/onboardingV8";
import { BRIEF_TIMING, RESET_MODALITY, WEEKEND_SIGNALS } from "@/utils/onboardingV8Validation";

type Row = { key: string; label: string; note: string; options: string[]; hint?: string };

const ROWS: Row[] = [
  {
    key: "timing",
    label: "Brief timing",
    note: "When to prompt your check-in",
    options: ["Morning", "Evening", "Use intelligence"],
    hint: "Use intelligence — Mind Module learns your performance patterns and prompts at your optimal window.",
  },
  {
    key: "reset",
    label: "Reset modality",
    note: "Preferred format for Pause, Focus, Reenergise",
    options: ["Sound", "Guided", "Mindset", "Use intelligence"],
  },
  {
    key: "weekends",
    label: "Signals on weekends",
    note: "Proactive push notifications Sat–Sun",
    options: ["Reduce", "Keep"],
  },
];

export default function StageBriefPrefs() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<Record<string, string>>({
    timing: "Morning",
    reset: "Sound",
    weekends: "Reduce",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const next = async () => {
    if (saving) return;
    const timingOk = (BRIEF_TIMING as readonly string[]).includes(prefs.timing);
    const resetOk = (RESET_MODALITY as readonly string[]).includes(prefs.reset);
    const weekendsOk = (WEEKEND_SIGNALS as readonly string[]).includes(prefs.weekends);
    if (!timingOk || !resetOk || !weekendsOk) {
      // Reset corrupted local state to safe defaults and refuse to advance.
      setPrefs({
        timing: timingOk ? prefs.timing : "Morning",
        reset: resetOk ? prefs.reset : "Sound",
        weekends: weekendsOk ? prefs.weekends : "Reduce",
      });
      return;
    }
    setSaving(true);
    setSaveError(null);
    const res = await saveV8(
      {
        brief_timing: prefs.timing,
        reset_modality: prefs.reset,
        weekend_signals: prefs.weekends,
      },
      "brief_prefs",
    );
    setSaving(false);
    if (!res.ok) {
      const msg = res.validationErrors?.[0]?.message
        ?? (res.error === "no_auth" ? "Please sign in again to continue." : "Couldn't save — please try again.");
      setSaveError(msg);
      return;
    }
    // Synthesis is deferred until permissions/connections are saved.
    // See StageDone.tsx — it runs synthesizeCosProfile() with the full row.
    navigate("/onboarding/permissions");
  };

  return (
    <ParchScreen
      step="Step 3 of 3"
      title="How your brief works"
      footer={
        <div className="w-full">
          {saveError && (
            <div className="text-[11px] text-saffron mb-2 px-3 py-2 bg-saffron/10 border border-saffron/25 rounded-[10px] leading-[1.5]">
              {saveError}
            </div>
          )}
          <PrimaryCTA onClick={next} disabled={saving}>{saving ? "Saving…" : "Continue →"}</PrimaryCTA>
        </div>
      }
    >
      <p className="text-xs text-[#7a7060] leading-[1.65] mb-1">
        Your brief is built whenever you check in — Mind Module reads the time of day, your calendar, and your cognitive state to generate a 24-hour mental performance plan with protocols allocated to your priorities.
      </p>
      <p className="text-[11px] text-[#7a7060] italic mb-3.5">Adjustable any time in Settings.</p>

      <div className="space-y-2.5">
        {ROWS.map((r) => (
          <div key={r.key} className="border border-[#cfc7b8] rounded-[14px] bg-white p-3.5">
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[#1a1712]">{r.label}</div>
                <div className="text-[11px] text-[#7a7060] mt-0.5 leading-[1.4]">{r.note}</div>
              </div>
              <div className="flex flex-wrap justify-end gap-1 max-w-[195px]">
                {r.options.map((o) => {
                  const on = prefs[r.key] === o;
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setPrefs((p) => ({ ...p, [r.key]: o }))}
                      className={`px-2.5 py-1.5 rounded-full text-[11px] font-medium border whitespace-nowrap transition-colors ${
                        on ? "bg-[#1a1712] border-[#1a1712] text-[#f5f0e8]" : "bg-[#f5f0e8] border-[#cfc7b8] text-[#7a7060]"
                      }`}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            </div>
            {r.hint && (
              <div className="mt-2 text-[11px] text-[#7a7060] leading-[1.5] p-2.5 bg-[#ede8dc] rounded-lg">
                {r.hint}
              </div>
            )}
          </div>
        ))}
      </div>
    </ParchScreen>
  );
}