/**
 * WeekAheadPriorities — Sun / last-day-PTO / last-day-holiday /
 * last-day-long-weekend planning surface. Saturday is intentionally
 * excluded (recovery day — see SSOT §17.2a).
 *
 * Reuses the existing Plan page container. Fetches ~10 important events
 * for the upcoming week from `list-week-ahead-priorities` and lets the
 * user mark each as Priority / Not this week / Never. Selections persist
 * via `record-event-priority-signal`, which feeds future Plan ranking.
 *
 * SSOT: docs/GENERATE_MASTERY_PLAN_SSOT.md §17.6.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Star, X, Ban, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getAuthToken } from "@/services/authTokenService";
import { DEV_MODE, DEV_USER } from "@/config/devMode";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  PriorSignal as Signal,
  WeekAheadPriority as PriorityItem,
  WeekAheadTag,
} from "@/types/weekAhead";

const TAG_CHIP: Record<WeekAheadTag, string> = {
  prior_priority: "Prior priority",
  pattern_based: "Pattern-based",
  known_relationship: "Known relationship",
  high_stakes: "High stakes",
  historically_low_signal: "Historically low-signal",
};

interface ApiResponse {
  weekAheadMode: { active: boolean; reason: string | null };
  priorities: PriorityItem[];
}

const SUBTITLE_BY_REASON: Record<string, string> = {
  weekly_planning: "Mark what truly matters this week — nuke the rest.",
  manual_override: "Re-prioritise the week ahead.",
  end_of_pto: "Coming back to work — what's worth your attention?",
  end_of_public_holiday: "Re-engaging — pick the events that matter.",
  end_of_long_weekend: "Frame the week ahead before Monday lands.",
};

const DAY_LABEL = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
};

const TIME_LABEL = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

interface Props {
  reason: string | null;
  manualOverride: boolean;
}

const SAVED_KEY_PREFIX = "mm.weekAhead.saved.";
const isoWeekKey = (d = new Date()) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};
const readSavedMarker = () => {
  try {
    return typeof window !== "undefined" &&
      window.localStorage.getItem(SAVED_KEY_PREFIX + isoWeekKey()) === "1";
  } catch { return false; }
};
const writeSavedMarker = () => {
  try { window.localStorage.setItem(SAVED_KEY_PREFIX + isoWeekKey(), "1"); } catch { /* noop */ }
};
const clearSavedMarker = () => {
  try { window.localStorage.removeItem(SAVED_KEY_PREFIX + isoWeekKey()); } catch { /* noop */ }
};

