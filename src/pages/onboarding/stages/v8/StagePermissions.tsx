import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ParchScreen, PrimaryCTA } from "./ShellV8";
import { saveV8 } from "@/utils/onboardingV8";
import { CALENDAR_PROVIDERS, WEARABLE_PROVIDERS } from "@/utils/onboardingV8Validation";
import ConnectionsPanel from "@/components/connections/ConnectionsPanel";
import { fetchCalendarProvidersState } from "@/components/calendar/CalendarProviderPicker";
import { fetchWearableProvidersState } from "@/components/connections/WearableProviderPicker";

export default function StagePermissions() {
  const navigate = useNavigate();
  const [warn, setWarn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const tryContinue = async () => {
    if (saving) return;
    const calAllowed = new Set<string>(CALENDAR_PROVIDERS);
    const wearAllowed = new Set<string>(WEARABLE_PROVIDERS);

    setSaving(true);
    setSaveError(null);

    const [calendarResult, wearableResult] = await Promise.all([
      fetchCalendarProvidersState(),
      fetchWearableProvidersState(),
    ]);

    const calClean = (["google", "microsoft", "apple"] as const)
      .filter((id) => calendarResult.providers[id]?.connected)
      .filter((id) => calAllowed.has(id));
    const wearClean = [
      wearableResult.providers.appleWatch?.connected ? "apple-watch" : null,
      wearableResult.providers.oura?.connected ? "oura" : null,
      wearableResult.providers.whoop?.connected ? "whoop" : null,
    ].filter((id): id is "apple-watch" | "oura" | "whoop" => !!id && wearAllowed.has(id));

    if (calClean.length === 0 || wearClean.length === 0) {
      setWarn(true);
      setSaving(false);
      return;
    }

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

  return (
    <ParchScreen
      step="Connections"
      title="Give Mind Module the daily context it needs"
      footer={
        <PrimaryCTA tone="coral" onClick={tryContinue} disabled={saving}>
          {saving ? "Checking…" : "Continue →"}
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

      <div className="h-px bg-[#cfc7b8] my-4" />
      <ConnectionsPanel
        redirectPath="/onboarding/permissions"
        onChanged={() => {
          setWarn(false);
          setSaveError(null);
        }}
      />
    </ParchScreen>
  );
}
