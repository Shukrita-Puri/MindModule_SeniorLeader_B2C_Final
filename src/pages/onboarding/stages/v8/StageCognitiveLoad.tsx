import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ParchScreen, PrimaryCTA } from "./ShellV8";

const GROUPS: { title: string; chips: string[] }[] = [
  {
    title: "High-stakes events",
    chips: [
      "Board session", "Investor meeting", "Fundraise / capital raise", "M&A or due diligence",
      "Restructure or redundancy", "Earnings or reporting", "Major negotiation", "Conference or keynote",
      "Media or PR moment", "Crisis response", "Leadership hiring", "Performance review cycle",
    ],
  },
  {
    title: "Trends that weigh on you",
    chips: [
      "Market pressure or headwinds", "Competitive disruption", "Regulatory or compliance shifts",
      "Team culture or morale", "Talent retention", "AI adoption pressure", "Board or investor relations",
      "Strategic ambiguity",
    ],
  },
  {
    title: "Operating burdens",
    chips: [
      "Regular travel", "Multi-day conferences", "Back-to-back intensity", "Timezone shifting",
      "High interpersonal demand", "Disrupted recovery", "Decision overload", "Carrying unresolved decisions",
    ],
  },
];

export default function StageCognitiveLoad() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (c: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });
  };

  return (
    <ParchScreen
      step="Step 1 of 3 · continued"
      title="What creates cognitive load for you?"
      footer={<PrimaryCTA onClick={() => navigate("/onboarding/protect-goals")}>Continue →</PrimaryCTA>}
    >
      <p className="text-xs text-[#7a7060] leading-[1.65] mb-4">
        Select all that apply — to help Mind Module understand your environment and prepare for those most relevant to you.
      </p>

      {GROUPS.map((g, gi) => (
        <div key={g.title}>
          {gi > 0 && <div className="h-px bg-[#cfc7b8] my-3" />}
          <div className="text-[10px] tracking-[2px] uppercase text-[#7a7060] font-medium mb-2">{g.title}</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {g.chips.map((c) => {
              const on = selected.has(c);
              return (
                <button
                  key={c}
                  onClick={() => toggle(c)}
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