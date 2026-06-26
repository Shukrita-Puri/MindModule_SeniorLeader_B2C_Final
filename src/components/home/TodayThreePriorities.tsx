/**
 * TodayThreePriorities — 3-slot horizon-classified practice sequence.
 * Replaces DailyRitual + JitCarousel on the homepage.
 * Preserves all existing completion tracking, navigation, and player routing.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Check, Heart, ChevronRight, X, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFavorites } from '@/hooks/useFavorites';
import { useOuterReadiness } from '@/hooks/useOuterReadiness';
import { useMasteryPlanSnapshot } from '@/hooks/useMasteryPlanSnapshot';
import { toast } from '@/hooks/use-toast';
import confetti from 'canvas-confetti';
import { getTodayRitual, upsertRitual, getTodayCompletedUnion, persistPlanLedgerEdit } from '@/utils/dailyRituals';
import { getCurrentTimeWindow, getLatestTodayCheckin } from '@/utils/dailyCheckins';
import { getContentById } from '@/data/practicesAndSoundscapes';
import { getAuthToken } from '@/services/authTokenService';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import PostEventReflection from '@/components/home/PostEventReflection';
import MetricInfoModal from '@/components/home/MetricInfoModal';
import PlanFeedbackModal from '@/components/home/PlanFeedbackModal';
import CalendarReplacementPickerInline, { type CalendarReplacementEvent } from '@/components/home/CalendarReplacementPickerModal';
import ReflectionCorner from '@/components/home/ReflectionCorner';
import { submitPlanFeedback, submitPlanSlotCancelFeedback } from '@/utils/relevanceFeedback';
import SlotCancelFeedbackModal, { type CancelReason } from '@/components/home/SlotCancelFeedbackModal';
import EngravedLoader from '@/components/ui/engraved-loader';
import PriorityTagAffordance, { type PriorityTagState } from '@/components/home/PriorityTagAffordance';
import { stripBriefMarkdown } from '@/components/home/timeLabel';
import {
  readEdits as readPlanEdits,
  patchSlotEdit as patchPlanSlotEdit,
  applyEditsToModules as applyPlanEditsToModules,
  clearSlotEdit as clearPlanSlotEdit,
} from '@/utils/planUserEdits';
import {
  read as readPersistent,
  write as writePersistent,
  clear as clearPersistent,
  msUntilWindowEnd,
  cacheKeys,
  localISODate,
} from '@/utils/persistentBriefCache';
import { getLocalDataSummary } from '@/services/localDataStore';
import { READINESS_AWAITING_MESSAGE } from '@/constants/awaitingSignals';

import coachVisual from '@/assets/shared/coach-visual-calm.jpeg';

// Client-side fallback for `recommendedAction` when an older cached plan
// response lacks the field. Mirrors the deterministic server builder shape
// — short, plain-English benefit line shown above the practice cards.
const fallbackRecommendedAction = (hm: { practice: { type: string }; jitEventTitle: string | null; timeLabel: string }): string => {
  const type = hm.practice?.type;
  const event = hm.jitEventTitle?.trim() || null;
  const tl = (hm.timeLabel || '').toLowerCase();
  const tod = tl.includes('evening') || tl.includes('bed') ? 'evening'
    : tl.includes('afternoon') || tl.includes('midday') || tl.includes('later today') ? 'afternoon'
    : 'morning';
  if (event) {
    if (type === 'regulate') return `Settle your nervous system before ${event}`;
    if (type === 'align')    return `Sharpen your thinking before ${event}`;
    if (type === 'prepare')  return `Enter optimal flow state ahead of ${event}`;
    if (type === 'integrate')return `Land cleanly after ${event}`;
  }
  if (type === 'regulate') return `Regulate your state for the ${tod} ahead`;
  if (type === 'align')    return `Set your focus for the ${tod}`;
  if (type === 'prepare')  return `Build resilience for high-demand days`;
  if (type === 'integrate')return tod === 'evening' ? `Close the day with intention` : `Consolidate what's working`;
  return `Strengthen your state for what's ahead`;
};

// Performance-oriented label for the 3 plan slots. The server is the single
// source of truth: every slot label is either "Prepare ahead of <Event>"
// (JIT) or "<state action> ahead of <calendar anchor>" (state). The only
// client-side rewrite is the legacy "Before <Event>" → "Prepare ahead of …"
// fallback for any cached labels still in flight from older payloads.
const performanceSlotLabel = (raw: string, _isJit: boolean): string => {
  if (!raw) return raw;
  return raw.replace(/^\s*Before\s+/i, 'Prepare ahead of ');
};

/**
 * Sovereign-tag display order — HIGH floats to top, LOW sinks to bottom,
 * original index breaks ties so underlying slot identity (completion
 * tracking, plan ledger edits) stays stable.
 */
function sovereignDisplayOrder<T extends { priorityTag?: string | null }>(modules: T[]): number[] {
  const rank = (tag: string | null | undefined): number => {
    if (tag === 'high') return 0;
    if (tag === 'low') return 2;
    return 1;
  };
  return modules
    .map((m, i) => ({ i, r: rank((m && (m as any).priorityTag) ?? null) }))
    .sort((a, b) => (a.r - b.r) || (a.i - b.i))
    .map((x) => x.i);
}

// ── Types ──
interface PlanModule {
  type: 'regulate' | 'align' | 'prepare' | 'integrate';
  contentId: string;
  title: string;
  contentType: string;
  duration: number;
  focus: string;
  intensity: string;
  isFavorite: boolean;
  isCoachCard?: boolean;
  reasoning: string;
  required?: boolean;
  thumbnailUrl?: string;
}

interface HorizonModule {
  horizon: 'immediate' | 'tactical' | 'strategic';
  timeLabel: string;
  typeLabel: string;
  whyLine: string;
  recommendedAction?: string;
  practice: PlanModule;
  practices?: PlanModule[];
  sequenceReasoning?: string;
  stepRationale?: string[];
  slotKind?: 'start_of_day' | 'jit' | 'end_of_day' | 'state-management';
  ceoRealities?: string[];
  isJit: boolean;
  jitEventTitle: string | null;
  jitMinutesUntil: number | null;
  showNavyBorder: boolean;
  showPulse: boolean;
  showPriorityPill: boolean;
  isCancelled?: boolean;
  cancelReason?: string | null;
  replacementEventIds?: string[];
  priorityTag?: 'high' | 'medium' | 'low' | null;
  relationshipTag?: string | null;
  customTags?: string[];
  // Server-derived arc label for the slot. Surfaced as a small muted chip
  // beside the priority number so multi-arc allocations of the same event
  // (Prepare / Recover) are self-explanatory.
  arcLabel?: 'Prepare' | 'During' | 'Recover' | 'Steady';
  arcVerb?: string;
}

interface CoachCardData {
  id: string;
  type: string;
  label: string;
  protocolType: string;
  title: string;
  duration: number;
  sortOrder: number;
  isCoachCard: true;
  prompt: string;
  eventTitle?: string;
}

interface MasteryPlanResponse {
  timeOfDayPlan: {
    label: string;
    period: 'morning' | 'afternoon' | 'evening';
    modules: PlanModule[];
    coachCard: CoachCardData | null;
    totalDuration: number;
    progressTracked: boolean;
    calendarMessage?: string;
    planBrief?: string;
  };
  preEventPlan: any;
  jitPriority?: boolean;
  calendarPills?: Array<{
    label: string;
    eventId: string;
    priorityScore: number | null;
    timePill: string;
  }>;
  horizonModules?: HorizonModule[];
  /**
   * Stateful Plan Evolution metadata (server-emitted).
   *  - source: 'fresh' (first plan today) | 'ledger-evolution' (carrying
   *    morning slots forward) | 'bonus-round' (all 3 done — fresh slots
   *    with a victoryLine).
   *  - victoryLine: shown under the priorities when source === 'bonus-round'.
   */
  ledger?: {
    source: 'fresh' | 'ledger-evolution' | 'bonus-round';
    carriedSlots: number;
    anchoredSlots: number;
    completedSlots: number;
    victoryLine?: string;
  };
  meta: { generatedAt: string; [key: string]: any };
}

// Coach feature is suppressed (mem://features/coach/suppression-standard).
// The server no longer hard-codes a coach card into the evening integrate
// slot, so the client filter is now a uniform "drop everything coach". The
// inline Reflection Corner UI is keyed off `type === 'integrate'` (not
// `isCoachCard`) and remains rendered.
const stripCoachFromPlan = (plan: MasteryPlanResponse | null): MasteryPlanResponse | null => {
  if (!plan?.horizonModules) return plan;
  const filtered = plan.horizonModules
    .map((hm) => {
      const slot = hm.practices || [hm.practice];
      const kept = slot.filter((p) => !p.isCoachCard);
      if (kept.length === 0) return null;
      return { ...hm, practice: kept[0], practices: kept };
    })
    .filter(Boolean) as HorizonModule[];
  return { ...plan, horizonModules: filtered };
};

