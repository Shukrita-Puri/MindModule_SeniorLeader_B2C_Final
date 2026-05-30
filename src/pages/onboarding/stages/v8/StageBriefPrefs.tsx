import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ParchScreen, PrimaryCTA } from "./ShellV8";

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

  return (
    <ParchScreen
      step="Step 3 of 3"
      title="How your brief works"
      footer={<PrimaryCTA onClick={() => navigate("/onboarding/permissions")}>Continue →</PrimaryCTA>}
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