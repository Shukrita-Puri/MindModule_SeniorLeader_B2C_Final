const fs = require('fs');
const file = 'supabase/functions/_shared/brief/deterministic-brief.ts';
let code = fs.readFileSync(file, 'utf8');

// Replace shortRefImpl
const shortRefImplMatch = /function shortRefImpl\(title: string\): string \{[\s\S]*?\n\}/;
code = code.replace(shortRefImplMatch, `function shortRefImpl(title: string): string {
  const clean = title.replace(/^\\d{1,2}:\\d{2}\\s+/, "").trim();
  if (/board|governance/i.test(clean)) return "the board call";
  if (/strategy|5.year|planning|deep work/i.test(clean)) return "the strategy session";
  if (/investor|pitch/i.test(clean)) return "the investor call";
  if (/keynote|speaking|media|press/i.test(clean)) return "the keynote";
  if (/all.?hands|town.?hall/i.test(clean)) return "the all-hands";
  if (/conference|summit/i.test(clean)) return "the conference";
  if (/feedback|difficult/i.test(clean)) return "the difficult conversation";
  if (/1.?1|one.?to.?one/i.test(clean)) return "the 1:1";

  // ── NEW: travel / flight detection ──
  if (/\\b(flight|fly|flying|plane|airport|departing|boarding|long[- ]?haul|red[- ]?eye)\\b/i.test(clean)) {
    return "the flight";
  }
  // Flight number pattern: BA 183, UA 456, QR 007 etc.
  if (/\\b[A-Z]{2}\\s*\\d{2,4}\\b/.test(clean)) return "the flight";

  return clean.length <= 25
    ? \`the \${clean.toLowerCase()}\`
    : \`the \${clean.slice(0, 22).toLowerCase()}...\`;
}`);