const TodayThreePriorities = ({
  onEmpty,
  onLoaded,
  expandReflection,
  reflectionContext,
  reflectionEvent,
}: {
  onEmpty?: () => void;
  onLoaded?: () => void;
  expandReflection?: boolean;
  reflectionContext?: string | null;
  reflectionEvent?: string | null;
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { isFavorite } = useFavorites();
  const { data: outerReadinessData } = useOuterReadiness();

  const todayForPlan = localISODate();
  const periodForPlan = getCurrentTimeWindow();
  const forceRefreshKey = cacheKeys.planForceRefresh(todayForPlan, periodForPlan);
  const hasPlanForceRefresh = (() => {
    try {
      return sessionStorage.getItem(forceRefreshKey) === '1';
    } catch {
      return false;
    }
  })();

  // Synchronous sessionStorage hydration: if a valid cached plan exists for
  // today + current period, render it instantly on mount and skip the
  // scripted loader. Background freshness checks in loadPlan() may still
  // silently swap the data later.
  const initialCached = (() => {
    if (hasPlanForceRefresh) return null;
    try {
      const today = todayForPlan;
      const period = periodForPlan;
      const loaded = readPersistent<boolean>(cacheKeys.planLoaded(today, period));
      if (loaded !== true) return null;
      const parsed = readPersistent<MasteryPlanResponse>(cacheKeys.planData(today, period));
      if (!parsed) return null;
      if (!parsed.horizonModules || parsed.horizonModules.length === 0) return null;
      return parsed;
    } catch {
      return null;
    }
  })();
  const [noLocalSignalAtMount] = useState(() => {
    try {
      const hasEverCheckedIn = localStorage.getItem('hasEverCheckedIn') === 'true';
      const localSummary = getLocalDataSummary();
      return !hasEverCheckedIn && localSummary.wearableCount === 0;
    } catch {
      return false;
    }
  });
  const [plan, setPlan] = useState<MasteryPlanResponse | null>(initialCached);
  const [loading, setLoading] = useState(!initialCached && !noLocalSignalAtMount);
  const [fetchFailed, setFetchFailed] = useState(false);
  // Awaiting-signals state — mirrors the Brief contract. When true, the
  // Plan card renders the same quiet "Begin with your check-in" prompt
  // instead of generating a plan from defaults.
  const [awaitingSignals, setAwaitingSignals] = useState(noLocalSignalAtMount);
  // Ref preserves the "we already had a cached payload at mount" fact for
  // the lifetime of this component, so a transient `loading=true` from a
  // silent refresh can never re-trigger the scripted EngravedLoader.
  const initialCachedRef = useRef<boolean>(!!initialCached);
  const [completedPracticeIds, setCompletedPracticeIds] = useState<string[]>([]);
  const [expandedSlot, setExpandedSlot] = useState<number>(0);
  const [feedbackSlot, setFeedbackSlot] = useState<{ index: number; horizon: string; key: string } | null>(null);

  // Persist celebration/feedback state in sessionStorage so remounts don't re-trigger.
  // Keys are scoped to ritual_date + session_period so a new ritual cycle gets a clean slate
  // but reload/refresh within the same window reuses the same fingerprint.
  const todayKey = todayForPlan;
  const periodKey = periodForPlan;
  const scopeKey = `${todayKey}-${periodKey}`;
  const celebratedStorageKey = `celebrated-ids-${scopeKey}`;
  // Feedback is keyed by a stable per-priority fingerprint (slot index + content IDs) so
  // a remount or rehydration cannot "discover" an already-shown priority as new.
  const feedbackShownStorageKey = `feedback-shown-${scopeKey}`;
  const [replacementSlot, setReplacementSlot] = useState<{ index: number; key: string; title: string } | null>(null);
  const [replacementEvents, setReplacementEvents] = useState<CalendarReplacementEvent[]>([]);
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [replacementError, setReplacementError] = useState<string | null>(null);
  const [replacementSelection, setReplacementSelection] = useState<string[]>([]);

  const loadPersistedSet = (key: string): Set<string> => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  };
  const persistSet = (key: string, s: Set<string>) => {
    try { sessionStorage.setItem(key, JSON.stringify(Array.from(s))); } catch { /* ignore quota */ }
  };

  // Build the stable per-priority fingerprint used as the dedupe key.
  const buildPriorityKey = (slotIndex: number, hm: HorizonModule): string => {
    const sp = hm.practices || [hm.practice];
    const ids = sp.map(p => p.contentId).sort().join('|');
    return `${slotIndex}:${ids}`;
  };

  const resetReplacementEditor = useCallback((slot?: HorizonModule) => {
    setReplacementSelection(slot?.replacementEventIds || []);
  }, []);

  // Tracks which priority fingerprints have ALREADY had their feedback modal shown
  // (across remounts, refreshes, etc.). Source of truth: sessionStorage.
  const feedbackShownRef = useRef<Set<string>>(loadPersistedSet(feedbackShownStorageKey));
  const celebratedIdsRef = useRef<Set<string>>(loadPersistedSet(celebratedStorageKey));
  const [pendingCancel, setPendingCancel] = useState<{
    index: number;
    key: string;
    title: string;
    /** Underlying calendar event title when the slot is JIT-bound — drives
     *  the cancel-feedback → record-event-priority-signal bridge (§17.5). */
    eventTitle?: string | null;
  } | null>(null);
  // Phase 3: in-flight guard so a double-click on Apply cannot fire two
  // overlapping regenerations for the same selection.
  const regeneratingRef = useRef(false);
  // Issue 1: while a cancel/undo/tag persist is in-flight, suppress any
  // generate-mastery-plan calls so a refresh during the race cannot wipe
  // the optimistic cancellation state.
  const pendingPersistRef = useRef<number>(0);

  const effectiveUserId = user?.id || (DEV_MODE ? DEV_USER.id : null);

  // Tag updates — optimistic local + mirror + background DB persist.
  // Mirrors the cancel/undo pattern so the UI never regresses after refresh.
  const updateSlotTags = useCallback((slotIndex: number, next: PriorityTagState) => {
    const today = localISODate();
    const period = getCurrentTimeWindow();
    // Capture the current slot BEFORE setPlan so the background tag
    // bridge can fire even when the local mirror is the only source
    // of truth (refresh-during-race protection).
    let snapshotForBridge: { eventId: string | null; eventTitle: string | null; prev: { priorityTag: any; relationshipTag: any; customTags: string[] } } | null = null;
    setPlan((prev) => {
      if (!prev?.horizonModules) return prev;
      const cur = prev.horizonModules[slotIndex];
      if (cur) {
        snapshotForBridge = {
          eventId: ((cur as any).anchorEventId as string | undefined)
            ?? (cur.replacementEventIds && cur.replacementEventIds[0])
            ?? null,
          eventTitle: cur.jitEventTitle ?? null,
          prev: {
            priorityTag: cur.priorityTag ?? null,
            relationshipTag: cur.relationshipTag ?? null,
            customTags: Array.isArray(cur.customTags) ? cur.customTags : [],
          },
        };
      }
      const updated = { ...prev, horizonModules: prev.horizonModules.map((m, i) =>
        i === slotIndex
          ? { ...m, priorityTag: next.priorityTag, relationshipTag: next.relationshipTag as any, customTags: next.customTags }
          : m,
      ) } as MasteryPlanResponse;
      try {
        const ttl = msUntilWindowEnd();
        writePersistent(cacheKeys.planData(today, period), updated, ttl);
        patchPlanSlotEdit(today, period, slotIndex, {
          priorityTag: next.priorityTag,
          relationshipTag: next.relationshipTag,
          customTags: next.customTags,
        });
      } catch { /* ignore */ }
      return updated;
    });
    (async () => {
      pendingPersistRef.current += 1;
      try {
        await persistPlanLedgerEdit(
          slotIndex,
          {
            priorityTag: next.priorityTag,
            relationshipTag: next.relationshipTag,
            customTags: next.customTags,
          } as any,
          period,
        );
      } catch { /* silent — local mirror keeps UI consistent */ }
      pendingPersistRef.current = Math.max(0, pendingPersistRef.current - 1);
    })();
    // Sovereign-tag persistence bridge — fire-and-forget. Writes one
    // event_priority_memory row per change (tag_importance_*, tag_relationship,
    // tag_custom, tag_cleared) so the next plan regen can read the
    // sovereign override and the scorer can honour it.
    (async () => {
      try {
        if (!snapshotForBridge) return;
        const { eventId, eventTitle, prev } = snapshotForBridge;
        if (!eventId && !eventTitle) return; // nothing the server can anchor to
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const token = await getAuthToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (DEV_MODE) headers['x-dev-user-id'] = DEV_USER.id;
        const fire = async (signal: string, meta: Record<string, any> = {}) => {
          try {
            const res = await supabase.functions.invoke('record-event-priority-signal', {
              headers,
              body: { eventId, eventTitle, signal, source: 'priority_tag', meta },
            });
            // invoke() does NOT reject on non-2xx; surface server-side errors
            // explicitly so DB constraint drift (e.g. signal whitelist) is
            // visible in the console instead of failing silently.
            if ((res as any)?.error) {
              console.warn('[TodayThreePriorities] tag bridge server-error', signal, (res as any).error);
            } else if ((res as any)?.data && (res as any).data.error) {
              console.warn('[TodayThreePriorities] tag bridge rejected', signal, (res as any).data);
            }
          } catch (e) {
            console.warn('[TodayThreePriorities] tag bridge failed', signal, e);
          }
        };
        // Importance — always fire on a user-initiated tag handler call.
        // We deliberately do NOT skip when next === prev: the local plan
        // ledger can hydrate `prev` from a stale write, which previously
        // silently dropped the DB row on re-taps from a different surface.
        // The server row is the audit trail; an extra duplicate row is
        // harmless and gives the scorer a fresh occurred_at.
        if (next.priorityTag === 'high' || next.priorityTag === 'medium' || next.priorityTag === 'low') {
          console.info('[tag-bridge] fired', { signal: `tag_importance_${next.priorityTag}`, eventId, eventTitle });
          await fire(`tag_importance_${next.priorityTag}`);
        } else if (next.priorityTag === null && prev.priorityTag !== null) {
          console.info('[tag-bridge] fired', { signal: 'tag_cleared', eventId, eventTitle });
          await fire('tag_cleared', { kind: 'importance' });
        }
        if (next.relationshipTag !== prev.relationshipTag && next.relationshipTag) {
          await fire('tag_relationship', { relationshipTag: next.relationshipTag });
        }
        const prevCustom = prev.customTags || [];
        const nextCustom = next.customTags || [];
        const added = nextCustom.filter((t) => !prevCustom.includes(t));
        if (added.length > 0) {
          await fire('tag_custom', { customTags: nextCustom });
        }
      } catch (e) {
        console.warn('[TodayThreePriorities] sovereign-tag bridge threw', e);
      }
    })();
  }, []);

  const loadReplacementEvents = useCallback(async () => {
    if (!effectiveUserId || !replacementSlot) return;
    setReplacementLoading(true);
    setReplacementError(null);
    try {
      // Calendar events live under deny-by-default RLS scoped to Supabase
      // auth.uid(). This app authenticates via Auth0, so the anon client
      // can never read these rows. Always go through the service-role
      // edge function which authenticates via Auth0 JWT.
      const headers: Record<string, string> = {};
      const token = await getAuthToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (DEV_MODE) headers['x-dev-user-id'] = DEV_USER.id;
      headers['x-user-tz-offset'] = String(new Date().getTimezoneOffset());
      const { data, error } = await supabase.functions.invoke(
        'list-replacement-calendar-events',
        { headers, body: {} },
      );
      if (error) throw error;
      const events = ((data?.events || []) as CalendarReplacementEvent[]).filter(
        (e) => e?.id && e?.title && e?.startTime && e?.endTime,
      );
      setReplacementEvents(events);
    } catch (error) {
      console.error('[TodayThreePriorities] Failed to load replacement events:', error);
      setReplacementEvents([]);
      setReplacementError('Unable to load calendar events right now.');
    } finally {
      setReplacementLoading(false);
    }
  }, [effectiveUserId, replacementSlot]);

  useEffect(() => {
    if (!replacementSlot) return;
    void loadReplacementEvents();
  }, [replacementSlot, loadReplacementEvents]);

  // Hydration gate: only switch from "seeding" to "newly completed" detection AFTER
  // the first successful load of completedPracticeIds for this plan instance.
  // Without this gate, the initial setCompletedPracticeIds() call (after plan load)
  // would be interpreted as a fresh batch of completions and re-trigger feedback/confetti.
  const hydratedRef = useRef(false);
  const prevCompletedIdsRef = useRef<string[]>([]);

  const autoRetryDoneRef = useRef(false);
  const authTimeoutRef = useRef(false);

  // ── Celebration ──
  const triggerCelebration = useCallback((practiceName: string, isAllComplete: boolean, practiceId?: string) => {
    if (practiceId && celebratedIdsRef.current.has(practiceId)) return;
    if (practiceId) {
      celebratedIdsRef.current.add(practiceId);
      persistSet(celebratedStorageKey, celebratedIdsRef.current);
    }
    if (isAllComplete) {
      confetti({ particleCount: 200, spread: 120, origin: { y: 0.5 }, colors: ['#D4AF37', '#F5D76E', '#FFD700', '#FFA500', '#E6C200'] });
      setTimeout(() => {
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.7, x: 0.3 }, colors: ['#D4AF37', '#F5D76E', '#FFD700'] });
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.7, x: 0.7 }, colors: ['#D4AF37', '#F5D76E', '#FFD700'] });
      }, 200);
    } else {
      confetti({ particleCount: 60, spread: 50, origin: { y: 0.6 }, colors: ['#D4AF37', '#8B7355', '#A9957B'] });
    }
    toast({
      title: isAllComplete ? 'All Priorities Complete!' : 'Practice Complete!',
      description: isAllComplete ? "Amazing work! You've completed all three priorities." : `Great job completing "${practiceName}"!`,
    });
  }, [celebratedStorageKey]);

  // ── Reset hydration gate when plan identity changes (new ritual / new period) ──
  useEffect(() => {
    hydratedRef.current = false;
    prevCompletedIdsRef.current = [];
  }, [plan?.meta?.generatedAt]);

  // ── Detect newly completed + per-priority feedback ──
  // Critical: this effect must NOT treat the initial hydration of completedPracticeIds
  // (loaded from DB / sessionStorage cache) as "new completions". The `hydratedRef` gate
  // ensures the very first run after a plan load just records baseline state.
  useEffect(() => {
    if (!plan) return;
    const modules = plan.horizonModules || [];

    // FIRST PASS after plan load: seed all already-complete priorities + celebrated IDs
    // from whatever was hydrated from storage. Do NOT trigger any modal/confetti.
    if (!hydratedRef.current) {
      modules.forEach((hm, idx) => {
        const sp = hm.practices || [hm.practice];
        const slotComplete = sp.every(p => completedPracticeIds.includes(p.contentId));
        if (slotComplete) {
          // Mark the priority key as already-shown so we never re-surface feedback
          // for a priority that was completed before this mount/refresh.
          feedbackShownRef.current.add(buildPriorityKey(idx, hm));
        }
      });
      completedPracticeIds.forEach(id => celebratedIdsRef.current.add(id));
      persistSet(celebratedStorageKey, celebratedIdsRef.current);
      persistSet(feedbackShownStorageKey, feedbackShownRef.current);
      prevCompletedIdsRef.current = completedPracticeIds;
      hydratedRef.current = true;
      return;
    }

    const prev = prevCompletedIdsRef.current;
    const newlyDone = completedPracticeIds.filter(id => !prev.includes(id));
    if (newlyDone.length === 0) {
      prevCompletedIdsRef.current = completedPracticeIds;
      return;
    }

    const allPracticesList = modules.flatMap(m => m.practices || [m.practice]);
    const found = allPracticesList.find(p => newlyDone.includes(p.contentId));
    const allIds = allPracticesList.map(p => p.contentId);
    const allDone = allIds.every(id => completedPracticeIds.includes(id));
    if (found) triggerCelebration(found.title, allDone, found.contentId);

    // Surface feedback for at most ONE newly completed priority per pass — and only if
    // its stable fingerprint has never been shown before.
    for (let idx = 0; idx < modules.length; idx++) {
      const hm = modules[idx];
      const key = buildPriorityKey(idx, hm);
      if (feedbackShownRef.current.has(key)) continue;
      const slotCancelled = hm.isCancelled === true;
      // Cancelled slots don't trigger the post-completion feedback modal —
      // the cancel flow already captured the user's relevance feedback.
      if (slotCancelled) continue;
      const sp = hm.practices || [hm.practice];
      const wasComplete = sp.every(p => prev.includes(p.contentId));
      const nowComplete = sp.every(p => completedPracticeIds.includes(p.contentId));
      if (!wasComplete && nowComplete) {
        feedbackShownRef.current.add(key);
        persistSet(feedbackShownStorageKey, feedbackShownRef.current);
        setFeedbackSlot({ index: idx, horizon: hm.horizon, key });
        break; // only one modal at a time
      }
    }

    prevCompletedIdsRef.current = completedPracticeIds;
  }, [completedPracticeIds, plan, triggerCelebration, celebratedStorageKey, feedbackShownStorageKey]);

  // ── Load plan ──
  const loadPlan = useCallback(async (opts?: {
    silent?: boolean;
    forceRefresh?: boolean;
    /**
     * Per-slot replacement map. Each entry pins a single calendar event
     * to a specific slot index. The server anchors ONLY that slot to that
     * event and never re-ranks the rest of the plan.
     */
    slotReplacements?: Record<number, { eventId: string }>;
  }) => {
    // Silent refreshes (e.g. background revalidation when we already
    // hydrated from sessionStorage) must not flip `loading` true — that
    // would re-trigger the scripted EngravedLoader for users who already
    // have a valid plan rendered. We still fetch in the background and
    // swap `plan` if anything changed.
    if (!opts?.silent && !noLocalSignalAtMount) setLoading(true);
    setFetchFailed(false);
    try {
      const currentPeriod = getCurrentTimeWindow();
      const todayDate = localISODate();
      const loadedKey = cacheKeys.planLoaded(todayDate, currentPeriod);
      const dataKey = cacheKeys.planData(todayDate, currentPeriod);
      const forceKey = cacheKeys.planForceRefresh(todayDate, currentPeriod);
      const slotReplacements = opts?.slotReplacements && typeof opts.slotReplacements === 'object'
        ? Object.entries(opts.slotReplacements).reduce<Record<string, { eventId: string }>>((acc, [k, v]) => {
            const idx = Number(k);
            const eventId = v?.eventId;
            if (Number.isInteger(idx) && idx >= 0 && typeof eventId === 'string' && eventId.length > 0) {
              acc[String(idx)] = { eventId };
            }
            return acc;
          }, {})
        : {};
      const hasSlotReplacements = Object.keys(slotReplacements).length > 0;
      const forceRefresh = opts?.forceRefresh === true || sessionStorage.getItem(forceKey) === '1' || hasSlotReplacements;
      const sessionLoaded = readPersistent<boolean>(loadedKey) === true;
      const todayRitual = await getTodayRitual(currentPeriod);
      // Plan surface: latest check-in of the day, not current-window only.
      const todayCheckin = await getLatestTodayCheckin();

      // ── Awaiting-signals gate (mirrors compute-outer-readiness contract) ──
      // If the Brief is awaiting signals (no fresh check-in today AND no fresh
      // wearable today), we MUST NOT generate a plan from defaults. The
      // Plan card renders the same quiet "Begin with your check-in"
      // prompt as the Brief. Server-side gate in generate-mastery-plan
      // enforces the same contract for any direct/edge caller.
      // briefMode is the canonical gate. Only true cold-start (no
      // wearable, no calendar, no check-in) suppresses Plan generation.
      const briefMode = (outerReadinessData as any)?.briefMode as
        | 'cold-start' | 'baseline' | 'refined' | undefined;
      const briefAwaiting = briefMode
        ? briefMode === 'cold-start'
        : outerReadinessData?.awaitingSignals === true;
      const wearableFresh = !!outerReadinessData?.wearableStatus?.hasTodayData;
      // Phase 1 — engine failure must not look like awaiting. Only suppress
      // Plan when there is truly no usable context AND the brief is a real
      // cold-start. If the inner/outer engine errored, we still attempt
      // generation off whatever calendar/checkin/wearable context exists.
      const engineStatus = (outerReadinessData as any)?.engineStatus as
        | 'ready' | 'awaiting' | 'auth-failure' | 'inner-failure' | 'outer-failure' | 'stale' | 'unknown-error' | undefined;
      const isEngineFailure =
        engineStatus === 'auth-failure' ||
        engineStatus === 'inner-failure' ||
        engineStatus === 'outer-failure' ||
        engineStatus === 'unknown-error';
      if (briefAwaiting && !todayCheckin && !wearableFresh && !isEngineFailure) {
        setAwaitingSignals(true);
        setPlan(null);
        setLoading(false);
        return;
      }
      // Materialised signal — clear stale awaiting flag if signals returned.
      setAwaitingSignals(false);

      const storedPracticeIds = todayRitual?.recommended_practice_ids;
      const hasStoredPlan = storedPracticeIds && storedPracticeIds.length > 0;
      let shouldRegenerate = forceRefresh || !hasStoredPlan;

      if (hasStoredPlan && todayRitual?.session_period && todayRitual.session_period !== currentPeriod) {
        shouldRegenerate = true;
        clearPersistent(loadedKey);
      }

      if (hasStoredPlan && !shouldRegenerate && todayCheckin && todayRitual) {
        const checkinTime = new Date(todayCheckin.timestamp);
        const planTime = new Date(todayRitual.updated_at || todayRitual.created_at || todayRitual.ritual_date);
        if (checkinTime.getTime() > planTime.getTime() + 60000) {
          shouldRegenerate = true;
          clearPersistent(loadedKey);
        }
      }

      // Persistent cache (survives full app reopen within the current window)
      if (!forceRefresh && !shouldRegenerate && sessionLoaded) {
        const cachedPlan = readPersistent<MasteryPlanResponse>(dataKey);
        if (cachedPlan) {
          const parsed = cachedPlan;
          // Cache version invalidation: old plans without horizonModules must be regenerated
          if (!parsed.horizonModules || parsed.horizonModules.length === 0) {
            clearPersistent(loadedKey);
            clearPersistent(dataKey);
            shouldRegenerate = true;
          }
          // JIT cache invalidation
          const jitCacheKey = `plan-jit-checked-${todayDate}-${currentPeriod}`;
          const lastJitCheck = sessionStorage.getItem(jitCacheKey);
          const hasCommittedPlan = hasStoredPlan && todayRitual?.recommended_practice_ids?.length > 0;
          const jitCacheStale = !parsed.preEventPlan && !hasCommittedPlan && (!lastJitCheck || (Date.now() - parseInt(lastJitCheck, 10)) > 10 * 60 * 1000);
          if (jitCacheStale) {
            clearPersistent(loadedKey);
            clearPersistent(dataKey);
            sessionStorage.setItem(jitCacheKey, String(Date.now()));
            shouldRegenerate = true;
          }

          if (!shouldRegenerate) {
            const cachedEnergyHash = sessionStorage.getItem(`plan-energy-hash-${todayDate}-${currentPeriod}`);
            // Glue plan cache to brief identity: when the brief regenerates legitimately
            // (new input_signature → new briefId), invalidate the plan with it.
            const briefIdForHash = (outerReadinessData as any)?.briefId ?? 'no-brief';
            // Strict brief-identity binding: signatureHash changes whenever
            // CEO-behaviour flags, slotBoosts, taxonomy, or any input the
            // brief reasoned over changes. Pair it with the wearable source
            // row date so wearable/calendar context refreshes also bust the
            // plan cache even when briefId is unchanged.
            const briefSigForHash =
              (outerReadinessData as any)?.behaviourSnapshot?.signatureHash ?? 'no-sig';
            const wearableSrcForHash =
              (outerReadinessData as any)?.wearableStatus?.sourceRowDate ?? 'no-w';
            const slotReplacementsHash = Object.entries(slotReplacements)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([k, v]) => `${k}=${v.eventId}`)
              .join(',');
            const currentEnergyHash = `${parsed.timeOfDayPlan?.period || currentPeriod}:${todayCheckin?.outcome || 'none'}:${todayCheckin?.energy_balance || 0}:${todayCheckin?.clarity_level ?? 'x'}:${todayCheckin?.confidence_level ?? 'x'}:brief=${briefIdForHash}:sig=${briefSigForHash}:w=${wearableSrcForHash}:slotrepl=${slotReplacementsHash}`;
            if (cachedEnergyHash && cachedEnergyHash !== currentEnergyHash) {
              clearPersistent(loadedKey);
              clearPersistent(dataKey);
              shouldRegenerate = true;
            } else {
              const stripped = stripCoachFromPlan(parsed)!;
              // Re-apply local mirror so cancellations/tags survive refresh.
              if (stripped.horizonModules) {
                stripped.horizonModules = applyPlanEditsToModules(
                  stripped.horizonModules, todayDate, currentPeriod,
                );
              }
              setPlan(stripped);
              // Day-scoped union so morning completions persist into afternoon ✓
              const unionCompleted = await getTodayCompletedUnion();
              const allCompleted = unionCompleted.length > 0
                ? unionCompleted
                : (todayRitual?.completed_practice_ids || []);
              const horizonIds = (stripped.horizonModules || []).flatMap(m => (m.practices || [m.practice]).map((p: any) => p.contentId));
              setCompletedPracticeIds(horizonIds.length > 0 ? allCompleted.filter((id: string) => horizonIds.includes(id)) : allCompleted);
              setLoading(false);
              return true;
            }
          }
        }
      }

      // Issue 1: if a cancel/undo persist is in flight, do not blow away
      // optimistic state by calling the generator before the write lands.
      if (pendingPersistRef.current > 0 && !forceRefresh) {
        setLoading(false);
        return true;
      }

      // Fetch fresh plan with retry logic for transient network errors
      let planData: any = null;
      let fetchError: any = null;
      const MAX_RETRIES = 2;
      const RETRY_DELAY_MS = 2000;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const headers: Record<string, string> = {};
        if (DEV_MODE) headers['x-dev-user-id'] = DEV_USER.id;
        const token = await getAuthToken();

        // Auth guard: if no token after retries, surface error instead of silent loop
        if (!token && !DEV_MODE) {
          if (attempt === MAX_RETRIES) {
            console.error('[TodayThreePriorities] Auth token unavailable after retries');
            fetchError = new Error('Auth token unavailable');
            break;
          }
          console.warn(`[TodayThreePriorities] Auth token not ready, attempt ${attempt + 1}`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }

        if (token) headers['Authorization'] = `Bearer ${token}`;

        // Build request body with outer readiness cache to skip ~2.8s server-to-server call
        const requestBody: any = {
          timezoneOffset: new Date().getTimezoneOffset(),
          forceRefresh: forceRefresh || awaitingSignals || !sessionLoaded,
          localDate: todayDate,
          todayCheckinId: todayCheckin?.id ?? null,
        };
        if (hasSlotReplacements) {
          // Per-slot anchoring contract: server pins each event to the
          // exact slot index here and never re-ranks other slots.
          requestBody.slotReplacements = slotReplacements;
        }
        if (outerReadinessData?.phrase) {
          requestBody.outerReadinessCache = {
            phrase: outerReadinessData.phrase,
            context: outerReadinessData.context,
            leanOn: outerReadinessData.leanOn,
            watchFor: outerReadinessData.watchFor,
            driver: outerReadinessData.driver,
            // Forward the canonical behaviour snapshot inline so the Plan
            // function reuses the exact snapshot the Brief reasoned over
            // (signatureHash, flagsPlan, slotBoosts, taxonomy, prompt block)
            // instead of re-loading a potentially-stale row from
            // brief_snapshots. The server still falls back to the DB row
            // (filtered by promptVersion + expectedSignatureHash) when this
            // field is absent.
            behaviourSnapshot: (outerReadinessData as any)?.behaviourSnapshot ?? null,
          };
        }

        const { data, error } = await supabase.functions.invoke('generate-mastery-plan', {
          headers,
          body: requestBody,
        });

        if (!error) {
          planData = data;
          fetchError = null;
          break;
        }

        fetchError = error;
        console.warn(`[TodayThreePriorities] Attempt ${attempt + 1} failed:`, error.message || error);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        }
      }

      if (fetchError || !planData) {
        console.error('Error calling generate-mastery-plan after retries:', fetchError);
        setFetchFailed(true);
        setLoading(false);
        // Auto-retry once after 3s if not already tried
        if (!autoRetryDoneRef.current) {
          autoRetryDoneRef.current = true;
          setTimeout(() => { loadPlan(); }, 3000);
        }
        return false;
      }

      if (planData?.awaitingSignals === true || planData?.planState === 'awaiting_signals') {
        setAwaitingSignals(true);
        setPlan(null);
        clearPersistent(loadedKey);
        clearPersistent(dataKey);
        try { sessionStorage.removeItem(forceKey); } catch { /* ignore */ }
        setLoading(false);
        return false;
      }

      const planResponse = stripCoachFromPlan(planData as MasteryPlanResponse)!;
      // Re-apply local mirror onto fresh server response so optimistic
      // cancellations/tags survive races where persistence hasn't landed yet.
      if (planResponse.horizonModules) {
        planResponse.horizonModules = applyPlanEditsToModules(
          planResponse.horizonModules, todayDate, currentPeriod,
        );
      }
      setPlan(planResponse);

      // Store plan for stability
      if (user || DEV_MODE) {
        const allModules = planResponse.horizonModules?.length
          ? planResponse.horizonModules.flatMap(m => (m.practices || [m.practice]).map(p => p.contentId))
          : planResponse.timeOfDayPlan.modules.map(m => m.contentId);

        const existingRitual = await getTodayRitual(currentPeriod);
        // Day-scoped union so prune logic respects ALL today's completions
        const unionCompleted = await getTodayCompletedUnion();
        const existingCompleted = unionCompleted.length > 0
          ? unionCompleted
          : (existingRitual?.completed_practice_ids || []);
        const prunedCompleted = existingCompleted.filter((id: string) => allModules.includes(id));

        await upsertRitual({
          ritual_date: todayDate,
          recommended_practice_ids: allModules,
          recommended_practices_count: allModules.length,
          completed_practice_ids: prunedCompleted,
          completion_status: prunedCompleted.length >= allModules.length && prunedCompleted.length > 0 ? 'full' : prunedCompleted.length > 0 ? 'partial' : 'skipped',
          session_period: planResponse.timeOfDayPlan.period,
        });
        {
          const ttl = msUntilWindowEnd();
          writePersistent(loadedKey, true, ttl);
          writePersistent(dataKey, planResponse, ttl);
        }
        try { sessionStorage.removeItem(forceKey); } catch { /* ignore */ }
        {
          const briefIdForHash = (outerReadinessData as any)?.briefId ?? 'no-brief';
          const briefSigForHash =
            (outerReadinessData as any)?.behaviourSnapshot?.signatureHash ?? 'no-sig';
          const wearableSrcForHash =
            (outerReadinessData as any)?.wearableStatus?.sourceRowDate ?? 'no-w';
          const slotReplacementsHash = Object.entries(slotReplacements)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([k, v]) => `${k}=${v.eventId}`)
            .join(',');
          sessionStorage.setItem(`plan-energy-hash-${todayDate}-${currentPeriod}`, `${planResponse.timeOfDayPlan?.period || currentPeriod}:${todayCheckin?.outcome || 'none'}:${todayCheckin?.energy_balance || 0}:${todayCheckin?.clarity_level ?? 'x'}:${todayCheckin?.confidence_level ?? 'x'}:brief=${briefIdForHash}:sig=${briefSigForHash}:w=${wearableSrcForHash}:slotrepl=${slotReplacementsHash}`);
        }
        setCompletedPracticeIds(prunedCompleted);
      }
    } catch (error) {
      console.error('Error loading plan:', error);
      setLoading(false);
      return false;
    }
    setLoading(false);
    return true;
  }, [user, outerReadinessData, noLocalSignalAtMount]);

  useEffect(() => {
    // Wait for the brief to resolve before kicking off `loadPlan` — without
    // this the first call races ahead of the awaiting-signals contract and
    // generates a plan from defaults before the brief tells us to suppress.
    if (outerReadinessData === undefined) return;
    // If we hydrated from sessionStorage at mount, run the load silently —
    // the user already sees their plan; any refresh happens in-place.
    loadPlan({ silent: initialCachedRef.current });
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkCompletion();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    const interval = setInterval(() => { if (plan) checkCompletion(); }, 60000);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', handleVisibility); };
  }, [user?.id, outerReadinessData]);

  useEffect(() => { if (plan) checkCompletion(); }, [plan]);

  const checkCompletion = async () => {
    const effectiveUserId = user?.id || (DEV_MODE ? DEV_USER.id : null);
    if (!effectiveUserId || !plan) return;
    const currentPeriod = getCurrentTimeWindow();
    const ritual = await getTodayRitual(currentPeriod);
    const horizonIds = (plan.horizonModules || []).flatMap(m => (m.practices || [m.practice]).map((p: any) => p.contentId));
    // Stateful Plan Evolution: union completion across ALL today's periods,
    // so a morning-completed slot still shows ✓ in the afternoon's brief.
    const unionCompleted = await getTodayCompletedUnion();
    const allCompleted = unionCompleted.length > 0
      ? unionCompleted
      : (ritual?.completed_practice_ids || []);
    let active = horizonIds.length > 0 ? allCompleted.filter((id: string) => horizonIds.includes(id)) : allCompleted;

    // Stoic companion bridge: when the ReflectionCorner's "Optional companion"
    // (stoic-reflection) is completed inside the player, it lands in
    // completed_practice_ids as 'stoic-reflection'. Map that to the integrate
    // slot's own contentId so the slot is treated as fulfilled and the
    // PlanFeedbackModal fires for this priority.
    if (allCompleted.includes('stoic-reflection')) {
      const integrateSlot = (plan.horizonModules || []).find(
        (m: any) => (m.practice?.title === 'Tiny Win and Reflection' || m.practice?.type === 'integrate'),
      );
      const integrateId = integrateSlot?.practice?.contentId;
      if (integrateId && !active.includes(integrateId)) {
        active = [...active, integrateId];
      }
    }
    // Only update state if content actually changed — prevents spurious effect re-runs
    setCompletedPracticeIds(prev => {
      const prevKey = [...prev].sort().join(',');
      const nextKey = [...active].sort().join(',');
      return prevKey === nextKey ? prev : active;
    });

    if (active.length >= horizonIds.length && active.length > 0) {
      if (ritual && ritual.completion_status !== 'full') {
        await upsertRitual({ ritual_date: localISODate(), completion_status: 'full', session_period: currentPeriod });
      }
    }
  };

  // ── Navigation ──
  const navigateToCoach = (prompt: string, flowType: string, eventTitle?: string) => {
    navigate('/coach', {
      state: { initialPrompt: prompt, flowType, eventTitle, fromRitual: true, entryRoute: location.pathname, entryContext: { entryPoint: 'tod_plan', lastAction: 'started daily plan', triggeredBy: null } },
    });
  };

  // Queue is scoped to the CURRENT priority only (per-priority queue contract).
  // Each Today priority owns its own ritual/feedback loop — finishing priority 1's
  // practices triggers priority-1 feedback, then the user can independently start
  // priority 2. This prevents the player tracker from spanning multiple priorities.
  const navigateToPractice = async (module: PlanModule, slotModules: PlanModule[]) => {
    localStorage.removeItem('jitInterventionData');
    localStorage.setItem('practiceQueue', JSON.stringify(slotModules.map(m => ({
      id: m.contentId, title: m.title, contentType: m.contentType, category: m.contentType === 'coach' ? 'coach' : 'pause', duration: m.duration,
    }))));
    const idx = slotModules.findIndex(m => m.contentId === module.contentId);
    localStorage.setItem('queueIndex', String(idx >= 0 ? idx : 0));
    localStorage.setItem('ritualMode', 'true');

    if (user) {
      const today = localISODate();
      const currentPeriod = getCurrentTimeWindow();
      // Daily ritual completion still tracks the FULL day's recommendations
      // (derived from horizonModules in loadPlan). We don't overwrite that here
      // with the per-slot subset — only when generating the plan initially.
      await upsertRitual({
        ritual_date: today,
        session_period: currentPeriod,
        completion_status: 'partial',
      });
    }

    if (module.isCoachCard) {
      // Reflection Corner replaces /coach for the evening "Tiny Win and Reflection" slot.
      // We route back to /plan with the expand flag so the inline card opens here.
      if (module.title === 'Tiny Win and Reflection' || module.type === 'integrate') {
        navigate('/plan?expand=reflection');
        return;
      }
      const coachCard = plan?.timeOfDayPlan?.coachCard;
      const prompt = coachCard?.prompt || "Let's take a moment to center before what's ahead.";
      navigateToCoach(prompt, module.type, undefined);
      return;
    }

    // For JIT modules, set up JIT intervention data
    if (plan?.preEventPlan) {
      const jitModule = plan.preEventPlan.modules?.find((m: any) => m.contentId === module.contentId);
      if (jitModule) {
        localStorage.setItem('jitInterventionData', JSON.stringify({
          coachPrompt: plan.preEventPlan.coachCard?.prompt,
          flowType: 'prepare',
          eventTitle: plan.preEventPlan.eventTitle,
        }));
      }
    }

    let route: string;
    if (module.contentType === 'soundbath') route = `/soundscapes/${module.contentId}`;
    else if (module.contentType === 'guided-practice') route = `/guided-practices/${module.contentId}`;
    else route = `/micro-practice/${module.contentId}/cards`;
    navigate(route, { state: { category: 'pause', fromRitual: true, entryRoute: location.pathname } });
  };

  // ── JIT Dismiss ──
  const handleJitDismiss = async (slotIndex: number, hm: HorizonModule) => {
    if (!hm.isJit || !plan?.preEventPlan) return;
    try {
      const token = await getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (DEV_MODE) headers['x-dev-user-id'] = DEV_USER.id;

      const snoozeCountKey = `jit_snooze_count_${plan.preEventPlan.eventType || 'unknown'}`;
      const priorCount = parseInt(localStorage.getItem(snoozeCountKey) || '0', 10);
      const newCount = priorCount + 1;
      localStorage.setItem(snoozeCountKey, String(newCount));

      await supabase.functions.invoke('track-jit-skip', {
        headers,
        body: {
          action: newCount >= 3 ? 'dismissed' : 'snoozed',
          eventType: plan.preEventPlan.eventType,
          eventTitle: plan.preEventPlan.eventTitle,
          eventId: plan.preEventPlan.eventId || null,
          horizon: plan.preEventPlan.horizon || null,
        },
      });
    } catch { /* silent */ }
  };

  // ── Auto-expand next slot on completion ──
  useEffect(() => {
    if (!plan?.horizonModules) return;
    const modules = plan.horizonModules;
    // If the URL asked us to expand the Reflection Corner, find the integrate / Tiny Win slot
    // and expand it instead of the default "next uncompleted" logic.
    if (expandReflection) {
      const idx = modules.findIndex((hm) => {
        const sp = hm.practices || [hm.practice];
        return sp.some((p) => p.title === 'Tiny Win and Reflection' || p.type === 'integrate');
      });
      if (idx >= 0) {
        setExpandedSlot(idx);
        return;
      }
    }
    // Auto-expand respects the sovereign tag layer: HIGH lifts to top,
    // LOW sinks to bottom and is skipped on the first pass. The user's
    // tag thus has an instant, visible effect on which slot the home
    // page invites them to start, without waiting for a plan regen.
    const order = sovereignDisplayOrder(modules);
    // First pass: skip LOW slots — they are de-prioritised by the user.
    for (const i of order) {
      const slotPractices = modules[i].practices || [modules[i].practice];
      const slotComplete = slotPractices.every(p => completedPracticeIds.includes(p.contentId));
      const slotCancelled = modules[i].isCancelled === true;
      const isLow = (modules[i] as any).priorityTag === 'low';
      if (!slotComplete && !slotCancelled && !isLow) {
        setExpandedSlot(i);
        return;
      }
    }
    // Fallback: if every incomplete slot is LOW, expand the first one anyway.
    for (const i of order) {
      const slotPractices = modules[i].practices || [modules[i].practice];
      const slotComplete = slotPractices.every(p => completedPracticeIds.includes(p.contentId));
      const slotCancelled = modules[i].isCancelled === true;
      if (!slotComplete && !slotCancelled) {
        setExpandedSlot(i);
        return;
      }
    }
    // All done
    setExpandedSlot(-1);
  }, [completedPracticeIds, plan, expandReflection]);

  const horizonModules = plan?.horizonModules;

  // ── Script-gated reveal ──
  // Hold the priorities content until BOTH the fetch completes AND the
  // scripted "mixture" narration plays every step in order. Empty/error
  // states are NOT gated — they're alternate terminal states that render
  // immediately if the fetch finishes empty.
  const [planScriptDone, setPlanScriptDone] = useState(!!initialCached);

  // Signal empty/loaded state to parent for fallback rendering
  // Only fire onEmpty when genuinely no data AND not a transient fetch failure.
  // Suppress onEmpty in the awaiting-signals state — we already render the
  // unified prompt here, so the parent must NOT mount DailyRitual (which
  // would show the same prompt a second time).
  useEffect(() => {
    if (
      !loading &&
      !fetchFailed &&
      !awaitingSignals &&
      (!horizonModules || horizonModules.length === 0)
    ) {
      onEmpty?.();
    } else if (!loading && horizonModules && horizonModules.length > 0) {
      onLoaded?.();
    }
  }, [loading, fetchFailed, awaitingSignals, horizonModules, onEmpty, onLoaded]);

  // ── Render ──
  // ── Loading skeleton with visible card structure ──
  const dataReady = !loading && horizonModules && horizonModules.length > 0;
  const sortedHorizonModules = (horizonModules || [])
    .map((hm, index) => ({ hm, index }))
    .sort((a, b) => {
      const rank = (tag: any) => (tag === 'high' ? 0 : tag === 'low' ? 2 : 1);
      const r = rank((a.hm as any).priorityTag) - rank((b.hm as any).priorityTag);
      return r !== 0 ? r : a.index - b.index;
    });
  const hasNonLowIncomplete = sortedHorizonModules.some(({ hm }) => {
    const slotPractices = hm.practices || [hm.practice];
    const slotCompleted = slotPractices.every((p) => completedPracticeIds.includes(p.contentId));
    const slotCancelled = hm.isCancelled === true;
    return !slotCompleted && !slotCancelled && hm.priorityTag !== 'low';
  });
  const visibleHorizonModules = sortedHorizonModules.filter(({ hm }) => {
    const slotPractices = hm.practices || [hm.practice];
    const slotCompleted = slotPractices.every((p) => completedPracticeIds.includes(p.contentId));
    const slotCancelled = hm.isCancelled === true;
    if (slotCompleted || slotCancelled) return true;
    if (hm.priorityTag === 'low' && hasNonLowIncomplete) return false;
    return true;
  });
  // Cached-render-and-silent-verification: if a valid cached plan was
  // present at mount, we never re-show the scripted loader during a
  // background refresh — even if `loading` flips true transiently.
  const showPlanLoader =
    !initialCachedRef.current && (loading || (dataReady && !planScriptDone));
  if (showPlanLoader) {
    return (
      <div className="space-y-4 pt-2">
        <div className="flex flex-col gap-3 px-4 max-w-lg mx-auto">
          {/* Faint card scaffold so layout doesn't jump when priorities arrive */}
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-3 py-2 opacity-60">
              <div className="w-7 h-7 rounded-full bg-muted/20 flex items-center justify-center text-xs text-muted-foreground/40 font-bold">
                {n}
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-muted/15 rounded-md w-16" />
                <div className="h-3.5 bg-muted/15 rounded-md w-3/4" />
              </div>
            </div>
          ))}

          <EngravedLoader
            steps={[
              "Reading today's brief…",
              "Scanning your calendar & demands…",
              "Matching practices to your state…",
              "Sequencing your 3 priorities…",
            ]}
            onAllStepsComplete={() => setPlanScriptDone(true)}
          />
        </div>
      </div>
    );
  }

  // ── Awaiting-signals empty state ──
  // Mirrors the Brief contract: when neither check-in nor today's wearable
  // is present, show the same quiet prompt instead of a generated plan.
  if (awaitingSignals) {
    return (
      <div className="space-y-4 pt-2">
        <div className="flex flex-col gap-3 px-4 max-w-lg mx-auto">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-3 py-2">
              <div className="w-7 h-7 rounded-full bg-muted/20 flex items-center justify-center text-xs text-muted-foreground/30 font-bold">
                {n}
              </div>
              <div className="flex-1">
                <div className="h-3.5 bg-muted/10 rounded-md w-2/3" />
              </div>
            </div>
          ))}
          <button
            onClick={() => navigate('/daily-check-in')}
            className="mt-1 flex flex-col items-start gap-1.5 pl-10 pr-3 py-2 rounded-xl text-left hover:bg-muted/10 transition-colors"
          >
            <span className="text-quote text-foreground">
              Awaiting signals
            </span>
            <span className="flex items-start gap-1 text-body-sm text-[hsl(var(--muted-foreground-v2))]">
              <span>{READINESS_AWAITING_MESSAGE}</span>
              <ChevronRight size={12} className="text-muted-foreground/40 shrink-0 mt-0.5" />
            </span>
          </button>
        </div>
      </div>
    );
  }

  // ── Empty / error state — always show card shell ──
  if (!horizonModules || horizonModules.length === 0) {
    return (
      <div className="space-y-4 pt-2">
        <div className="flex flex-col gap-3 px-4 max-w-lg mx-auto">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-3 py-2">
              <div className="w-7 h-7 rounded-full bg-muted/20 flex items-center justify-center text-xs text-muted-foreground/30 font-bold">
                {n}
              </div>
              <div className="flex-1">
                <div className="h-3.5 bg-muted/10 rounded-md w-2/3" />
              </div>
            </div>
          ))}

          {/* Contextual prompt */}
          <div className="pt-2">
            {fetchFailed ? (
              <div className="flex flex-col items-center gap-2 py-3">
                <p className="text-xs text-muted-foreground/60 font-body">
                  Your plan is loading...
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { autoRetryDoneRef.current = false; loadPlan(); }}
                  className="h-8 text-xs gap-1.5 rounded-lg border-muted-foreground/20"
                >
                  <RefreshCw size={12} />
                  Retry
                </Button>
              </div>
            ) : (
              <button
                onClick={() => navigate('/daily-check-in')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-muted/10 hover:bg-muted/20 transition-colors"
              >
                <span className="text-xs text-muted-foreground/70 font-body">
                  Check in to build your plan
                </span>
                <ChevronRight size={12} className="text-muted-foreground/40" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const allPractices = horizonModules.flatMap(m => m.practices || [m.practice]);
  const allComplete = allPractices.every(p => completedPracticeIds.includes(p.contentId));
  const completedPriorityCount = horizonModules.filter(hm => {
    const sp = hm.practices || [hm.practice];
    return sp.every(p => completedPracticeIds.includes(p.contentId));
  }).length;

  return (
    <div className="space-y-4 pt-2 animate-fade-in">
      <div className="px-4 max-w-lg mx-auto">
        <PostEventReflection />
      </div>

      {/* Header with info modal */}
      <div className="px-4 max-w-lg mx-auto">
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xs font-medium font-body whitespace-nowrap",
              allComplete ? "text-saffron" : completedPriorityCount > 0 ? "text-saffron/80" : "text-muted-foreground"
            )}>
              {completedPriorityCount > 0 && <Check size={12} className="inline mr-0.5 -mt-0.5" />}
              {completedPriorityCount} of {horizonModules.length}
            </span>
            <MetricInfoModal
              title="Today's 3 Performance Priorities"
              description="Three practices chosen for what you need today and the shape of your day ahead. Sequenced to help you close the gap between where you are and where the day needs you to be."
            />
          </div>
        </div>
        {plan?.ledger?.source === 'bonus-round' && plan.ledger.victoryLine && (
          <p className="mt-1.5 text-[11px] text-saffron/90 font-body leading-snug">
            {plan.ledger.victoryLine}
          </p>
        )}
      </div>

      {/* 3 Slots — each priority on its own card so users perceive them as
          three distinct things to do at different times rather than one
          bulky block. Pure UI grouping; no logic/tracking changes. */}
      <div className="flex flex-col gap-3 px-1 sm:px-2 max-w-2xl mx-auto">
        {visibleHorizonModules.map(({ hm, index }) => {
          const slotPractices = hm.practices || [hm.practice];
          const slotCompleted = slotPractices.every(p => completedPracticeIds.includes(p.contentId));
          const slotCompletedCount = slotPractices.filter(p => completedPracticeIds.includes(p.contentId)).length;
          const isExpanded = expandedSlot === index;
          const hasMultiple = slotPractices.length > 1;
          const module = hm.practice; // primary practice for collapsed view
          const slotKey = buildPriorityKey(index, hm);
          const slotCancelled = hm.isCancelled === true;
          const tagState: PriorityTagState = {
            priorityTag: (hm.priorityTag ?? null) as PriorityTagState['priorityTag'],
            relationshipTag: (hm.relationshipTag ?? null) as PriorityTagState['relationshipTag'],
            customTags: hm.customTags || [],
          };

          // Cancelled slots stay visible in place but compressed: greyed +
          // strike-through + Undo. Completion state is preserved on the
          // underlying completedPracticeIds, so uncancelling restores the
          // exact prior visual (incl. ✓ if it was completed before cancel).
          // Phase 2: inline replacement picker — renders in place of the slot
          // card when this slot is the active replacement target. Keeps all
          // selection state in the existing `replacement*` state owned by this
          // component (no separate route, no modal overlay).
          if (replacementSlot?.index === index) {
            return (
              <CalendarReplacementPickerInline
                key={`${module.contentId}-${index}-picker`}
                slotNumber={index + 1}
                slotTitle={replacementSlot.title}
                events={replacementEvents}
                selectedIds={replacementSelection}
                onToggleEvent={(eventId) => {
                  setReplacementSelection((prev) => {
                    // Single-select: tap to choose, tap again to clear.
                    // Rule: 1 event = 1 priority slot. Total plan = 3 priorities.
                    if (prev.length === 1 && prev[0] === eventId) return [];
                    return [eventId];
                  });
                }}
                onApply={async () => {
                  // Phase 3: Apply triggers a real recalibration through the
                  // existing generate-mastery-plan edge function. We:
                  //   1. Guard against double-submit via regeneratingRef.
                  //   2. Persist the slot edit so the ledger reflects the choice.
                  //   3. Close the inline picker BEFORE the network call so the
                  //      existing EngravedLoader (driven by `loading`) takes over
                  //      the priorities surface — no new loader, same copy.
                  //   4. Call loadPlan with silent:false + selectedCalendarEventIds
                  //      so the loader appears and the generator actually weights
                  //      the chosen events.
                  if (replacementSelection.length === 0) return;
                  if (regeneratingRef.current) return;
                  regeneratingRef.current = true;
                  const selectedIds = [...replacementSelection];
                  try {
                    const saved = await persistPlanLedgerEdit(
                      replacementSlot.index,
                      {
                        cancelled: false,
                        cancelReason: null,
                        replacementEventIds: selectedIds,
                      },
                      getCurrentTimeWindow(),
                    );
                    if (!saved) {
                      toast({ title: 'Could not save the replacement selection', description: 'The regenerated plan was not applied because persistence failed.', variant: 'destructive' });
                      return;
                    }
                    // Optimistically clear the cancelled/greyed state on this
                    // slot so the user sees the priority refresh into a new
                    // plan immediately (rather than the strike-through card
                    // lingering until the regen response lands).
                    setPlan((prev) => {
                      if (!prev?.horizonModules) return prev;
                      const next = { ...prev, horizonModules: prev.horizonModules.map((m, i) =>
                        i === replacementSlot.index
                          ? { ...m, isCancelled: false, cancelReason: null, replacementEventIds: selectedIds }
                          : m,
                      ) } as MasteryPlanResponse;
                      try {
                        const ttl = msUntilWindowEnd();
                        const today = localISODate();
                        const period = getCurrentTimeWindow();
                        writePersistent(cacheKeys.planData(today, period), next, ttl);
                        // CRITICAL: update the local edits mirror too. Without this,
                        // `applyPlanEditsToModules` would re-apply the prior
                        // cancelled:true edit on top of the fresh server response
                        // (and on top of the cache on refresh), so the replaced
                        // priority would snap back to the greyed/cancelled card.
                        patchPlanSlotEdit(today, period, replacementSlot.index, {
                          cancelled: false,
                          cancelReason: null,
                          replacementEventIds: selectedIds,
                        });
                      } catch { /* ignore */ }
                      return next;
                    });
                    // Reset picker state and close BEFORE the regenerate call
                    // so the existing EngravedLoader is what the user sees.
                    setReplacementSelection([]);
                    setReplacementSlot(null);
                    // Surface the existing loader (silent:false) while the
                    // generator runs with the selected events.
                    // Per-slot anchoring: this replacement is bound to
                    // `replacementSlot.index` only. The server will pin the
                    // chosen event to that exact slot and leave the others
                    // (and any cancelled-in-place slots) untouched.
                    await loadPlan({
                      silent: false,
                      forceRefresh: true,
                      slotReplacements: { [replacementSlot.index]: { eventId: selectedIds[0] } },
                    });
                  } finally {
                    regeneratingRef.current = false;
                  }
                }}
                onClose={() => {
                  setReplacementSelection([]);
                  setReplacementSlot(null);
                }}
                isLoading={replacementLoading}
                error={replacementError}
              />
            );
          }

          if (slotCancelled) {
            return (
              <div
                key={`${module.contentId}-${index}`}
                className="rounded-xl card-standard px-3 py-1.5 opacity-60"
              >
                <div className="flex items-center gap-3 py-1">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 bg-muted/30 text-muted-foreground/60">
                    {slotCompleted ? <Check size={12} className="stroke-[3]" /> : index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium leading-tight line-clamp-2 break-words text-muted-foreground/70 line-through">
                      {performanceSlotLabel(hm.timeLabel, hm.isJit)}
                    </p>
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <PriorityTagAffordance
                        value={tagState}
                        onChange={(next) => updateSlotTags(index, next)}
                        muted
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground/50 font-body mt-1">
                      Cancelled
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      // Optimistic: instantly restore the slot locally so
                      // the prior state returns without waiting for the
                      // server. Persistence runs in the background; on
                      // failure we roll back to cancelled.
                      setPlan((prev) => {
                        if (!prev?.horizonModules) return prev;
                        const next = { ...prev, horizonModules: prev.horizonModules.map((m, i) =>
                          i === index ? { ...m, isCancelled: false, cancelReason: null } : m,
                        ) } as MasteryPlanResponse;
                        try {
                          const ttl = msUntilWindowEnd();
                          const today = localISODate();
                          const period = getCurrentTimeWindow();
                          writePersistent(cacheKeys.planData(today, period), next, ttl);
                          // Mirror the un-cancel into the local edits store so
                          // refresh / silent refetch cannot resurrect the
                          // prior cancelled:true edit.
                          patchPlanSlotEdit(today, period, index, {
                            cancelled: false,
                            cancelReason: null,
                            replacementEventIds: hm.replacementEventIds || [],
                          });
                        } catch { /* ignore */ }
                        return next;
                      });
                      (async () => {
                        const saved = await persistPlanLedgerEdit(
                          index,
                          {
                            cancelled: false,
                            cancelReason: null,
                            replacementEventIds: hm.replacementEventIds || [],
                          },
                          getCurrentTimeWindow(),
                        );
                        if (!saved) {
                          setPlan((prev) => {
                            if (!prev?.horizonModules) return prev;
                            return { ...prev, horizonModules: prev.horizonModules.map((m, i) =>
                              i === index ? { ...m, isCancelled: true } : m,
                            ) } as MasteryPlanResponse;
                          });
                          toast({ title: 'Could not restore this priority', description: 'Your change was not saved.', variant: 'destructive' });
                        }
                      })();
                    }}
                    className="text-[11px] font-medium text-taupe hover:text-taupe-rich px-2 py-1 rounded-md hover:bg-taupe/10 flex-shrink-0"
                    aria-label="Undo cancel"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      resetReplacementEditor(hm);
                      setReplacementSlot({ index, key: slotKey, title: `${hm.timeLabel} · ${module.title}` });
                    }}
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted/30 flex-shrink-0"
                    aria-label="Replace with calendar event"
                  >
                    Replace
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={`${module.contentId}-${index}`}
              className={cn(
                // Pilot v2 — standard card: tonal bg + hairline border + elev-1 (2 mechanisms)
                "space-y-0 rounded-xl card-standard px-3 py-1 transition-colors"
              )}
            >
              {/* Slot header row */}
              <button
                onClick={() => setExpandedSlot(isExpanded ? -1 : index)}
                className="w-full flex items-center gap-3 py-2 text-left"
              >
                {/* Number circle */}
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all",
                    slotCompleted
                      ? "bg-taupe text-white"
                      : isExpanded
                        ? "bg-saffron text-white"
                        : "bg-muted/40 text-muted-foreground",
                    hm.showPulse && !slotCompleted && "animate-pulse"
                  )}
                >
                  {slotCompleted ? <Check size={14} className="stroke-[3]" /> : index + 1}
                </div>

                {/* Arc badge — Prepare / During / Recover / Steady.
                    Renders only when the slot is anchored to a known event
                    (or carries an explicit arc), so multi-arc allocations
                    of the same event are self-explanatory. Muted chip style
                    — no new colour token. */}
                {hm.arcLabel && (hm.isJit || !!hm.jitEventTitle) && (
                  <span
                    className={cn(
                      "text-[10px] tracking-[0.12em] uppercase font-body px-1.5 py-0.5 rounded-full bg-muted/40 text-muted-foreground/80 flex-shrink-0",
                      slotCompleted && "opacity-60"
                    )}
                    aria-label={`Arc: ${hm.arcLabel}`}
                  >
                    {hm.arcLabel}
                  </span>
                )}

                {/* Header — bold WHEN as Tier 1 anchor */}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-[15px] md:text-[16px] font-semibold leading-tight line-clamp-2 break-words",
                    slotCompleted ? "text-muted-foreground/60 line-through" : "text-foreground"
                  )}>
                    {performanceSlotLabel(hm.timeLabel, hm.isJit)}
                  </p>
                  {!isExpanded && (
                    <div>
                      {/* Collapsed order mirrors expanded: tag → why-this-matters.
                          Practice title intentionally hidden until expand. */}
                      <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                        <PriorityTagAffordance
                          value={tagState}
                          onChange={(next) => updateSlotTags(index, next)}
                        />
                      </div>
                      {hm.whyLine && !slotCompleted && (
                        <div className="mt-2 space-y-1">
                          <span className="text-[10px] tracking-[0.14em] uppercase font-body text-muted-foreground/70">
                            Why this matters
                          </span>
                          <p className="text-[12px] text-foreground/75 font-body leading-relaxed">
                            {stripBriefMarkdown(hm.whyLine)}
                          </p>
                        </div>
                      )}
                      {hasMultiple && !slotCompleted && (
                        <p className="text-[10px] text-muted-foreground/50 font-body mt-1">
                          {slotCompletedCount} of {slotPractices.length} done
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Expand/collapse arrow or dismiss */}
                {!slotCompleted && !isExpanded && (
                  <ChevronRight size={14} className="text-muted-foreground/40 flex-shrink-0" />
                )}
                {!slotCompleted && isExpanded && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingCancel({
                        index,
                        key: slotKey,
                        title: `${hm.timeLabel} · ${module.title}`,
                        eventTitle: hm.isJit ? hm.jitEventTitle ?? null : null,
                      });
                    }}
                    className="p-1 rounded-full hover:bg-muted/30 flex-shrink-0"
                    aria-label="Cancel priority"
                  >
                    <X size={14} className="text-muted-foreground/50" />
                  </button>
                )}
              </button>

              {/* Expanded content */}
              {isExpanded && !slotCompleted && (
                <div className="pl-10 space-y-2 pb-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  {/* Pill row — only for JIT slots (real upcoming event).
                      Morning/evening non-JIT slots hide both pills per spec. */}
                  {hm.isJit && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground font-body">
                        {hm.jitMinutesUntil != null && hm.jitMinutesUntil < 120
                          ? `in ${hm.jitMinutesUntil} min`
                          : hm.timeLabel}
                      </span>
                      {hm.showPriorityPill && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-foreground/8 text-foreground font-medium">
                          Priority event
                        </span>
                      )}
                    </div>
                  )}

                  <div onClick={(e) => e.stopPropagation()}>
                    <PriorityTagAffordance
                      value={tagState}
                      onChange={(next) => updateSlotTags(index, next)}
                    />
                  </div>

                  {hm.whyLine && (
                    <div className="space-y-1">
                      <span className="text-[10px] tracking-[0.14em] uppercase font-body text-muted-foreground/70">
                        Why this matters
                      </span>
                      <p className="text-[13px] text-foreground/85 font-body leading-relaxed">
                        {stripBriefMarkdown(hm.whyLine)}
                      </p>
                    </div>
                  )}

                  <p className="text-[13px] italic text-muted-foreground font-body leading-relaxed pt-0.5">
                    {stripBriefMarkdown(hm.recommendedAction || fallbackRecommendedAction(hm))}
                  </p>

                  {/* Sequence reasoning (multi-practice helper, if present) */}
                  {hm.sequenceReasoning && hasMultiple && (
                    <p className="text-xs text-muted-foreground/80 font-body leading-relaxed">
                      {hm.sequenceReasoning}
                    </p>
                  )}

                  {/* Reflection Corner — inline replacement for the suppressed /coach surface
                      on the evening "Tiny Win and Reflection" priority. Rendered AFTER the
                      label/whyLine so context sets up the reflection, before the practice card.

                      Temporal gate: only render between 18:00 and 22:59 local. In the
                      Early Hours tail (00:00–04:59) the prompt "what did you do right
                      TODAY" is incoherent — the server already rewrites the practice
                      to a forward-looking "Sleep Prep & Tomorrow Framing" companion,
                      so we suppress the reflection capture here defensively. */}
                  {(() => {
                    const isReflectionPractice = module.title === 'Tiny Win and Reflection'
                      || module.type === 'integrate';
                    if (!isReflectionPractice) return false;
                    const hour = new Date().getHours();
                    return hour >= 18 && hour < 23;
                  })() && (
                    <ReflectionCorner
                      postEventTitle={reflectionContext === 'post-event' ? reflectionEvent : null}
                      onSaved={async () => {
                        try {
                          const { updateRitualCompletion } = await import('@/utils/dailyRituals');
                          await updateRitualCompletion(
                            'micro_exercise',
                            module.contentId,
                            allPractices.map((p) => ({ id: p.contentId }))
                          );
                          setCompletedPracticeIds((prev) =>
                            prev.includes(module.contentId) ? prev : [...prev, module.contentId]
                          );
                        } catch (e) {
                          console.error('[TodayThreePriorities] reflection mark complete failed', e);
                        }
                      }}
                    />
                  )}

                  {/* Integrate slot owns its own actions inside ReflectionCorner
                      (Save win + Start companion). The redundant coach practice
                      card and bottom Start button below would just re-expand the
                      same view, so we suppress them on this slot only — but ONLY
                      when the Reflection Corner is actually rendered. Outside
                      its temporal window (18–22 local) we keep the regular
                      practice card so the substitute "Sleep Prep & Tomorrow
                      Framing" still has a Start affordance. */}
                  {(() => {
                    const isReflectionPractice = module.title === 'Tiny Win and Reflection'
                      || module.type === 'integrate';
                    if (!isReflectionPractice) return true;
                    const hour = new Date().getHours();
                    const reflectionShown = hour >= 18 && hour < 23;
                    return !reflectionShown;
                  })() && (
                  <>
                  {/* Practice cards — horizontal scroll when multiple */}
                  <div className={cn(
                    hasMultiple ? "flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory" : ""
                  )}>
                    {slotPractices.map((practice, pIdx) => {
                      const isPracticeCompleted = completedPracticeIds.includes(practice.contentId);
                      const isCoach = practice.isCoachCard;

                      return (
                        <div
                          key={practice.contentId}
                          onClick={() => !isPracticeCompleted && navigateToPractice(practice, slotPractices)}
                          className={cn(
                            "relative flex rounded-xl overflow-hidden h-36 cursor-pointer transition-all duration-300 snap-start",
                            "shadow-[0_4px_16px_rgba(0,0,0,0.08)]",
                            "bg-white/15 backdrop-blur-md border border-white/40",
                            "hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-0.5",
                            hm.showNavyBorder && pIdx === 0 && "border-l-2 border-l-foreground",
                            isPracticeCompleted && "opacity-40 sepia-[0.3] saturate-50",
                            hasMultiple ? "w-[80%] md:w-[70%] flex-shrink-0" : "w-full"
                          )}
                        >
                          {/* Thumbnail */}
                          {isCoach ? (
                            <div className="w-16 md:w-20 h-full flex-shrink-0 relative overflow-hidden">
                              <img src={coachVisual} alt="" className="w-full h-full object-cover object-top brightness-75" />
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/30" />
                              <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-2xl font-headline text-white tracking-tight leading-none drop-shadow-lg">SM</span>
                                <span className="text-[8px] uppercase tracking-[0.15em] text-white/80 mt-0.5">Coach</span>
                              </div>
                            </div>
                          ) : (
                            <img
                              src={practice.thumbnailUrl || getContentById(practice.contentId)?.thumbnail || ''}
                              alt={practice.title}
                              className="w-16 md:w-20 h-full object-cover flex-shrink-0"
                            />
                          )}

                          {/* Content */}
                          <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                            {/* Step indicator for multi-practice */}
                            {hasMultiple && (
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-body mb-0.5">
                                Step {pIdx + 1} of {slotPractices.length}
                              </span>
                            )}
                            <div className="flex items-start gap-1">
                              <h4 className="text-[13px] font-semibold line-clamp-2 leading-tight font-body flex-1 text-foreground">
                                {practice.title}
                              </h4>
                              {isPracticeCompleted && <Check size={14} className="text-taupe flex-shrink-0 mt-0.5 stroke-[3]" />}
                              {!isCoach && !isPracticeCompleted && isFavorite(practice.contentId) && (
                                <Heart size={14} className="text-saffron fill-saffron flex-shrink-0 mt-0.5" />
                              )}
                            </div>
                            <span className="text-[11px] text-muted-foreground font-body mt-0.5">
                              {practice.duration} min
                            </span>
            {/* Per-practice reasoning */}
                            {(hm.stepRationale?.[pIdx] || practice.reasoning) && (
                              <p className="text-[11px] text-muted-foreground/85 font-body mt-1 line-clamp-3 leading-snug">
                                {hm.stepRationale?.[pIdx] || practice.reasoning}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Start button — navigates to first uncompleted practice */}
                  <Button
                    onClick={() => {
                      const nextPractice = slotPractices.find(p => !completedPracticeIds.includes(p.contentId)) || slotPractices[0];
                      navigateToPractice(nextPractice, slotPractices);
                    }}
                    className="w-full h-11 text-[14px] font-medium bg-taupe text-white hover:bg-taupe/90 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
                  >
                    {hasMultiple && slotCompletedCount > 0 ? `Continue (${slotCompletedCount}/${slotPractices.length})` : 'Start'}
                  </Button>
                  </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Per-priority feedback modal */}
      {feedbackSlot && (
        <PlanFeedbackModal
          planType="tod"
          priorityNumber={feedbackSlot.index + 1}
          priorityLabel={`Priority ${feedbackSlot.index + 1}`}
          onSubmit={(rating, feedback) => {
            submitPlanFeedback('tod', rating, feedback);
            // §17.4 bridge — post-plan thumbs-up/down on a JIT-bound slot
            // teaches the ranker which event types matter. Thumbs-up always
            // boosts; thumbs-down only writes a demote when the free-text
            // explicitly says the event itself was wrong (heuristic keeps
            // practice-quality feedback out of the event-priority memory).
            try {
              const slotIdx = feedbackSlot.index;
              const hm: any = plan?.horizonModules?.[slotIdx];
              const slotEventTitle: string | null = hm?.isJit
                ? (hm?.jitEventTitle ?? null)
                : null;
              if (slotEventTitle) {
                let signal: 'priority' | 'cancelled_as_noise' | null = null;
                if (rating === 5) signal = 'priority';
                else if (
                  rating === 1 &&
                  typeof feedback === 'string' &&
                  /wrong event|not relevant|doesn'?t apply|don'?t need/i.test(feedback)
                ) {
                  signal = 'cancelled_as_noise';
                }
                if (signal) {
                  (async () => {
                    try {
                      const headers: Record<string, string> = {};
                      const token = await getAuthToken();
                      if (token) headers["Authorization"] = `Bearer ${token}`;
                      if (DEV_MODE) headers["x-dev-user-id"] = DEV_USER.id;
                      await supabase.functions.invoke("record-event-priority-signal", {
                        headers,
                        body: {
                          eventTitle: slotEventTitle,
                          signal,
                          source: "post_plan_feedback",
                          meta: {
                            rating,
                            feedbackText: feedback ?? null,
                            slotIndex: slotIdx,
                          },
                        },
                      });
                    } catch (e) {
                      console.warn("[TodayThreePriorities] post-plan priority-memory write failed", e);
                    }
                  })();
                }
              }
            } catch (e) {
              console.warn("[TodayThreePriorities] post-plan bridge threw", e);
            }
            setFeedbackSlot(null);
          }}
          onSkip={() => setFeedbackSlot(null)}
        />
      )}

      {/* Phase 1: cancel-priority feedback (glass, "Not Relevant Now/Ever") */}
      {pendingCancel && (
        <SlotCancelFeedbackModal
          priorityNumber={pendingCancel.index + 1}
          slotTitle={pendingCancel.title}
          onSubmit={async (reason, feedback) => {
            // Optimistic cancel: flip the slot locally and close the modal
            // immediately so the user sees the compressed cancelled card
            // + Undo straight away. Persistence and feedback writes happen
            // in the background. On ledger persistence failure we roll the
            // local slot back and notify via toast. We do NOT regenerate
            // the plan — that's what was causing the 90s delay.
            const cancelIndex = pendingCancel.index;
            const cancelTitle = pendingCancel.title;
            const cancelEventTitle = pendingCancel.eventTitle ?? null;
            setPendingCancel(null);
            setPlan((prev) => {
              if (!prev?.horizonModules) return prev;
              const next = { ...prev, horizonModules: prev.horizonModules.map((m, i) =>
                i === cancelIndex ? { ...m, isCancelled: true, cancelReason: reason, replacementEventIds: [] } : m,
              ) } as MasteryPlanResponse;
              try {
                const ttl = msUntilWindowEnd();
                const today = localISODate();
                const period = getCurrentTimeWindow();
                writePersistent(cacheKeys.planData(today, period), next, ttl);
                // Issue 1: mirror to localStorage so refresh survives even if
                // the background DB write hasn't landed yet.
                patchPlanSlotEdit(today, period, cancelIndex, {
                  cancelled: true,
                  cancelReason: reason,
                  replacementEventIds: [],
                });
              } catch { /* ignore */ }
              return next;
            });
            // Background persistence — do not block UI.
            (async () => {
              pendingPersistRef.current += 1;
              const saved = await persistPlanLedgerEdit(
                cancelIndex,
                {
                  cancelled: true,
                  cancelReason: reason,
                  replacementEventIds: [],
                },
                getCurrentTimeWindow(),
              );
              pendingPersistRef.current = Math.max(0, pendingPersistRef.current - 1);
              if (!saved) {
                // Roll back optimistic state.
                setPlan((prev) => {
                  if (!prev?.horizonModules) return prev;
                  return { ...prev, horizonModules: prev.horizonModules.map((m, i) =>
                    i === cancelIndex ? { ...m, isCancelled: false, cancelReason: null } : m,
                  ) } as MasteryPlanResponse;
                });
                try { clearPlanSlotEdit(localISODate(), getCurrentTimeWindow(), cancelIndex); } catch { /* ignore */ }
                toast({ title: 'Could not save this cancel', description: 'Please try again.', variant: 'destructive' });
                return;
              }
              // Fire-and-forget feedback write (does not gate the UI).
              submitPlanSlotCancelFeedback({
                slotIndex: cancelIndex,
                slotTitle: cancelTitle,
                cancelReason: reason === 'never' ? 'ever' : 'now',
                feedbackText: feedback,
                sessionPeriod: getCurrentTimeWindow(),
              }).catch(() => { /* silent */ });
              // §17.5 bridge: when the cancelled slot is JIT-bound to a real
              // calendar event, also record the priority-memory signal so
              // future Plan + Week-Ahead rankings learn from this cancel.
              if (cancelEventTitle) {
                (async () => {
                  try {
                    const headers: Record<string, string> = {};
                    const token = await getAuthToken();
                    if (token) headers["Authorization"] = `Bearer ${token}`;
                    if (DEV_MODE) headers["x-dev-user-id"] = DEV_USER.id;
                    await supabase.functions.invoke("record-event-priority-signal", {
                      headers,
                      body: {
                        eventTitle: cancelEventTitle,
                        signal: reason === "never" ? "never" : "cancelled_now",
                        source: "cancel_feedback",
                        meta: { slotTitle: cancelTitle, feedbackText: feedback ?? null },
                      },
                    });
                  } catch (e) {
                    console.warn("[TodayThreePriorities] record-event-priority-signal failed", e);
                  }
                })();
              }
            })();
          }}
          onSkip={() => setPendingCancel(null)}
        />
      )}

      {/* Phase 2: replacement picker is rendered inline within the priorities list above. */}
    </div>
  );
};

export default TodayThreePriorities;
