import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ParchScreen, PrimaryCTA, SkipLink } from "./ShellV8";
import { saveV8 } from "@/utils/onboardingV8";
import { CALENDAR_PROVIDERS, WEARABLE_PROVIDERS } from "@/utils/onboardingV8Validation";

const CAL = [
  { id: "google", name: "Google Calendar", note: "Reads event titles and times only" },
  { id: "outlook", name: "Microsoft Outlook", note: "Reads event titles and times only" },
  { id: "apple", name: "Apple Calendar", note: "Reads event titles and times only" },
];
const WEAR = [
  { id: "apple-watch", name: "Apple Watch", note: "HRV, sleep, and recovery as background signal" },
  { id: "oura", name: "Oura Ring", note: "HRV, sleep, and recovery as background signal" },
  { id: "whoop", name: "Whoop", note: "HRV, strain, and recovery as background signal" },
];

export default function StagePermissions() {
  const navigate = useNavigate();
  const [cal, setCal] = useState<Set<string>>(new Set());
  const [wear, setWear] = useState<Set<string>>(new Set());
  const [warn, setWarn] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    setter(n);
    setWarn(false);
  };

  const tryContinue = async () => {
    if (cal.size === 0 || wear.size === 0) {
      setWarn(true);
      return;
    }
    const calAllowed = new Set<string>(CALENDAR_PROVIDERS);
    const wearAllowed = new Set<string>(WEARABLE_PROVIDERS);
    const calClean = Array.from(new Set(Array.from(cal).filter((c) => calAllowed.has(c))));
    const wearClean = Array.from(new Set(Array.from(wear).filter((w) => wearAllowed.has(w))));
    if (calClean.length === 0 || wearClean.length === 0) {
      setWarn(true);
      return;
    }
    setSaving(true);
    await saveV8(
      {
        calendar_selections: calClean,
        wearable_selections: wearClean,
      },
      "permissions",
    );
    setSaving(false);
    navigate("/onboarding/done");
  };

  const renderCard = (
    items: { id: string; name: string; note: string }[],
    state: Set<string>,
    setter: (s: Set<string>) => void,
    icon: string,
    iconBg: string,
    requiredOk: boolean,
    firstRequired: boolean,
  ) =>
    items.map((it, i) => {
      const on = state.has(it.id);
      const showFirst = firstRequired && i === 0;
      const cls = warn && !requiredOk
        ? "border-[#e8714a]/50 bg-[#e8714a]/[0.04]"
        : requiredOk
        ? "border-[#1a6b4a]/40 bg-[#1a6b4a]/[0.04]"
        : "border-[#cfc7b8] bg-white";
      return (
        <div key={it.id} className={`flex items-center justify-between gap-3 p-3.5 rounded-[14px] border mb-2 transition-colors ${cls}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 text-lg`} style={{ background: iconBg }}>
              {icon}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-[#1a1712]">{it.name}</div>
              <div className="text-[11px] text-[#7a7060] mt-0.5">{it.note}</div>
              {showFirst && (
                <div className="text-[9px] mt-1 px-2 py-0.5 rounded-full bg-[#e8714a]/12 text-[#e8714a] font-medium tracking-[0.3px] inline-block">
                  Required — select one
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => toggle(state, setter, it.id)}
            className={`relative w-[46px] h-[26px] rounded-full shrink-0 transition-colors ${on ? "bg-[#e8714a]" : "bg-[#e0d9ce]"}`}
            aria-label={`Toggle ${it.name}`}
          >
            <span
              className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-[23px]" : "left-[3px]"}`}
            />
          </button>
        </div>
      );
    });

  return (
    <ParchScreen
      step="Connections"
      title="Give Mind Module the daily context it needs"
      footer={
        <>
          <PrimaryCTA tone="coral" onClick={tryContinue} disabled={saving}>
            {saving ? "Saving…" : "Mind Module is ready — let's go →"}
          </PrimaryCTA>
          <SkipLink onClick={() => navigate("/onboarding/done")}>Skip for now</SkipLink>
        </>
      }
    >
      <p className="text-xs text-[#7a7060] leading-[1.65] mb-2">
        Calendar shows Mind Module what's coming so it can prepare you mentally. Wearable adds physiological signal — HRV, sleep, and recovery — to sharpen the picture.
      </p>

      {warn && (
        <div className="text-[11px] text-[#e8714a] my-2 p-2.5 bg-[#e8714a]/[0.08] border border-[#e8714a]/25 rounded-[10px] leading-[1.5]">
          Connect at least one calendar and one wearable to continue.
        </div>
      )}

      <div className="text-[10px] tracking-[2px] uppercase text-[#7a7060] font-medium mb-2 mt-3">
        Calendar <span className="text-[#e8714a] font-semibold">· required</span>
      </div>
      {renderCard(CAL, cal, setCal, "📅", "#e8f0fe", cal.size > 0, cal.size === 0)}

      <div className="h-px bg-[#cfc7b8] my-3" />
      <div className="text-[10px] tracking-[2px] uppercase text-[#7a7060] font-medium mb-2">
        Wearable <span className="text-[#e8714a] font-semibold">· required</span>
      </div>
      {renderCard(WEAR, wear, setWear, "⌚", "#f3e8ff", wear.size > 0, wear.size === 0)}
    </ParchScreen>
  );
}