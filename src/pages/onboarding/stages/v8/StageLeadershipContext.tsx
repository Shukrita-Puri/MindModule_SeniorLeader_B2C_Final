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
import { getAuthToken, getEdgeFunctionHeaders } from "@/services/authTokenService";
import { getSupabaseFunctionUrl } from "@/utils/supabaseFunctions";

type ScrapeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; name?: string | null; headline?: string | null }
  | { status: "insufficient"; message: string }
  | { status: "url_only"; message: string }
  | { status: "error"; message: string };

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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<Key, boolean>>({ linkedin: false, writing: false, notes: false });
  const [scrape, setScrape] = useState<ScrapeState>({ status: "idle" });
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

  const linkedinReady =
    selected.linkedin && values.linkedin.trim() !== "" && isLinkedInUrl(values.linkedin);

  const verifyLinkedin = async () => {
    if (!linkedinReady) return;
    setScrape({ status: "loading" });
    try {
      const token = await getAuthToken();
      if (!token) {
        setScrape({ status: "error", message: "Please sign in again to verify." });
        return;
      }
      const headers = await getEdgeFunctionHeaders();
      const res = await fetch(getSupabaseFunctionUrl("linkedin-profile-scrape"), {
        method: "POST",
        headers,
        body: JSON.stringify({ linkedinUrl: normalizeUrl(values.linkedin) }),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const message =
          (data as { message?: string })?.message ||
          "We couldn't verify that LinkedIn URL. You can retry or continue manually.";
        setScrape({ status: "error", message });
        return;
      }
      const status = (data as { status?: string })?.status;
      const profile = (data as { profile?: { full_name?: string; headline?: string } })?.profile;
      if (status === "insufficient") {
        setScrape({
          status: "insufficient",
          message:
            (data as { message?: string })?.message ||
            "We couldn't read enough from that page. You can retry or continue manually.",
        });
        return;
      }
      if (status === "url_only") {
        setScrape({
          status: "url_only",
          message:
            (data as { message?: string })?.message ||
            "Saved your LinkedIn URL. We'll use it for context even without auto-import.",
        });
        return;
      }
      setScrape({
        status: "ok",
        name: profile?.full_name ?? null,
        headline: profile?.headline ?? null,
      });
    } catch (err) {
      console.warn("[StageLeadershipContext] verify error:", err);
      setScrape({
        status: "error",
        message: "Couldn't reach the verification service. Please retry.",
      });
    }
  };

  const next = async () => {
    if (saving) return;
    if (!canContinue) {
      setTouched({ linkedin: true, writing: true, notes: true });
      return;
    }
    setSaving(true);
    setSaveError(null);
    const res = await saveV8(
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
      { linkedin_url: null, writing_urls: [], freetext_context: null },
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
          <PrimaryCTA onClick={next} disabled={saving || !canContinue}>
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
                <div className="mt-2 text-[11px] text-saffron">Add a valid LinkedIn URL (e.g. linkedin.com/in/yourname)</div>
              )}
              {c.key === "linkedin" && linkedinReady && (
                <div className="mt-2 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={verifyLinkedin}
                    disabled={scrape.status === "loading"}
                    className="self-start text-[11px] px-2.5 py-1 rounded-full border border-[#1a6b4a]/40 text-[#1a6b4a] bg-white disabled:opacity-60"
                  >
                    {scrape.status === "loading"
                      ? "Verifying…"
                      : scrape.status === "ok" || scrape.status === "insufficient" || scrape.status === "url_only" || scrape.status === "error"
                      ? "Retry verification"
                      : "Verify with LinkedIn"}
                  </button>
                  {scrape.status === "ok" && (
                    <div className="text-[11px] text-[#1a6b4a]">
                      ✓ Imported{scrape.name ? ` — ${scrape.name}` : ""}
                      {scrape.headline ? ` · ${scrape.headline}` : ""}
                    </div>
                  )}
                  {(scrape.status === "insufficient" || scrape.status === "url_only") && (
                    <div className="text-[11px] text-[#7a7060]">{scrape.message} You can continue manually.</div>
                  )}
                  {scrape.status === "error" && (
                    <div className="text-[11px] text-saffron">{scrape.message} You can continue manually.</div>
                  )}
                </div>
              )}
              {showWritingErr && (
                <div className="mt-2 text-[11px] text-saffron">
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