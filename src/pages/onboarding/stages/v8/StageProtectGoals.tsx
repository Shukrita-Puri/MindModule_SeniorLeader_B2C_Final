import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ParchScreen, PrimaryCTA } from "./ShellV8";
import { saveV8 } from "@/utils/onboardingV8";
import { GOAL_IDS, MAX_GOALS } from "@/utils/onboardingV8Validation";

const GOALS = [
  { id: "regulated", main: "Stay regulated under sustained pressure", sub: "Composure and clarity across high-intensity periods", tag: "Available now" },
  { id: "prepare", main: "Prepare before high-stakes events", sub: "Board, investor, negotiation — Prepare protocols activate 24–48h ahead", tag: "Available now" },
  { id: "recover", main: "Recover capacity after intensity", sub: "Structured Resets after hard days, travel, and back-to-back output", tag: "Available now" },
  { id: "sustain", main: "Sustain performance across multi-day intensity", sub: "Conferences, travel blocks, repeated executive output — managed proactively", tag: "Available now" },
  { id: "decision", main: "Protect decision quality under cognitive load", sub: "Clear thinking when stakes and load are simultaneously highest", tag: "Available now via protocols" },
  { id: "people", main: "Navigate difficult people situations sharply", sub: "Relational performance — composure and precision when it matters most", tag: "Available now via protocols" },
  { id: "models", main: "Build stronger mental models under pressure", sub: "Structured thinking frameworks for ambiguity and complexity", tag: "Expanding soon" },
  { id: "patterns", main: "Understand my own performance patterns", sub: "Learn when I'm sharpest, what depletes me, how to prepare more effectively", tag: "Expanding soon" },
];
const MAX = MAX_GOALS;
const ALLOWED_GOAL_IDS = new Set<string>(GOAL_IDS);

export default function StageProtectGoals() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showLimit, setShowLimit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const next = async () => {
    if (saving) return;
    if (selected.size === 0 || selected.size > MAX) return;
    setSaving(true);
    setSaveError(null);
    const goals = Array.from(new Set(Array.from(selected).filter((g) => ALLOWED_GOAL_IDS.has(g)))).slice(0, MAX);
    const res = await saveV8({ goals }, "protect_goals");
    setSaving(false);
    if (!res.ok) {
      const msg = res.validationErrors?.[0]?.message
        ?? (res.error === "no_auth" ? "Please sign in again to continue." : "Couldn't save — please try again.");
      setSaveError(msg);
      return;
    }
    navigate("/onboarding/brief-prefs");
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
        setShowLimit(false);
      } else {
        if (n.size >= MAX) {
          setShowLimit(true);
          return prev;
        }
        n.add(id);
        setShowLimit(false);
      }
      return n;
    });
  };

  return (
    <ParchScreen
      step="Step 2 of 3"
      title="What should Mind Module protect?"
      footer={
        <PrimaryCTA disabled={selected.size === 0 || saving} onClick={next}>
          {saving ? "Saving…" : "Continue →"}
        </PrimaryCTA>
      }
    >
      <p className="text-xs text-[#7a7060] leading-[1.65] mb-1">
        Select up to 3. Your daily brief and protocols will be oriented around these — focused entirely on your mental performance, not your tasks or productivity.
      </p>
      <p className="text-[11px] text-[#7a7060] italic mb-3">
        Your selections also shape which capabilities we build for you next.
      </p>
      {showLimit && (
        <div className="text-[11px] text-[#e8714a] mb-2">Maximum 3 selected — deselect one to change</div>
      )}
      {saveError && (
        <div className="text-[11px] text-[#e8714a] mb-2">{saveError}</div>
      )}

      <div className="space-y-2">
        {GOALS.map((g) => {
          const sel = selected.has(g.id);
          return (
            <div
              key={g.id}
              onClick={() => toggle(g.id)}
              className={`cursor-pointer flex items-start gap-3 p-3.5 rounded-[14px] border transition-colors ${
                sel ? "border-[#ba7517] bg-[#faeeda]" : "border-[#cfc7b8] bg-white hover:bg-[#ede8dc]"
              }`}
            >
              <div
                className={`w-[19px] h-[19px] rounded-[5px] flex items-center justify-center text-[11px] shrink-0 mt-0.5 ${
                  sel ? "bg-[#ba7517] border-[#ba7517] text-white" : "border border-[#cfc7b8] text-transparent"
                }`}
              >
                ✓
              </div>
              <div>
                <div className="text-xs font-medium text-[#1a1712] leading-[1.35]">{g.main}</div>
                <div className="text-[11px] text-[#7a7060] mt-0.5 leading-[1.4]">{g.sub}</div>
                <div className={`inline-block text-[9px] mt-1 px-2 py-0.5 rounded-full font-medium tracking-[0.3px] ${
                  sel ? "bg-[#ba7517]/18 text-[#854f0b]" : "bg-[#e0d9ce] text-[#7a7060]"
                }`}>
                  {g.tag}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ParchScreen>
  );
}