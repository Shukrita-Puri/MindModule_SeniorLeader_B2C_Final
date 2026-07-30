import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ParchScreen, PrimaryCTA, SkipLink } from "./ShellV8";
import { loadV8Row, saveV8, type V8Fields } from "@/utils/onboardingV8";
import {
  isHttpUrl,
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
    placeholder: "Paste your LinkedIn About section, current role, or any bio text",
    textarea: true,
  },
  {
    key: "writing",
    icon: "✍",
    title: "Published writing or interviews",
    sub: "Substack, articles, podcasts — reveals how you think and communicate under pressure",
    badge: "Cognitive and communication style signal",
    placeholder: "Paste a paragraph from a recent article, interview, or talk — anything that reflects how you think and communicate",
    textarea: true,
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
  const [linkedinPdfBase64, setLinkedinPdfBase64] = useState<string | null>(null);
  const [linkedinPdfFilename, setLinkedinPdfFilename] = useState<string | null>(null);
  const [homeCountry, setHomeCountry] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<Key, boolean>>({ linkedin: false, writing: false, notes: false });
  const [isHydrated, setIsHydrated] = useState(false);
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const handleLinkedinPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLinkedinPdfFilename(file.name);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = (ev.target?.result as string) ?? '';
      setLinkedinPdfBase64(base64);
      await saveV8({ linkedin_pdf_base64: base64 });
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    let cancelled = false;
    void loadV8Row<{
      writing_urls?: string[];
      freetext_context?: string | null;
      linkedin_pdf_base64?: string | null;
      home_country?: string | null;
    }>().then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) {
        const writing = Array.isArray(res.data.writing_urls) ? res.data.writing_urls.join("\n") : "";
        const notes = res.data.freetext_context ?? "";
        const country = res.data.home_country ?? "";
        const linkedinPdf = res.data.linkedin_pdf_base64 ?? null;
        if (linkedinPdf) setLinkedinPdfBase64(linkedinPdf);
        setValues({ linkedin: "", writing, notes });
        setHomeCountry(country);
        setSelected({
          linkedin: false,
          writing: Boolean(writing),
          notes: Boolean(notes),
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

  const canContinue = true; // All context fields are optional

  const buildFreetextContext = (): string | null => {
    const parts: string[] = [];
    if (selected.linkedin && values.linkedin.trim()) {
      parts.push(`[LINKEDIN ABOUT]\n${values.linkedin.trim()}`);
    }
    if (selected.writing && values.writing.trim()) {
      // Only include non-URL text as writing sample
      const nonUrlLines = values.writing.split('\n').filter(l => l.trim() && !isHttpUrl(l.trim()));
      if (nonUrlLines.length > 0) {
        parts.push(`[WRITING SAMPLE]\n${nonUrlLines.join('\n')}`);
      }
    }
    if (selected.notes && values.notes.trim()) {
      parts.push(`[ADDITIONAL CONTEXT]\n${values.notes.trim()}`);
    }
    return parts.length > 0 ? parts.join('\n\n---\n\n') : null;
  };

  const buildPayload = (): V8Fields => {
    const freetext = buildFreetextContext();
    return {
      linkedin_url: null,
      linkedin_pdf_base64: linkedinPdfBase64 ?? null,
      writing_urls: selected.writing && values.writing.trim()
        ? parseWritingUrlsInput(values.writing).filter(isHttpUrl).map(normalizeUrl)
        : [],
      freetext_context: freetext,
      home_country: homeCountry || null,
    };
  };

  // Debounced autosave whenever text values change — with visible state so
  // users can tell their context was actually recorded.
  useEffect(() => {
    if (!isHydrated) return;
    setAutosaveState("saving");
    const timer = window.setTimeout(() => {
      void saveV8(buildPayload()).then((res) => {
        setAutosaveState(res.ok ? "saved" : "error");
      });
    }, 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, values, selected, linkedinPdfBase64, homeCountry]);

  const next = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    const res = await saveV8(
      {
        ...buildPayload(),
      },
      "leadership_context",
    );
    setSaving(false);
    if (!res.ok) {
      const msg = res.validationErrors?.[0]?.message
        ?? (res.error === "no_auth" ? "Please sign in again to continue." : "Couldn't save — please try again.");
      setSaveError(msg);
      return;
    }
    navigate("/onboarding/cognitive-load");
  };

  const skip = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    // Skip persists nulls/empties — never blocks on invalid input.
    const res = await saveV8(
      { linkedin_url: null, linkedin_pdf_base64: null, writing_urls: [], freetext_context: null },
      "leadership_context",
    );
    setSaving(false);
    if (!res.ok) {
      // Skip is non-blocking — proceed even if save fails.
      navigate("/onboarding/cognitive-load");
      return;
    }
    navigate("/onboarding/cognitive-load");
  };

  return (
    <ParchScreen
      step="Step 1 of 3"
      title="Help Mind Module understand your Leadership Context"
      footer={
        <>
          <PrimaryCTA onClick={next} disabled={saving || !isHydrated}>
            {saving ? "Saving…" : "Continue →"}
          </PrimaryCTA>
          <SkipLink onClick={skip}>Skip — Mind Module will learn from behaviour</SkipLink>
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
      {saveError && (
        <div className="text-[11px] text-saffron mb-2">{saveError}</div>
      )}
      {autosaveState !== "idle" && (
        <div className={`text-[11px] mb-2 ${autosaveState === "error" ? "text-saffron" : "text-[#1a6b4a]"}`}>
          {autosaveState === "saving"
            ? "Saving leadership context…"
            : autosaveState === "saved"
            ? "Leadership context saved."
            : "Couldn't autosave yet — Continue will retry."}
        </div>
      )}

      <div className="space-y-2.5">
        {CARDS.map((c) => {
          const sel = selected[c.key];
          return (
            <div
              key={c.key}
              className={`rounded-[14px] p-4 border transition-colors ${
                sel ? "border-[#1a6b4a] bg-[#e1f0e8]" : "border-[#cfc7b8] bg-white hover:bg-[#ede8dc]"
              }`}
            >
              <button
                type="button"
                onClick={() => setSelected((p) => ({ ...p, [c.key]: !p[c.key] }))}
                className="w-full text-left flex items-start gap-3"
              >
                <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 text-sm font-semibold ${sel ? "bg-[#1a6b4a]/12 text-[#1a6b4a]" : "bg-[#ede8dc] text-[#7a7060]"}`}>
                  {c.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[#1a1712]">{c.title}</div>
                  <div className="text-[11px] text-[#7a7060] mt-0.5 leading-[1.45]">{c.sub}</div>
                </div>
              </button>
              <div className={`text-[9px] mt-2 px-2.5 py-0.5 rounded-full w-fit font-medium tracking-[0.4px] ${sel ? "bg-[#1a6b4a]/12 text-[#1a6b4a]" : "bg-[#e0d9ce] text-[#7a7060]"}`}>
                {c.badge}
              </div>
              {sel && (
                c.textarea ? (
                  <textarea
                    rows={4}
                    placeholder={c.placeholder}
                    value={values[c.key]}
                    onFocus={() => setSelected((p) => ({ ...p, [c.key]: true }))}
                    onChange={(e) => {
                      setSelected((p) => ({ ...p, [c.key]: true }));
                      setValues((p) => ({ ...p, [c.key]: e.target.value }));
                    }}
                    onBlur={() => setTouched((p) => ({ ...p, [c.key]: true }))}
                    maxLength={MAX_FREETEXT_LEN}
                    className="w-full mt-2.5 text-xs px-3 py-2.5 rounded-[10px] border border-[#cfc7b8] bg-[#f5f0e8] text-[#1a1712] outline-none focus:border-[#1a6b4a] resize-none"
                  />
                ) : (
                  <input
                    placeholder={c.placeholder}
                    value={values[c.key]}
                    onFocus={() => setSelected((p) => ({ ...p, [c.key]: true }))}
                    onChange={(e) => {
                      setSelected((p) => ({ ...p, [c.key]: true }));
                      setValues((p) => ({ ...p, [c.key]: e.target.value }));
                    }}
                    onBlur={() => setTouched((p) => ({ ...p, [c.key]: true }))}
                    className="w-full mt-2.5 text-xs px-3 py-2.5 rounded-[10px] border border-[#cfc7b8] bg-[#f5f0e8] text-[#1a1712] outline-none focus:border-[#1a6b4a]"
                  />
                )
              )}
              {c.key === 'linkedin' && sel && (
                <div className="mt-2">
                  <label className="flex items-center gap-2 text-[11px] text-[#1a6b4a] cursor-pointer">
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handleLinkedinPdfUpload}
                      className="hidden"
                    />
                    <span className="px-2.5 py-1 rounded-full border border-[#1a6b4a]/40 bg-white">
                      {linkedinPdfFilename ? `✓ ${linkedinPdfFilename}` : '📄 Upload LinkedIn PDF'}
                    </span>
                  </label>
                  <p className="text-[10px] text-[#7a7060] mt-1">On LinkedIn iOS: tap ··· → Save to PDF</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4">
        <label className="text-[13px] font-medium text-[#1a1712] block mb-1.5">Where are you based?</label>
        <select
          value={homeCountry}
          onChange={(e) => {
            setHomeCountry(e.target.value);
            void saveV8({ home_country: e.target.value || null });
          }}
          className="w-full text-xs px-3 py-2.5 rounded-[10px] border border-[#cfc7b8] bg-[#f5f0e8] text-[#1a1712] outline-none focus:border-[#1a6b4a]"
        >
          <option value="">Select your country (optional)</option>
          {["United States", "United Kingdom", "Australia", "Canada", "Germany", "France", "India", "Singapore", "United Arab Emirates", "Netherlands", "Switzerland", "Japan", "Hong Kong", "Ireland", "Sweden", "Norway", "Denmark", "New Zealand", "Israel", "South Africa", "Other"].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
    </ParchScreen>
  );
}
