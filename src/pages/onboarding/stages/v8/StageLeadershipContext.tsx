import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ParchScreen, PrimaryCTA, SkipLink } from "./ShellV8";
import { makeDebouncedSaver, saveV8 } from "@/utils/onboardingV8";
import {
  isHttpUrl,
  isLinkedInUrl,
  normalizeUrl,
  parseWritingUrlsInput,
  MAX_WRITING_URLS,
  MAX_FREETEXT_LEN,
} from "@/utils/onboardingV8Validation";

type Key = "linkedin" | "writing" | "notes";

const CARDS: { key: Key; icon: string; title: string; sub: string; badge: string; placeholder: string; textarea?: boolean }[] = [
  {
    key: "linkedin",
    icon: "in",
    title: "LinkedIn profile",
    sub: "Your role, sector, leadership stage and external persona — read once to calibrate how Mind Module reads your mental state",
    badge: "Strongest context signal",
    placeholder: "linkedin.com/in/yourname",
  },
  {
    key: "writing",
    icon: "✍",
    title: "Published writing or interviews",
    sub: "Substack, articles, podcasts — reveals how you think and communicate under pressure",
    badge: "Cognitive and communication style signal",
    placeholder: "First URL (e.g. yourname.substack.com)",
  },
  {
    key: "notes",
    icon: "◈",
    title: "Anything else that matters",
    sub: "DISC profile, operating principles, current chapter — whatever helps Mind Module understand how your mind works under pressure",
    badge: "High value if you have existing self-knowledge",
    placeholder: "e.g. DISC: High D/C. Direct communicator, prefer frameworks. Currently leading a restructure.",
    textarea: true,
  },
];

