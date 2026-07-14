import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ParchScreen, PrimaryCTA } from "./ShellV8";
import { loadV8Row, saveV8 } from "@/utils/onboardingV8";
import { STAKES_CHIPS, LOAD_CHIPS, BURDEN_CHIPS } from "@/utils/onboardingV8Validation";

const GROUPS: { key: "stakes" | "load" | "burden"; title: string; chips: string[] }[] = [
  {
    key: "stakes",
    title: "High-stakes events",
    chips: [
      "Board session", "Investor meeting", "Fundraise / capital raise", "M&A or due diligence",
      "Restructure or redundancy", "Earnings or reporting", "Major negotiation", "Conference or keynote",
      "Media or PR moment", "Crisis response", "Leadership hiring", "Performance review cycle",
    ],
  },
  {
    key: "load",
    title: "Trends that weigh on you",
    chips: [
      "Market pressure or headwinds", "Competitive disruption", "Regulatory or compliance shifts",
      "Team culture or morale", "Talent retention", "AI adoption pressure", "Board or investor relations",
      "Strategic ambiguity",
    ],
  },
  {
    key: "burden",
    title: "Operating burdens",
    chips: [
      "Regular travel", "Multi-day conferences", "Back-to-back intensity", "Timezone shifting",
      "High interpersonal demand", "Disrupted recovery", "Decision overload", "Carrying unresolved decisions",
    ],
  },
];

export default function StageCognitiveLoad() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Record<"stakes" | "load" | "burden", Set<string>>>({
    stakes: new Set(),
    load: new Set(),
    burden: new Set(),
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadV8Row<{
      stakes_chips?: string[];
      load_chips?: string[];
      burden_chips?: string[];
    }>().then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) {
        setSelected({
          stakes: new Set(res.data.stakes_chips ?? []),
          load: new Set(res.data.load_chips ?? []),
          burden: new Set(res.data.burden_chips ?? []),
        });
      }
      setIsHydrated(true);
    }).catch(() => {
      if (!cancelled) setIsHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (group: "stakes" | "load" | "burden", c: string) => {
    setSelected((prev) => {
      const n = new Set(prev[group]);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return { ...prev, [group]: n };
    });
  };

  const next = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    const stakesAllowed = new Set<string>(STAKES_CHIPS);
    const loadAllowed = new Set<string>(LOAD_CHIPS);
    const burdenAllowed = new Set<string>(BURDEN_CHIPS);
    const res = await saveV8(
      {
        stakes_chips: Array.from(new Set(Array.from(selected.stakes).filter((c) => stakesAllowed.has(c)))),
        load_chips: Array.from(new Set(Array.from(selected.load).filter((c) => loadAllowed.has(c)))),
        burden_chips: Array.from(new Set(Array.from(selected.burden).filter((c) => burdenAllowed.has(c)))),
      },
      "cognitive_load",
    );
    setSaving(false);
    if (!res.ok) {
      const msg = res.validationErrors?.[0]?.message
        ?? (res.error === "no_auth" ? "Please sign in again to continue." : "Couldn't save — please try again.");
      setSaveError(msg);
      return;
    }
    navigate("/onboarding/protect-goals");
  };

  return (
    <ParchScreen
      step="Step 1 of 3 · continued"
      title="What creates cognitive load for you?"
      footer={<PrimaryCTA onClick={next} disabled={saving || !isHydrated}>{saving ? "Saving…" : "Continue →"}</PrimaryCTA>}
    >
      <p className="text-xs text-[#7a7060] leading-[1.65] mb-4">
        Select all that apply — to help Mind Module understand your environment and prepare for those most relevant to you.
      </p>
      {saveError && (
        <div className="text-[11px] text-saffron mb-3">{saveError}</div>
      )}

      {GROUPS.map((g, gi) => (
        <div key={g.title}>
          {gi > 0 && <div className="h-px bg-[#cfc7b8] my-3" />}
          <div className="text-[10px] tracking-[2px] uppercase text-[#7a7060] font-medium mb-2">{g.title}</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {g.chips.map((c) => {
              const on = selected[g.key].has(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggle(g.key, c)}
                  className={`px-3.5 py-2 rounded-full text-xs border transition-colors whitespace-nowrap ${
                    on
                      ? "bg-[#1a1712] border-[#1a1712] text-[#f5f0e8]"
                      : "bg-white border-[#cfc7b8] text-[#7a7060] hover:bg-[#ede8dc]"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </ParchScreen>
  );
}
