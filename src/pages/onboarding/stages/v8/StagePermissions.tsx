import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ParchScreen, PrimaryCTA } from "./ShellV8";
import { loadV8Row, saveV8 } from "@/utils/onboardingV8";
import { CALENDAR_PROVIDERS, WEARABLE_PROVIDERS } from "@/utils/onboardingV8Validation";
import { CALENDAR_PROVIDER_META, WEARABLE_PROVIDER_META } from "@/utils/providerMetadata";
import ConnectionsPanel from "@/components/connections/ConnectionsPanel";
import type { CalendarProviderId } from "@/components/calendar/CalendarProviderPicker";
import type { WearableProviderId } from "@/components/connections/WearableProviderPicker";
import googleCalLogo from "@/assets/shared/google-calendar-logo.avif";
import outlookLogo from "@/assets/shared/microsoft-calendar-logo.png";
import appleCalLogo from "@/assets/shared/apple-calendar-logo.png";
import appleHealthLogo from "@/assets/shared/apple-health-logo.png";
import ouraLogo from "@/assets/shared/oura-ring-logo.png";

const CAL = [
  { id: "google", ...CALENDAR_PROVIDER_META.google, logo: googleCalLogo },
  { id: "microsoft", ...CALENDAR_PROVIDER_META.microsoft, logo: outlookLogo },
  { id: "apple", ...CALENDAR_PROVIDER_META.apple, logo: appleCalLogo },
];
const WEAR = [
  { id: "apple-watch", name: WEARABLE_PROVIDER_META["apple-health"].name, note: WEARABLE_PROVIDER_META["apple-health"].note, logo: appleHealthLogo },
  { id: "oura", ...WEARABLE_PROVIDER_META.oura, logo: ouraLogo },
];

export default function StagePermissions() {
  const navigate = useNavigate();
  const [cal, setCal] = useState<Set<string>>(new Set());
  const [wear, setWear] = useState<Set<string>>(new Set());
  const [warn, setWarn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadV8Row<{
      calendar_selections?: string[];
      wearable_selections?: string[];
    }>().then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) {
        const calAllowed = new Set<string>(CALENDAR_PROVIDERS);
        const wearAllowed = new Set<string>(WEARABLE_PROVIDERS);
        setCal(new Set((res.data.calendar_selections ?? []).filter((item) => calAllowed.has(item))));
        setWear(new Set((res.data.wearable_selections ?? []).filter((item) => wearAllowed.has(item))));
      }
      setIsHydrated(true);
    }).catch(() => {
      if (!cancelled) setIsHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
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

  const selectedCalendars = Array.from(cal) as CalendarProviderId[];
  const selectedWearables = Array.from(wear) as WearableProviderId[];

  const renderCard = (
    items: { id: string; name: string; note: string; logo: string }[],
    state: Set<string>,
    setter: (s: Set<string>) => void,
    requiredOk: boolean,
  ) =>
    items.map((it, i) => {
      const on = state.has(it.id);
      const cls = warn && !requiredOk
        ? "border-saffron/50 bg-saffron/5"
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
            type="button"
            onClick={() => toggle(state, setter, it.id)}
            className={`relative w-[46px] h-[26px] rounded-full shrink-0 transition-colors ${on ? "bg-saffron" : "bg-[#e0d9ce]"}`}
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
        <PrimaryCTA tone="coral" onClick={tryContinue} disabled={saving || !isHydrated}>
          {saving ? "Saving…" : !isHydrated ? "Loading…" : "Continue →"}
        </PrimaryCTA>
      }
    >
      <p className="text-xs text-[#7a7060] leading-[1.65] mb-2">
        Calendar shows Mind Module what's coming so it can prepare you mentally. Wearable adds physiological signal — HRV, sleep, and recovery — to sharpen the picture.
      </p>

      {warn && (
        <div className="text-[11px] text-saffron my-2 p-2.5 bg-saffron/10 border border-saffron/25 rounded-[10px] leading-[1.5]">
          Connect at least one calendar and one wearable to continue.
        </div>
      )}
      {saveError && (
        <div className="text-[11px] text-saffron my-2 p-2.5 bg-saffron/10 border border-saffron/25 rounded-[10px] leading-[1.5]">
          {saveError}
        </div>
      )}

      <div className="text-[10px] tracking-[2px] uppercase text-[#7a7060] font-medium mb-2 mt-3">
        Calendar <span className="text-saffron font-semibold">· Required – select one</span>
      </div>
      {renderCard(CAL, cal, setCal, cal.size > 0)}

      <div className="h-px bg-[#cfc7b8] my-3" />
      <div className="text-[10px] tracking-[2px] uppercase text-[#7a7060] font-medium mb-2">
        Wearable <span className="text-saffron font-semibold">· Required – select one</span>
      </div>
      {renderCard(WEAR, wear, setWear, wear.size > 0)}

      {(selectedCalendars.length > 0 || selectedWearables.length > 0) && (
        <>
          <div className="h-px bg-[#cfc7b8] my-4" />
          <div className="text-[10px] tracking-[2px] uppercase text-[#7a7060] font-medium mb-2">
            Connect selected data
          </div>
          <p className="text-[11px] text-[#7a7060] leading-[1.55] mb-3">
            Use Connect on each selected provider now, or continue and finish setup later from Profile.
          </p>
          <ConnectionsPanel
            calendarOnly={selectedCalendars}
            wearableOnly={selectedWearables}
            redirectPath="/onboarding/permissions"
          />
        </>
      )}
    </ParchScreen>
  );
}
