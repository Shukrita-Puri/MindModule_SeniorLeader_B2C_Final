/**
 * useWeekAheadServerDecision — fetches the server-authoritative Week-Ahead
 * decision so the Plan / Home routing layer can never disagree with the
 * backend. Cheap endpoint (`evaluate-week-ahead-mode`) — no plan generation
 * is triggered.
 *
 * Returns `null` while in flight (and on hard failure) so the caller can
 * fall back to the local DoW heuristic inside `useWeekAheadMode`.
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getAuthToken } from "@/services/authTokenService";
import { DEV_MODE, DEV_USER } from "@/config/devMode";

export interface ServerWeekAheadDecision {
  active: boolean;
  reason: string | null;
  lookaheadDays?: number;
  mode?: "week_ahead" | "day_of";
}

function localDateKey(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function useWeekAheadServerDecision(): ServerWeekAheadDecision | null {
  const [searchParams] = useSearchParams();
  const manualOverride = searchParams.get("mode") === "week-ahead";
  const [decision, setDecision] = useState<ServerWeekAheadDecision | null>(null);
  const [fetchedOnDate, setFetchedOnDate] = useState<string>(() => localDateKey());

  const runFetch = useCallback(async (isCancelled?: () => boolean) => {
    const cancelled = () => isCancelled?.() === true;
      try {
        const headers: Record<string, string> = {};
        const token = await getAuthToken().catch(() => null);
        if (token) headers["Authorization"] = `Bearer ${token}`;
        if (DEV_MODE) headers["x-dev-user-id"] = DEV_USER.id;
        headers["x-user-tz-offset"] = String(new Date().getTimezoneOffset());
        if (manualOverride) headers["x-week-ahead-override"] = "1";

        const { data, error } = await supabase.functions.invoke(
          "evaluate-week-ahead-mode",
          { headers, body: {} },
        );
        if (cancelled()) return;
        if (error) {
          console.warn("[useWeekAheadServerDecision] invoke error:", error);
          return;
        }
        const d = (data as { weekAheadDecision?: ServerWeekAheadDecision } | null)
          ?.weekAheadDecision;
        if (d && typeof d.active === "boolean") {
          setDecision({
            active: d.active,
            reason: d.reason ?? null,
            lookaheadDays: d.lookaheadDays,
            mode: d.mode,
          });
          setFetchedOnDate(localDateKey());
        }
      } catch (e) {
        if (!cancelled()) console.warn("[useWeekAheadServerDecision] failed:", e);
      }
  }, [manualOverride]);

  useEffect(() => {
    let cancelled = false;
    void runFetch(() => cancelled);
    return () => { cancelled = true; };
  }, [runFetch]);

  // Day rollover: re-ask the server when the app regains focus on a new
  // local calendar date. Event-driven only — no polling.
  useEffect(() => {
    const maybeRefetch = () => {
      if (localDateKey() !== fetchedOnDate) void runFetch();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") maybeRefetch();
    };
    window.addEventListener("focus", maybeRefetch);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", maybeRefetch);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [runFetch, fetchedOnDate]);

  return decision;
}