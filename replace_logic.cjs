const fs = require('fs');
const path = './supabase/functions/generate-mastery-plan/index.ts';
let content = fs.readFileSync(path, 'utf8');

const startMarker = '  let topEvent: ScoredEvent | null = null;';
const endMarker = '  return {\n    timeOfDayPlan: {';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error('Markers not found');
  process.exit(1);
}

const newLogic = `  const { maxDuration, maxModules } = getDurationCeiling(req.calendarLoad);
  const baseMapping = getModulesFromTheme(req.outerReadinessPhrase);
  const calendarContext = calculateCalendarContext(
    rawCalendarEvents,
    timeOfDay,
  );
  const moduleMapping = applyCalendarOverrides(
    baseMapping,
    calendarContext,
    timeOfDay,
    req.innerReadinessTier,
  );
  const resolvedModuleTypes = Object.entries(moduleMapping)
    .filter(([_, spec]) => spec)
    .map(([type, spec]) => ({ type, focus: (spec as any).focus }));

  const planBrief = generatePlanBrief(
    calendarContext,
    timeOfDay,
    req.innerReadinessTier,
    req.innerReadinessScore,
    req.checkInOutcome,
    req.calendarLoad,
    req.wearableContext,
    req.outerReadinessPhrase,
    req.outerReadinessContext,
    req.outerReadinessLeanOn,
    req.coachInsights,
    resolvedModuleTypes,
    combinedAlreadyUsed,
    null,
    null,
    pendingCommitments,
    shared.calendarGaps,
  );

  let planAvailabilityMeta: any = null;
  try {
    const _events = Array.isArray(req.calendarEvents) ? req.calendarEvents : [];
    const _avail = classifyAvailability({
      now: new Date(),
      userHomeCountry: (req as any).userHomeCountry ?? null,
      userCurrentCountry: (req as any).userCurrentCountry ?? null,
      explicitPto: (req as any).explicitPto === true,
      calendarLoad: ((req as any).calendarLoad as any) ?? null,
      weekendDays: (req as any).userLocale?.weekendDays ?? [6],
      events: _events.map((e: any) => ({
        title: String(e?.title || ""),
        startTime: String(e?.startTime || e?.start_time || ""),
        endTime: String(e?.endTime || e?.end_time || e?.startTime || ""),
        isAllDay: e?.isAllDay === true || e?.is_all_day === true,
        isOrganizer: e?.isOrganizer === true || e?.is_organizer === true,
        attendeesCount: Number(e?.attendeesCount ?? e?.attendees_count ?? 0) || 0,
        source: e?.source ?? e?.calendarName ?? null,
        calendarSummary: e?.calendarSummary ?? e?.calendar_summary ?? null,
      })),
    });
    planAvailabilityMeta = {
      state: _avail.state,
      reason: _avail.reason,
      isRestDay: _avail.isRestDay,
      meetingCount: _avail.workEvidence.meetingCount,
      holiday: {
        detected: _avail.holiday.detected,
        applicable: _avail.holiday.applicable,
        title: _avail.holiday.title,
        scope: _avail.holiday.scope,
      },
    };
  } catch (availErr: any) {
    console.warn("[generate-mastery-plan][availability-meta-failed]", availErr?.message ?? String(availErr));
  }

  const allocation = allocatePlanSlots({
    nowMs: Date.now(),
    rankedCandidates: jitRankedCandidates,
    mrsWindow: timeOfDay as "morning" | "afternoon" | "evening",
    preferredPracticeWindows: (req as any).preferredPracticeWindows ?? [],
    forceArcCategoryIds: Array.from(forceArcCategoryIds),
    ...deriveStructuralDayFlags(req.calendarEvents, (req as any).calendarLoad, {
      now: new Date(Date.now() - ((req as any).timezoneOffset ?? 0) * 60000),
      userHomeCountry: (req as any).userHomeCountry ?? null,
      userCurrentCountry: (req as any).userCurrentCountry ?? null,
      explicitPto: (req as any).explicitPto === true,
      weekAheadOverride: (req as any).weekAheadOverride === true,
    }),
  });

  const planDayShape = allocation.dayShape;
  const planIsRestDay = allocation.restDay === true || allocation.dayShape === "rest_day";

  let horizonModules: any[] = [];
  if (!planIsRestDay) {
    const seenContentIds = new Set<string>();
    for (const slot of allocation.slots) {
      const ceoVerb = slot.jitCategoryId && slot.jitPhase ? verbForCategoryPhase(slot.jitCategoryId, slot.jitPhase) : null;
      const stateAction = executiveObjectiveFor(req.practicePriorityTag, slot.jitCategoryId, slot.jitPhase ?? "pre");
      
      const intent = deriveSlotIntent({
        stateAction,
        ceoVerb,
        anchorCategory: slot.jitCategoryId,
        anchorPhase: slot.jitPhase,
        practicePriorityTag: req.practicePriorityTag,
      });

      const { selected } = selectPracticeForSlot(
        enrichedContent,
        slot,
        intent,
        seenContentIds,
        {
          recentPracticeDays: (req as any).recentPracticeDays || {},
          mrsScore: req.innerReadinessScore,
          leaderGoals: (req as any).leaderProfile?.goals?.declared ?? [],
          preferredPracticeWindows: (req as any).preferredPracticeWindows ?? [],
          currentWindow: timeOfDay,
        }
      );

      const practice = selected[0];
      if (practice) {
        seenContentIds.add(practice.id);
      }

      const timeLabel = buildPriorityTitle({
        slotAnchor: {
          eventTitle: slot.jitEventTitle,
          categoryId: slot.jitCategoryId,
          phase: slot.jitPhase,
        },
        isTomorrow: false,
        practicePriorityTag: req.practicePriorityTag,
      });

      const hm: any = {
        horizon: "immediate",
        timeLabel,
        typeLabel: practice ? \`REGULATE · \${practice.content_type}\` : "REGULATE · Protocol",
        whyLine: "",
        recommendedAction: "",
        practice: practice ? {
          type: "regulate",
          contentId: practice.id,
          title: practice.title,
          contentType: practice.content_type,
          duration: practice.duration || 3,
          focus: "composure",
          intensity: "gentle",
          isFavorite: req.favorites.includes(practice.id),
          isCoachCard: false,
          reasoning: "",
          thumbnailUrl: practice.thumbnail_url,
        } : null,
        practices: practice ? [{
          type: "regulate",
          contentId: practice.id,
          title: practice.title,
          contentType: practice.content_type,
          duration: practice.duration || 3,
          focus: "composure",
          intensity: "gentle",
          isFavorite: req.favorites.includes(practice.id),
          isCoachCard: false,
          reasoning: "",
          thumbnailUrl: practice.thumbnail_url,
        }] : [],
        isJit: slot.jitEventId != null,
        jitEventTitle: slot.jitEventTitle,
        jitMinutesUntil: null,
        showNavyBorder: false,
        showPulse: false,
        showPriorityPill: false,
        anchorEventId: slot.jitEventId,
        anchorCategoryId: slot.jitCategoryId,
        anchorSubtypeId: null,
        anchorScenarioId: null,
        anchorLeadTimeMin: null,
        mode: allocation.mode,
        dayShape: allocation.dayShape,
        slotAllocationDebug: allocation.debug,
        slotRole: slot.slotRole,
        allocationReason: slot.allocationReason,
        arcLabel: slot.arcLabel,
        jitPhase: slot.jitPhase,
      };

      horizonModules.push(hm);
    }
  }

  let finalHorizonModules = horizonModules;
  let ledgerMeta: any = { source: "fresh", carriedSlots: 0, anchoredSlots: 0, completedSlots: 0 };
  let ledger: any = null;
  try {
    ledger = await loadTodayPlanLedger(req.userId, today, supabaseClient);
    const calendarEventIds = new Set<string>((req.calendarEvents || []).map((e: any) => String(e.id)).filter(Boolean));
    const nowForLedger = Date.now();
    const LEDGER_STALE_GRACE_MS = 30 * 60_000;
    const currentWindowEventTitles = new Set<string>(
      (req.calendarEvents || [])
        .filter((e: any) => {
          const endMs = e.end_time ? new Date(e.end_time).getTime() : (e.start_time ? new Date(e.start_time).getTime() + 60 * 60_000 : Infinity);
          return endMs > nowForLedger - LEDGER_STALE_GRACE_MS;
        })
        .map((e: any) => String(e.title || "").trim())
        .filter(Boolean),
    );
    const calendarEventTitleById = new Map<string, string>(
      (req.calendarEvents || [])
        .map((e: any): [string, string] => [String(e.id), String(e.title || "").trim()])
        .filter(([id, title]) => Boolean(id) && Boolean(title)),
    );

    const merged = mergeWithLedger(
      horizonModules,
      ledger?.modules || [],
      new Set<string>(req.completedToday || []),
      calendarEventIds,
      currentWindowEventTitles,
      ledger?.userEdits,
      calendarEventTitleById,
      {
        nowMs: nowForLedger,
        rankedCandidates: jitRankedCandidates,
        currentPeriod: timeOfDay,
        ledgerGeneratedPeriod: (ledger?.generatedPeriod === "morning" || ledger?.generatedPeriod === "afternoon" || ledger?.generatedPeriod === "evening") ? ledger.generatedPeriod : null,
        mrsWindow: timeOfDay as "morning" | "afternoon" | "evening",
        preferredPracticeWindows: req.preferredPracticeWindows ?? [],
        forceArcCategoryIds: Array.from(forceArcCategoryIds),
        ...deriveStructuralDayFlags(req.calendarEvents, (req as any).calendarLoad, {
          now: new Date(Date.now() - ((req as any).timezoneOffset ?? 0) * 60000),
          userHomeCountry: (req as any).userHomeCountry ?? null,
          userCurrentCountry: (req as any).userCurrentCountry ?? null,
          explicitPto: (req as any).explicitPto === true,
          weekAheadOverride: (req as any).weekAheadOverride === true,
        }),
      },
    );
    finalHorizonModules = merged.modules;
    ledgerMeta = {
      source: merged.source,
      carriedSlots: merged.carriedSlots,
      anchoredSlots: merged.anchoredSlots,
      completedSlots: merged.completedSlots,
      victoryLine: merged.victoryLine,
    };
    finalHorizonModules = applyLedgerEditsToModules(finalHorizonModules, ledger?.userEdits);
  } catch (ledgerErr) {
    console.warn("[generate-mastery-plan] ledger merge failed:", ledgerErr);
  }

  try {
    finalHorizonModules = await applyV51Enrichment(
      finalHorizonModules,
      req,
      shared,
      hrvCorrelations,
      outerReadinessCache,
      timeOfDay,
    );
  } catch (enrichErr: any) {
    console.warn("[generate-mastery-plan] v5.1 enrichment failed:", enrichErr?.message);
  }

  if (req.slotReplacements && Object.keys(req.slotReplacements).length > 0 && !planIsRestDay) {
    for (const [slotIdxStr, replacement] of Object.entries(req.slotReplacements)) {
      const idx = Number(slotIdxStr);
      if (!Number.isInteger(idx) || idx < 0 || idx >= finalHorizonModules.length) continue;
      const eventId = replacement.eventId;
      const freshMatch = horizonModules.find((m: any) => m.anchorEventId === eventId) || horizonModules.find((m: any) => m.replacementEventIds?.includes(eventId));
      const prior = finalHorizonModules[idx];
      if (freshMatch) {
        finalHorizonModules[idx] = {
          ...freshMatch,
          priorityTag: prior?.priorityTag ?? null,
          relationshipTag: prior?.relationshipTag ?? null,
          customTags: prior?.customTags ?? [],
        };
      }
    }
  }

  try {
    for (const m of finalHorizonModules) {
      const anyM = m as any;
      const title = typeof anyM.jitEventTitle === "string" ? anyM.jitEventTitle.trim() : "";
      if (!title) continue;
      const en = enrichEvent({ title });
      const anchorEventId = typeof anyM.anchorEventId === "string" ? anyM.anchorEventId : null;
      const persistedSub = priorityMemoryIndex ? getSubcategoryForEvent(priorityMemoryIndex, anchorEventId) : null;
      if (anyM.anchorSubcategory == null && (persistedSub || en.subcategory)) {
        anyM.anchorSubcategory = persistedSub ?? en.subcategory;
      }
      if (anyM.anchorCategoryId == null && en.categoryId) {
        anyM.anchorCategoryId = en.categoryId;
      }
    }
    const planLedger = {
      modules: finalHorizonModules,
      generatedAt: new Date().toISOString(),
      generatedPeriod: timeOfDay,
      source: ledgerMeta.source,
      userEdits: ledger?.userEdits || undefined,
    };
    await supabaseClient.from("daily_ritual_completions").upsert(
      { user_id: req.userId, ritual_date: today, session_period: timeOfDay, plan_ledger: planLedger },
      { onConflict: "user_id,ritual_date,session_period" },
    );
  } catch (persistErr) {
    console.warn("[generate-mastery-plan] ledger persist failed:", persistErr);
  }

  const periodLabels: Record<string, string> = {
    morning: "Morning Practice",
    afternoon: "Afternoon Reset",
    evening: "Evening Close",
  };

`;

content = content.substring(0, startIndex) + newLogic + content.substring(endIndex);
fs.writeFileSync(path, content);
console.log('Replaced logic successfully');