export default function StageLeadershipContext() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Record<Key, boolean>>({ linkedin: false, writing: false, notes: false });
  const [values, setValues] = useState<Record<Key, string>>({ linkedin: "", writing: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState<Record<Key, boolean>>({ linkedin: false, writing: false, notes: false });
  const debouncedSave = useMemo(() => makeDebouncedSaver(700), []);

  // Compute validation each render (cheap).
  const writingArr = parseWritingUrlsInput(values.writing);
  const linkedinValid = !selected.linkedin || values.linkedin.trim() === "" || isLinkedInUrl(values.linkedin);
  const writingInvalid = selected.writing && writingArr.some((u) => !isHttpUrl(u));
  const writingOverLimit = selected.writing && values.writing
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean).length > MAX_WRITING_URLS;

  // Debounced autosave whenever text values change — only persist sanitized values.
  useEffect(() => {
    debouncedSave({
      linkedin_url:
        selected.linkedin && values.linkedin.trim() && isLinkedInUrl(values.linkedin)
          ? normalizeUrl(values.linkedin)
          : null,
      writing_urls: selected.writing ? writingArr.filter(isHttpUrl).map(normalizeUrl) : [],
      freetext_context: selected.notes
        ? (values.notes.trim().slice(0, MAX_FREETEXT_LEN) || null)
        : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, selected]);

  const canContinue = linkedinValid && !writingInvalid && !writingOverLimit;

  const next = async () => {
    if (!canContinue) {
      setTouched({ linkedin: true, writing: true, notes: true });
      return;
    }
    setSaving(true);
    await saveV8(
      {
        linkedin_url:
          selected.linkedin && values.linkedin.trim() && isLinkedInUrl(values.linkedin)
            ? normalizeUrl(values.linkedin)
            : null,
        writing_urls: selected.writing ? writingArr.filter(isHttpUrl).map(normalizeUrl) : [],
        freetext_context: selected.notes ? (values.notes.trim().slice(0, MAX_FREETEXT_LEN) || null) : null,
      },
      "leadership_context",
    );
    setSaving(false);
    navigate("/onboarding/cognitive-load");
  };

  return (
    <ParchScreen
      step="Step 1 of 3"
      title="Help Mind Module understand your Leadership Context"
      footer={
        <>
          <PrimaryCTA onClick={next} disabled={saving || !canContinue}>
            {saving ? "Saving…" : "Continue →"}
          </PrimaryCTA>
          <SkipLink onClick={next}>Skip — Mind Module will learn from behaviour</SkipLink>
        </>
      }
    >
      <p className="text-xs text-[#7a7060] leading-[1.65] mb-2">
        The more context Mind Module has, the more precisely it can read your cognitive state and prepare you for what lies ahead — mentally, not operationally.
      </p>
      <div className="inline-flex items-center gap-1.5 rounded-full bg-[#faeeda] border border-[#ba7517]/25 px-3 py-1 mb-4">
        <span className="w-2 h-2 rounded-full bg-[#ba7517]" />
        <span className="text-[10px] text-[#ba7517] font-medium tracking-[0.3px]">
          Read once. Used to calibrate. Never re-accessed.
        </span>
      </div>

      <div className="space-y-2.5">
        {CARDS.map((c) => {
          const sel = selected[c.key];
          const showLinkedInErr = c.key === "linkedin" && sel && touched.linkedin && values.linkedin.trim() !== "" && !isLinkedInUrl(values.linkedin);
          const showWritingErr = c.key === "writing" && sel && touched.writing && (writingInvalid || writingOverLimit);
          return (
            <div
              key={c.key}
              onClick={() => setSelected((p) => ({ ...p, [c.key]: !p[c.key] }))}
              className={`cursor-pointer rounded-[14px] p-4 border transition-colors ${
                sel ? "border-[#1a6b4a] bg-[#e1f0e8]" : "border-[#cfc7b8] bg-white hover:bg-[#ede8dc]"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 text-sm font-semibold ${sel ? "bg-[#1a6b4a]/12 text-[#1a6b4a]" : "bg-[#ede8dc] text-[#7a7060]"}`}>
                  {c.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[#1a1712]">{c.title}</div>
                  <div className="text-[11px] text-[#7a7060] mt-0.5 leading-[1.45]">{c.sub}</div>
                </div>
              </div>
              <div className={`text-[9px] mt-2 px-2.5 py-0.5 rounded-full w-fit font-medium tracking-[0.4px] ${sel ? "bg-[#1a6b4a]/12 text-[#1a6b4a]" : "bg-[#e0d9ce] text-[#7a7060]"}`}>
                {c.badge}
              </div>
              {sel && (
                c.textarea ? (
                  <textarea
                    rows={4}
                    placeholder={c.placeholder}
                    value={values[c.key]}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setValues((p) => ({ ...p, [c.key]: e.target.value }))}
                    onBlur={() => setTouched((p) => ({ ...p, [c.key]: true }))}
                    maxLength={MAX_FREETEXT_LEN}
                    className="w-full mt-2.5 text-xs px-3 py-2.5 rounded-[10px] border border-[#cfc7b8] bg-[#f5f0e8] text-[#1a1712] outline-none focus:border-[#1a6b4a] resize-none"
                  />
                ) : (
                  <input
                    placeholder={c.placeholder}
                    value={values[c.key]}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setValues((p) => ({ ...p, [c.key]: e.target.value }))}
                    onBlur={() => setTouched((p) => ({ ...p, [c.key]: true }))}
                    className="w-full mt-2.5 text-xs px-3 py-2.5 rounded-[10px] border border-[#cfc7b8] bg-[#f5f0e8] text-[#1a1712] outline-none focus:border-[#1a6b4a]"
                  />
                )
              )}
              {showLinkedInErr && (
                <div className="mt-2 text-[11px] text-[#e8714a]">Add a valid LinkedIn URL (e.g. linkedin.com/in/yourname)</div>
              )}
              {showWritingErr && (
                <div className="mt-2 text-[11px] text-[#e8714a]">
                  {writingOverLimit
                    ? `You can add up to ${MAX_WRITING_URLS} writing links`
                    : "Each writing link must be a valid URL"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ParchScreen>
  );
}