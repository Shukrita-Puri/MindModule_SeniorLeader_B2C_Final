import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ParchScreen, PrimaryCTA } from "./ShellV8";
import { saveV8 } from "@/utils/onboardingV8";
import { CALENDAR_PROVIDERS, WEARABLE_PROVIDERS } from "@/utils/onboardingV8Validation";
import googleCalLogo from "@/assets/shared/google-calendar-logo.avif";
import outlookLogo from "@/assets/shared/microsoft-calendar-logo.png";
import appleCalLogo from "@/assets/shared/apple-calendar-logo.png";
import appleHealthLogo from "@/assets/shared/apple-health-logo.png";
import ouraLogo from "@/assets/shared/oura-ring-logo.png";
import whoopLogo from "@/assets/shared/whoop-logo.png";

const CAL = [
  { id: "google", name: "Google Calendar", note: "Reads event titles and times only", logo: googleCalLogo },
  { id: "outlook", name: "Microsoft Outlook", note: "Reads event titles and times only", logo: outlookLogo },
  { id: "apple", name: "Apple Calendar", note: "Reads event titles and times only", logo: appleCalLogo },
];
const WEAR = [
  { id: "apple-watch", name: "Apple Watch", note: "HRV, sleep, and recovery as background signal", logo: appleHealthLogo },
  { id: "oura", name: "Oura Ring", note: "HRV, sleep, and recovery as background signal", logo: ouraLogo },
  { id: "whoop", name: "Whoop", note: "HRV, strain, and recovery as background signal", logo: whoopLogo },
];

export default function StagePermissions() {
  const navigate = useNavigate();
  const [cal, setCal] = useState<Set<string>>(new Set());
  const [wear, setWear] = useState<Set<string>>(new Set());
  const [warn, setWarn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    setter(n);
    setWarn(false);
  };

  const tryContinue = async () => {
    if (saving) return;
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
    setSaveError(null);
    const res = await saveV8(
      {
        calendar_selections: calClean,
        wearable_selections: wearClean,
      },
      "permissions",
    );
    setSaving(false);
    if (!res.ok) {
      const msg = res.validationErrors?.[0]?.message
        ?? (res.error === "no_auth" ? "Please sign in again to continue." : "Couldn't save — please try again.");
      setSaveError(msg);
      return;
    }
    navigate("/onboarding/done");
  };

  const renderCard = (
    items: { id: string; name: string; note: string; logo: string }[],
    state: Set<string>,
    setter: (s: Set<string>) => void,
    requiredOk: boolean,
  ) =>
    items.map((it, i) => {
      const on = state.has(it.id);
      const cls = warn && !requiredOk
        ? "border-[#e8714a]/50 bg-[#e8714a]/[0.04]"
        : requiredOk
        ? "border-[#1a1712]/35 bg-[#1a1712]/[0.04]"
        : "border-[#cfc7b8] bg-white";
      return (
        <div key={it.id} className={`flex items-center justify-between gap-3 p-3.5 rounded-[14px] border mb-2 transition-colors ${cls}`}>
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={it.logo}
              alt=""
              loading="lazy"
              width={36}
              height={36}
              className="w-9 h-9 rounded-[10px] object-contain bg-white p-1 border border-[#cfc7b8] shrink-0"
            />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-[#1a1712]">{it.name}</div>
              <div className="text-[11px] text-[#7a7060] mt-0.5">{it.note}</div>
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
        <PrimaryCTA tone="coral" onClick={tryContinue} disabled={saving}>
          {saving ? "Saving…" : "Mind Module is ready — let's go →"}
        </PrimaryCTA>
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
      {saveError && (
        <div className="text-[11px] text-[#e8714a] my-2 p-2.5 bg-[#e8714a]/[0.08] border border-[#e8714a]/25 rounded-[10px] leading-[1.5]">
          {saveError}
        </div>
      )}

      <div className="text-[10px] tracking-[2px] uppercase text-[#7a7060] font-medium mb-2 mt-3">
        Calendar <span className="text-[#e8714a] font-semibold">· Required – select one</span>
      </div>
      {renderCard(CAL, cal, setCal, cal.size > 0)}

      <div className="h-px bg-[#cfc7b8] my-3" />
      <div className="text-[10px] tracking-[2px] uppercase text-[#7a7060] font-medium mb-2">
        Wearable <span className="text-[#e8714a] font-semibold">· Required – select one</span>
      </div>
      {renderCard(WEAR, wear, setWear, wear.size > 0)}
    </ParchScreen>
  );
}