// Replace buildRead top block
const buildReadMatch = /function buildRead\(opts: DeterministicBriefFallbackOpts\): string \{\n\s*const hasHighStakes = opts\.todayHighStakes\.length > 0;/;
code = code.replace(buildReadMatch, `function buildRead(opts: DeterministicBriefFallbackOpts): string {
  // ── Travel-aware reads — run before all pillar reads ──
  const shape = opts.dayShape ?? null;
  const phase = opts.travelPhase ?? null;

  if (shape === "work_travel") {
    if (phase === "pre") {
      return opts.longHaulFlight
        ? "Long-haul compounds everything — timezone, logistics, and decision load on the other side. That cost starts now."
        : "The flight changes the frame for the day. What you protect now is what you arrive with.";
    }
    if (phase === "in_transit") {
      return "The journey is already taking its toll. Arriving intact is the only metric that matters right now.";
    }
    if (phase === "post") {
      return "The trip left more lag than it looks. The body is still catching up even when the diary has moved on.";
    }
    return "Travel is the real load today — the work commitment after it amplifies that.";
  }

  if (shape === "personal_travel") {
    return "The journey draws on the same system that runs the working week. Let it be the day's only demand.";
  }

  if (shape === "conference") {
    const anyStrained = ["amber", "red"].includes(opts.cognitivePillTier) ||
                        ["amber", "red"].includes(opts.physicalPillTier);
    return anyStrained
      ? "Sustained attention across sessions is the load — the body is carrying it."
      : "Conference days ask for sustained presence, not peak output. Pace accordingly.";
  }

  const hasHighStakes = opts.todayHighStakes.length > 0;`);

// Replace buildDirective
const buildDirectiveMatch = /function buildDirective\(opts: DeterministicBriefFallbackOpts\): string \{[\s\S]*?\n\}/;
code = code.replace(buildDirectiveMatch, `function buildDirective(opts: DeterministicBriefFallbackOpts): string {
  // ── DAY SHAPE ROUTING — always runs first.
  // Uses opts.dayShape when available (passed from briefDayShape in the
  // caller). Falls back to opts.isWeekend / opts.isNonWorkday for back-compat.
  // This is the only place that distinguishes work_travel (Sunday flight +
  // Monday meetings) from a plain weekend — without dayShape the two are
  // indistinguishable because isWeekend is true for both.

  const shape = opts.dayShape ?? null;
  const phase = opts.travelPhase ?? null;
  const tiers = [opts.cognitivePillTier, opts.physicalPillTier];
  const anyStrained = tiers.some((t) => t === "amber" || t === "red");
  const lowBand = opts.band === "stretched" || opts.band === "depleted";
  const allGreen = tiers.every((t) => t === "green");

  // ── WORK TRAVEL (flight + work commitment at destination) ──
  if (shape === "work_travel") {
    if (phase === "pre") {
      if (anyStrained || lowBand) {
        return "The journey will cost more than the timetable shows. Protect what's there before it spends what's left";
      }
      if (opts.longHaulFlight) {
        return "Long-haul takes more than it looks — bank what you have before boarding. The work on the other side needs you intact";
      }
      return "Protect what you have before the journey spends it. Arrive in the condition the next thing needs";
    }
    if (phase === "in_transit") {
      return "The transit has already taken something. Arrive intact before thinking about what comes next";
    }
    if (phase === "post") {
      return "The trip left a lag — sequence the first work block against it, not through it. Re-entry costs more than it looks";
    }
    return "Travel is the real cost today. Protect the state before the work starts";
  }

  // ── PERSONAL TRAVEL (no work commitment after landing) ──
  if (shape === "personal_travel") {
    return "The journey is the day. Arriving whole is the outcome — let the trip be what it is";
  }

  // ── CONFERENCE (sustained attention load across sessions) ──
  if (shape === "conference") {
    const dayRef = typeof opts.conferenceDayNumber === "number"
      ? \`Day \${opts.conferenceDayNumber}\`
      : "Today";
    if (anyStrained || lowBand) {
      return \`\${dayRef}: sustain presence in the sessions that earn it. The accumulated load is real — let the rest pass through\`;
    }
    return \`\${dayRef}: sustain presence across the sessions that earn it. Let the others pass through you\`;
  }

  // ── PUBLIC HOLIDAY / PTO / PERSONAL HOLIDAY ──
  if (
    shape === "public_holiday" || shape === "pto" ||
    shape === "personal_holiday" || opts.isNonWorkday
  ) {
    if (anyStrained || lowBand) {
      return "The system needs this day to actually recover — not half-work it. Let today be what it is";
    }
    return "Reserves are holding. Protect them rather than spending them. A little forward thinking is fine";
  }

  // ── WEEKEND (non-workday, no travel commitment) ──
  if (opts.isWeekend || shape === "weekend") {
    if (anyStrained || lowBand) {
      return "The system is still paying down from the week. Let today actually recover — that is the productive move";
    }
    if (allGreen || opts.band === "firing" || opts.band === "sharp") {
      return "Reserves are holding — protect them. A small amount of forward thinking is fine; reactive output is not what today is for";
    }
    return "Keep the pace light. The week ahead will ask for what today preserves";
  }

  // ── WORKDAY — pillar-based routing (unchanged from current code) ──
  const hasHighStakes = opts.todayHighStakes.length > 0;
  const hasManyHighStakes = opts.todayHighStakes.length >= 2;
  const drainedIntoHighStakes =
    opts.checkInOutcome === "drained" && hasHighStakes;
  const lowSleepIntoHighStakes =
    opts.sleepScore !== null && opts.sleepScore < 65 && hasHighStakes;

  if (drainedIntoHighStakes) {
    return hasManyHighStakes
      ? "Set the intention before each room; conserve the edge for where decisions land"
      : \`Protect the edge before \${shortRef(opts.todayHighStakes[0])}; trim what's peripheral and enter with what is there intact\`;
  }
  if (lowSleepIntoHighStakes) {
    return \`Protect the first thinking window before \${shortRef(opts.todayHighStakes[0])} rather than generating in the room\`;
  }
  if (opts.cognitivePillTier === "green" && opts.physicalPillTier !== "green") {
    return hasHighStakes
      ? \`Front-load the decision and analysis work before \${shortRef(opts.todayHighStakes[0])}; let the presence work ride on physical steadiness\`
      : "Use the window for decisions and analysis, keep the relational work short";
  }
  if (opts.physicalPillTier === "green" && opts.cognitivePillTier !== "green") {
    return "Route the presence and stakeholder conversations through the physical runway; defer anything needing full processing";
  }
  if (opts.cognitivePillTier === "green" && opts.physicalPillTier === "green") {
    if (hasHighStakes) {
      return \`Open with \${shortRef(opts.todayHighStakes[0])} while both pillars are clear\`;
    }
    return "Use this for the one decision or analysis that compounds most and protect the most important block";
  }
  if (opts.band === "depleted" || opts.band === "stretched") {
    return "Pick the one priority that cannot wait and do only that";
  }
  return "Use this for the one decision or analysis that compounds most and protect the most important block";
}`);

// Replace closeFor
const closeForMatch = /function closeFor\(opts: DeterministicBriefFallbackOpts\): string \{[\s\S]*?\n\}/;
code = code.replace(closeForMatch, `function closeFor(opts: DeterministicBriefFallbackOpts): string {
  const shape = opts.dayShape ?? null;
  const phase = opts.travelPhase ?? null;

  // ── Travel closes — oriented toward arrival or re-entry ──
  if (shape === "work_travel") {
    if (phase === "pre")        return "and arrive with something in the tank.";
    if (phase === "in_transit") return "and land in the condition the next thing needs.";
    if (phase === "post")       return "and let the system settle before pushing.";
    return "and arrive intact.";
  }
  if (shape === "personal_travel") {
    return "and let the trip actually land.";
  }

  // ── Conference close ──
  if (shape === "conference") {
    return opts.band === "depleted" || opts.band === "stretched"
      ? "and protect what's left for the sessions that matter."
      : "and protect the state for what tomorrow opens with.";
  }

  // ── Non-workday close (holiday / PTO) ──
  if (shape === "public_holiday" || shape === "pto" ||
      shape === "personal_holiday" || opts.isNonWorkday) {
    return "and let the return start with something in the tank.";
  }

  // ── Weekend close (existing strings — unchanged) ──
  if (opts.isWeekend || shape === "weekend") {
    if (opts.band === "firing" || opts.band === "sharp") {
      return "and make sure today genuinely recovers, not just overflows.";
    }
    if (opts.band === "depleted") {
      return "and protect tomorrow's start — that's what today is for.";
    }
    return "and let this window close so the week starts clean.";
  }

  // ── Workday close (existing logic — unchanged) ──
  if (
    opts.window === "evening" &&
    (opts.band === "steady" || opts.band === "stretched" || opts.band === "depleted")
  ) {
    return "and close the laptop so tomorrow doesn't start in residue.";
  }
  const map: Record<DeterministicBriefBand, string> = {
    firing:    "and don't overextend.",
    sharp:     "and don't let the smaller calls chip at what's there.",
    steady:    "and hold the line.",
    stretched: "and protect the close.",
    depleted:  "and shut the laptop early.",
  };
  return map[opts.band];
}`);

fs.writeFileSync(file, code);
