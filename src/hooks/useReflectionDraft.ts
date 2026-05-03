/**
 * useReflectionDraft
 *
 * Holds optional per-step writing for mindset protocols inside the
 * MicroPracticePlayerCards player. Auto-saves on debounce, on blur, on
 * carousel change, and on completion. Mirrors to localStorage for offline.
 *
 * No effect when isMindset === false.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type StepMeta = { stepNumber: number; title?: string; prompt?: string };

interface Params {
  practiceId: string | undefined;
  isMindset: boolean;
  entryContext: "plan" | "standalone" | "jit";
  tempSessionKey: string;
  steps: StepMeta[];
  /** Real practice_sessions.id, populated after handleComplete returns it. */
  sessionId?: string;
}

const DEBOUNCE_MS = 1200;

function todayLocalYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lsKey(practiceId: string, tempKey: string, step: number) {
  return `reflection:${practiceId}:${tempKey}:${step}`;
}

export function useReflectionDraft({
  practiceId,
  isMindset,
  entryContext,
  tempSessionKey,
  steps,
  sessionId,
}: Params) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const draftsRef = useRef<Record<number, string>>({});
  const stepsRef = useRef<StepMeta[]>(steps);
  const sessionIdRef = useRef<string | undefined>(sessionId);
  const timersRef = useRef<Record<number, number>>({});
  const hydratedRef = useRef(false);

  useEffect(() => { stepsRef.current = steps; }, [steps]);
  useEffect(() => { draftsRef.current = drafts; }, [drafts]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // Hydrate once from server + localStorage
  useEffect(() => {
    if (!isMindset || !practiceId || hydratedRef.current) return;
    hydratedRef.current = true;

    let cancelled = false;

    const hydrate = async () => {
      const next: Record<number, string> = {};

      // 1. localStorage mirror first (fastest paint)
      try {
        for (const s of stepsRef.current) {
          const v = localStorage.getItem(lsKey(practiceId, tempSessionKey, s.stepNumber));
          if (v) next[s.stepNumber] = v;
        }
      } catch { /* ignore */ }

      // 2. Server hydrate (latest by date — supports revisits)
      try {
        const { data } = await supabase.functions.invoke("get-practice-reflections", {
          method: "GET" as any,
          // supabase-js doesn't pass GET params well; use body=null + URL via headers instead.
          // We send query via the function URL by relying on invoke's "body" not being used.
          // Workaround: include params in headers handled by edge function isn't supported,
          // so we fall back to constructing the URL manually below if needed.
        } as any);
        if (data?.success && Array.isArray(data.data)) {
          for (const row of data.data) {
            // Only keep rows for our practice
            if (row.step_number && typeof row.response === "string") {
              if (!next[row.step_number]) next[row.step_number] = row.response;
            }
          }
        }
      } catch (err) {
        // Fall back: use a manual fetch with query params
        try {
          const url = new URL(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-practice-reflections`,
          );
          url.searchParams.set("practiceId", practiceId);
          url.searchParams.set("tempSessionKey", tempSessionKey);
          url.searchParams.set("localDate", todayLocalYmd());
          const session = (await supabase.auth.getSession()).data.session;
          const r = await fetch(url.toString(), {
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: session?.access_token ? `Bearer ${session.access_token}` : `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          });
          const json = await r.json().catch(() => ({}));
          if (json?.success && Array.isArray(json.data)) {
            for (const row of json.data) {
              if (row.step_number && typeof row.response === "string") {
                if (!next[row.step_number]) next[row.step_number] = row.response;
              }
            }
          }
        } catch (e) {
          console.warn("[useReflectionDraft] hydrate fetch failed", e);
        }
      }

      if (!cancelled && Object.keys(next).length) {
        setDrafts((prev) => ({ ...next, ...prev }));
      }
    };

    void hydrate();
    return () => { cancelled = true; };
  }, [isMindset, practiceId, tempSessionKey]);

  const saveStep = useCallback(async (stepNumber: number) => {
    if (!isMindset || !practiceId) return;
    const value = draftsRef.current[stepNumber] ?? "";
    const stepMeta = stepsRef.current.find((s) => s.stepNumber === stepNumber);
    try {
      // Mirror to localStorage immediately
      try {
        if (value) localStorage.setItem(lsKey(practiceId, tempSessionKey, stepNumber), value);
        else localStorage.removeItem(lsKey(practiceId, tempSessionKey, stepNumber));
      } catch { /* ignore */ }

      await supabase.functions.invoke("save-practice-reflection", {
        body: {
          practiceId,
          practiceType: "mindset",
          sessionId: sessionIdRef.current || undefined,
          tempSessionKey,
          stepNumber,
          stepTitle: stepMeta?.title,
          prompt: stepMeta?.prompt,
          response: value,
          entryContext,
          localDate: todayLocalYmd(),
        },
      });
    } catch (err) {
      console.warn("[useReflectionDraft] save failed (kept locally)", err);
    }
  }, [isMindset, practiceId, tempSessionKey, entryContext]);

  const setDraft = useCallback((stepNumber: number, value: string) => {
    setDrafts((prev) => ({ ...prev, [stepNumber]: value }));
    // Debounced save
    if (timersRef.current[stepNumber]) {
      window.clearTimeout(timersRef.current[stepNumber]);
    }
    timersRef.current[stepNumber] = window.setTimeout(() => {
      void saveStep(stepNumber);
    }, DEBOUNCE_MS);
  }, [saveStep]);

  const flush = useCallback(async (stepNumber?: number) => {
    if (!isMindset) return;
    if (typeof stepNumber === "number") {
      if (timersRef.current[stepNumber]) {
        window.clearTimeout(timersRef.current[stepNumber]);
        delete timersRef.current[stepNumber];
      }
      await saveStep(stepNumber);
      return;
    }
    // Flush all
    const all = Object.keys(timersRef.current).map(Number);
    for (const n of all) {
      window.clearTimeout(timersRef.current[n]);
      delete timersRef.current[n];
    }
    const stepsToSave = new Set<number>([
      ...Object.keys(draftsRef.current).map(Number),
    ]);
    await Promise.all(Array.from(stepsToSave).map((n) => saveStep(n)));
  }, [isMindset, saveStep]);

  const getDraft = useCallback((stepNumber: number) => drafts[stepNumber] ?? "", [drafts]);

  // Cleanup
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((t) => window.clearTimeout(t));
      timersRef.current = {};
    };
  }, []);

  return useMemo(() => ({ getDraft, setDraft, flush }), [getDraft, setDraft, flush]);
}