const WeekAheadPriorities = ({ reason, manualOverride }: Props) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PriorityItem[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Signal>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      const token = await getAuthToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (DEV_MODE) headers["x-dev-user-id"] = DEV_USER.id;
      headers["x-user-tz-offset"] = String(new Date().getTimezoneOffset());
      if (manualOverride) headers["x-week-ahead-override"] = "1";

      const { data, error: invokeErr } = await supabase.functions.invoke(
        "list-week-ahead-priorities",
        { headers, body: {} },
      );
      if (invokeErr) throw invokeErr;
      const resp = (data || {}) as Partial<ApiResponse>;
      const rawItems = Array.isArray(resp.priorities) ? resp.priorities : [];
      // Defensive normalization — never trust optional fields. The picker
      // must render even if the server omits scoreReasons / category /
      // times (e.g. partial response, schema drift).
      const safe: PriorityItem[] = rawItems
        .filter((it) => it && typeof it === "object" && it.eventId && it.title)
        .map((it) => ({
          eventId: String(it.eventId),
          title: String(it.title),
          startTime: String(it.startTime ?? ""),
          endTime: String(it.endTime ?? ""),
          localDay: String(it.localDay ?? (it.startTime ? String(it.startTime).slice(0, 10) : "")),
          period: String(it.period ?? ""),
          category: String(it.category ?? "Meeting"),
          typeKey: String(it.typeKey ?? "generic"),
          stakesLevel: it.stakesLevel ?? null,
          score: typeof it.score === "number" ? it.score : 0,
          scoreReasons: Array.isArray(it.scoreReasons) ? it.scoreReasons : [],
          tags: Array.isArray((it as any).tags)
            ? ((it as any).tags as unknown[]).filter(
                (t): t is WeekAheadTag =>
                  t === "prior_priority" ||
                  t === "pattern_based" ||
                  t === "known_relationship" ||
                  t === "high_stakes" ||
                  t === "historically_low_signal",
              )
            : [],
          isOrganizer: it.isOrganizer ?? null,
          priorSignal:
            (it as any).priorSignal === "priority" ||
            (it as any).priorSignal === "not_this_week" ||
            (it as any).priorSignal === "never"
              ? ((it as any).priorSignal as Signal)
              : null,
          subcategoryId: typeof (it as any).subcategoryId === "string"
            ? ((it as any).subcategoryId as string)
            : null,
        }));
      setItems(safe);
      // Rehydrate decisions from the server so the user's prior
      // Star/Cancel/Never selections remain visible after refresh.
      const hydrated: Record<string, Signal> = {};
      for (const it of safe) {
        if (it.priorSignal) hydrated[it.eventId] = it.priorSignal;
      }
      setDecisions(hydrated);
      setSaved(Object.keys(hydrated).length > 0 && readSavedMarker());
      setFailedIds(new Set());
    } catch (e) {
      console.error("[WeekAheadPriorities] load failed", e);
      setError("Couldn't load your upcoming week.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [manualOverride]);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const map = new Map<string, PriorityItem[]>();
    for (const it of items) {
      const bucket = map.get(it.localDay);
      if (bucket) bucket.push(it);
      else map.set(it.localDay, [it]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const recordSignal = useCallback(async (item: PriorityItem, signal: Signal) => {
    setSubmitting((s) => ({ ...s, [item.eventId]: true }));
    setDecisions((d) => ({ ...d, [item.eventId]: signal })); // optimistic
    setSaved(false);
    clearSavedMarker();
    try {
      const headers: Record<string, string> = {};
      const token = await getAuthToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (DEV_MODE) headers["x-dev-user-id"] = DEV_USER.id;

      // Explicit target week (upcoming Mon–Sun) — never inferred from occurred_at.
      const timezone =
        (typeof Intl !== "undefined" && Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC";
      const now = new Date();
      const jsDow = now.getDay(); // 0=Sun..6=Sat
      const daysToMon = jsDow === 1 ? 7 : ((8 - jsDow) % 7 || 7);
      const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() + daysToMon);
      const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const targetWeekStart = fmt(monday);
      const targetWeekEnd = fmt(sunday);

      // Canonical identity: title|startMs|durationMinutes — resolved server-side to a
      // real calendar_events.id only when the match is unambiguous.
      const startMs = new Date(item.startTime).getTime();
      const endMs = new Date(item.endTime).getTime();
      const durationMinutes = Number.isFinite(startMs) && Number.isFinite(endMs)
        ? Math.max(0, Math.round((endMs - startMs) / 60000))
        : 0;
      const clientCanonicalId = `canonical:${item.title}|${startMs}|${durationMinutes}`;

      const { error: invokeErr } = await supabase.functions.invoke(
        "record-event-priority-signal",
        {
          headers,
          body: {
            eventId: item.eventId,
            eventTitle: item.title,
            signal,
            source: "week_ahead_picker",
            targetWeekStart,
            targetWeekEnd,
            timezone,
            clientCanonicalId,
          },
        },
      );
      if (invokeErr) throw invokeErr;
      setFailedIds((prev) => {
        if (!prev.has(item.eventId)) return prev;
        const next = new Set(prev);
        next.delete(item.eventId);
        return next;
      });
    } catch (e) {
      console.error("[WeekAheadPriorities] record signal failed", e);
      toast({ title: "Couldn't save", description: "We'll retry next time you open this page." });
      setDecisions((d) => {
        const next = { ...d };
        delete next[item.eventId];
        return next;
      });
      setFailedIds((prev) => {
        const next = new Set(prev);
        next.add(item.eventId);
        return next;
      });
    } finally {
      setSubmitting((s) => {
        const next = { ...s };
        delete next[item.eventId];
        return next;
      });
    }
  }, []);

  const inFlight = Object.keys(submitting).length > 0;
  const hasDecisions = Object.keys(decisions).length > 0;
  const hasFailures = failedIds.size > 0;

  const handleSave = useCallback(async () => {
    // Wait for any in-flight per-click writes to settle.
    // The submitting map clears as each write resolves; poll briefly.
    const start = Date.now();
    while (Object.keys(submitting).length > 0 && Date.now() - start < 8000) {
      await new Promise((r) => setTimeout(r, 120));
    }
    if (failedIds.size > 0) {
      toast({ title: "We couldn't save your Week Ahead priorities. Please try again." });
      return;
    }
    setSaved(true);
    writeSavedMarker();
    toast({ title: "Week Ahead priorities saved" });
  }, [submitting, failedIds]);

  const subtitle = (reason && SUBTITLE_BY_REASON[reason]) ||
    SUBTITLE_BY_REASON.weekly_planning;

  return (
    <section className="px-3 md:px-4" aria-label="Week-Ahead Priorities">
      <header className="mb-4">
        <h2 className="text-[20px] md:text-[24px] font-headline tracking-tight text-foreground">
          Plan the week ahead
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Surfacing upcoming priorities…
        </div>
      )}

      {!loading && error && (
        <div className="text-sm text-destructive py-6 text-center">
          {error}{" "}
          <button className="underline" onClick={() => void load()}>Retry</button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No significant events on your calendar for the week ahead.
          <br />Enjoy the open space.
        </div>
      )}

      {!loading && !error && groups.map(([day, dayItems]) => (
        <div key={day} className="mb-5">
          <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground mb-2">
            {DAY_LABEL(day)}
          </div>
          <ul className="space-y-2">
            {dayItems.map((it) => {
              const decided = decisions[it.eventId];
              const isBusy = !!submitting[it.eventId];
              return (
                <li
                  key={it.eventId}
                  className={cn(
                    "rounded-xl border bg-card p-3 transition",
                    decided === "priority" && "ring-1 ring-primary/40",
                    decided === "not_this_week" && "opacity-60",
                    decided === "never" && "opacity-40 line-through",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">
                        {it.title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {TIME_LABEL(it.startTime)} · {it.category}
                        {it.subcategoryId && (
                          <span
                            className="ml-1.5 text-muted-foreground/70"
                            title="A–H subcategory"
                          >
                            · {it.subcategoryId.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                      {it.tags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {it.tags.map((t) => (
                            <span
                              key={t}
                              className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-full",
                                "text-[10px] uppercase tracking-[0.06em] border",
                                t === "prior_priority" &&
                                  "bg-primary/10 text-primary border-primary/30",
                                t === "pattern_based" &&
                                  "bg-amber-50 text-amber-800 border-amber-200",
                                t === "known_relationship" &&
                                  "bg-emerald-50 text-emerald-800 border-emerald-200",
                                t === "high_stakes" &&
                                  "bg-rose-50 text-rose-800 border-rose-200",
                                t === "historically_low_signal" &&
                                  "bg-muted text-muted-foreground border-border",
                              )}
                            >
                              {TAG_CHIP[t]}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <IconBtn
                        label="Priority"
                        active={decided === "priority"}
                        disabled={isBusy}
                        onClick={() => recordSignal(it, "priority")}
                      >
                        <Star className="w-4 h-4" />
                      </IconBtn>
                      <IconBtn
                        label="Not this week"
                        active={decided === "not_this_week"}
                        disabled={isBusy}
                        onClick={() => recordSignal(it, "not_this_week")}
                      >
                        <X className="w-4 h-4" />
                      </IconBtn>
                      <IconBtn
                        label="Never this type"
                        active={decided === "never"}
                        disabled={isBusy}
                        onClick={() => recordSignal(it, "never")}
                      >
                        <Ban className="w-4 h-4" />
                      </IconBtn>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {!loading && !error && (
        <div className="mt-6">
          {saved && !hasFailures ? (
            <div
              role="status"
              className="rounded-xl border border-primary/30 bg-primary/10 text-primary p-4 flex items-start gap-3"
            >
              <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" aria-hidden />
              <div className="text-sm">
                <div className="font-medium">Your Week Ahead priorities have been recorded.</div>
                <div className="text-primary/80 mt-0.5">
                  They'll be used when building your upcoming plan.
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-xs text-muted-foreground order-2 md:order-1">
                {hasFailures
                  ? "We couldn't save one or more choices. Tap Save to try again."
                  : hasDecisions
                    ? "Your preferences will shape your upcoming plan."
                    : "Mark at least one event to save."}
              </p>
              <Button
                className="w-full md:w-auto order-1 md:order-2"
                disabled={!hasDecisions || inFlight}
                onClick={() => void handleSave()}
              >
                {inFlight ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving your choices…
                  </>
                ) : (
                  "Save Week Ahead Priorities"
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const IconBtn = ({
  children, label, active, disabled, onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      "h-8 w-8 rounded-full flex items-center justify-center border transition",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-background text-muted-foreground border-border hover:text-foreground",
      disabled && "opacity-50 cursor-not-allowed",
    )}
  >
    {children}
  </button>
);

export default WeekAheadPriorities;