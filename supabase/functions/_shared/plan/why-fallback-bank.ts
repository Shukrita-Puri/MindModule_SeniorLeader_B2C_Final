// OWNERSHIP: coaching (copy), engineering (selection).
//
// why-fallback-bank.ts — deterministic Why-line bank keyed to A–H event
// category × arc position (pre / during / post) × proactive role.
//
// WHY THIS EXISTS
// The Why LLM can fail (timeout, contract rejection, empty key) and the
// evidence composer can come back with nothing when a user is cold-start.
// Before this bank the three slots then fell through to the SAME generic
// sentence, which is what shipped on the 31 Aug screenshots. Every slot must
// carry a why-line that names the arc position and the executive stake, and
// no two slots in one day may repeat the same line.
//
// Rules:
// - No biometrics here. Biometric claims belong to the evidence bundle; this
//   bank is the floor that runs when there is no evidence to speak from.
// - Chief-of-Staff register: factual, forward-looking, no wellness tropes.
// - Every A–H × phase × role combination resolves. There is no undefined.

import type { EventCategoryId } from "../events/event-categories.ts";
import type { Phase } from "../events/event-phase-map.ts";

/** Proactive roles as derived by `why-signals.ts#roleFromValence`. */
export type ProactiveRole = "Protect" | "Prevent" | "Prepare" | "Build";

type PhaseBank = Partial<Record<Phase, string[]>>;
type RoleBank = Partial<Record<ProactiveRole, PhaseBank>>;

/**
 * Per-category copy. `pre` = before the event, `during` = inside it,
 * `post` = the recovery/close side of the arc. Two variants per cell so a
 * day with two slots on the same category still reads differently.
 */
const BANK: Record<EventCategoryId, RoleBank> = {
  // A — Board / investor / governance
  A: {
    Prepare: {
      pre: [
        "Board rooms reward the version of you that arrives already composed.",
        "The first two minutes in front of the board set how the rest lands.",
      ],
      during: [
        "Hold the room at your own pace rather than the agenda's.",
        "Governance sessions drift; your job is to stay the steady signal.",
      ],
      post: [
        "Close the loop while the detail is still sharp, then step out of it.",
        "The session is done — carrying it into the evening costs you twice.",
      ],
    },
    Prevent: {
      pre: [
        "High-scrutiny rooms punish a rushed entrance more than a weak slide.",
        "Walk in unsettled and the board reads the state, not the numbers.",
      ],
      during: [
        "Scrutiny narrows attention — widen it before you answer.",
        "Pressure in the room turns into pace; slow the delivery deliberately.",
      ],
      post: [
        "Post-board adrenaline is the most expensive hour of your week.",
        "The replay loop after governance sessions is where the evening goes.",
      ],
    },
    Protect: {
      pre: [
        "You arrive at this one in good shape — keep it that way.",
        "The state you have going into the board is worth defending.",
      ],
      during: ["Keep the composure you walked in with."],
      post: ["Bank the session, then hand the day back to yourself."],
    },
    Build: {
      pre: ["Board exposure compounds — treat this as practice, not a test."],
      during: ["Use the room to widen your range, not just survive it."],
      post: ["Capture what worked in there before the week overwrites it."],
    },
  },

  // B — External / client / partner
  B: {
    Prepare: {
      pre: [
        "Client rooms read presence before they read the proposal.",
        "Arrive with the outcome you want already clear in your own head.",
      ],
      during: [
        "Listen longer than feels comfortable — the room fills in the rest.",
        "Let the other side talk first; the negotiation follows attention.",
      ],
      post: [
        "Write the next step down before the context evaporates.",
        "Close the conversation properly so it doesn't run all evening.",
      ],
    },
    Prevent: {
      pre: [
        "Turning up hurried with an external party costs you the first ask.",
        "External rooms amplify whatever state you brought into them.",
      ],
      during: [
        "Push-back pulls people into speed; hold the slower line.",
        "Don't let the pace of the room set the pace of your thinking.",
      ],
      post: [
        "External calls leave residue — clear it before the next block.",
        "The unclosed client conversation is what keeps running at 9pm.",
      ],
    },
    Protect: {
      pre: ["You are in decent shape for this one — protect the margin."],
      during: ["Keep the composure the room is already giving you credit for."],
      post: ["Log the outcome and stop carrying the conversation."],
    },
    Build: {
      pre: ["Each external room is a rep in reading people faster."],
      during: ["Notice what shifts the room — that's the transferable skill."],
      post: ["Name one thing to run differently next time, then close it."],
    },
  },

  // C — Internal leadership / exec team
  C: {
    Prepare: {
      pre: [
        "Your team reads your state before they read the agenda.",
        "Leadership sessions inherit the tone of whoever opens them.",
      ],
      during: [
        "Give the room space; the useful disagreement arrives late.",
        "Your steadiness is the thing the team is actually calibrating on.",
      ],
      post: [
        "Decide what you owe the team in writing, then put it down.",
        "Leave the session where it happened rather than replaying it.",
      ],
    },
    Prevent: {
      pre: [
        "Walking into your own team unsettled sets the tone for the week.",
        "Tension you bring to a leadership room comes back multiplied.",
      ],
      during: [
        "When the room heats, your reaction is the one that gets copied.",
        "Emotional load in exec rooms leaks — hold the line consciously.",
      ],
      post: [
        "Team friction is the kind that follows you home. Close it here.",
        "The internal replay loop is the most common evening leak.",
      ],
    },
    Protect: {
      pre: ["You are steady going in — that's the asset in this room."],
      during: ["Keep the tone you set at the start."],
      post: ["Wrap it cleanly so the team isn't guessing tomorrow."],
    },
    Build: {
      pre: ["Every exec session is a rep in setting tone deliberately."],
      during: ["Watch which intervention actually moves the room."],
      post: ["Note what the team needed from you, then step out."],
    },
  },

  // D — Difficult conversations / conflict / performance
  D: {
    Prepare: {
      pre: [
        "Hard conversations go the way the first sentence goes.",
        "Get clear on the one outcome before you open your mouth.",
      ],
      during: [
        "Stay on the point; heat is not the same as progress.",
        "Slow answers land better than fast ones in this conversation.",
      ],
      post: [
        "Difficult conversations need a hard stop, not a slow fade.",
        "Decide what happens next, then let the conversation end.",
      ],
    },
    Prevent: {
      pre: [
        "Going in charged decides the conversation before it starts.",
        "The version of this that goes badly starts with your own state.",
      ],
      during: [
        "One reactive sentence undoes the whole conversation.",
        "Keep judgement in front of reaction while the room is hot.",
      ],
      post: [
        "This is the conversation that reruns all night if you let it.",
        "Conflict residue is the most expensive thing to carry forward.",
      ],
    },
    Protect: {
      pre: ["You are level going in — that's exactly what this needs."],
      during: ["Hold the level tone; it's doing the work."],
      post: ["Close it deliberately rather than letting it trail."],
    },
    Build: {
      pre: ["Hard conversations are a skill, and this is a rep."],
      during: ["Notice where you tighten — that's the thing to train."],
      post: ["Take one lesson, leave the rest of it in the room."],
    },
  },

  // E — Deep work / strategy / decisions
  E: {
    Prepare: {
      pre: [
        "Deep work only pays if you enter it already settled.",
        "Protect the first ten minutes and the block runs itself.",
      ],
      during: [
        "The block is worth what you keep out of it.",
        "One thread at a time — switching is what erodes this hour.",
      ],
      post: [
        "Mark where you stopped so the restart isn't a cold start.",
        "Close the thinking properly before the next thing lands.",
      ],
    },
    Prevent: {
      pre: [
        "Starting deep work on a fragmented mind burns the whole block.",
        "Unprepared focus blocks turn into expensive shallow ones.",
      ],
      during: [
        "Every interruption costs you more than the interruption.",
        "The pull to check something is what breaks this block.",
      ],
      post: [
        "Decision fatigue accumulates quietly. Reset before the next call.",
        "Coming out of deep work straight into people is where quality drops.",
      ],
    },
    Protect: {
      pre: ["Your head is clear enough for real work — protect the block."],
      during: ["Keep the block intact; it's earning."],
      post: ["Bank the progress and let the thinking settle."],
    },
    Build: {
      pre: ["Focus is trainable — this block is the training."],
      during: ["Hold attention slightly longer than comfortable."],
      post: ["Note what made this block work, then close it."],
    },
  },

  // F — Public / visibility / speaking
  F: {
    Prepare: {
      pre: [
        "Visibility rewards a settled body more than an extra rehearsal.",
        "The room reads how you enter before it hears what you say.",
      ],
      during: [
        "Slow the pace; audiences hear composure as authority.",
        "Speak to one person at a time and the room follows.",
      ],
      post: [
        "Come down deliberately — the high after visibility has a cost.",
        "Log the feedback while it's fresh, then step out of performance mode.",
      ],
    },
    Prevent: {
      pre: [
        "Nerves that go unmanaged show up in pace, not in content.",
        "Walking on unsettled is what makes a good talk sound rushed.",
      ],
      during: [
        "Adrenaline speeds you up; deliberately slow the delivery.",
        "Don't let the room's energy set your tempo.",
      ],
      post: [
        "Post-visibility comedown is real and it lands about an hour later.",
        "The replay after a public moment is what eats the rest of the day.",
      ],
    },
    Protect: {
      pre: ["You're in good shape for this — keep it steady."],
      during: ["Hold the tempo you started with."],
      post: ["Take the win, then step out of the spotlight properly."],
    },
    Build: {
      pre: ["Every public moment widens the range you can operate in."],
      during: ["Notice what the room responds to."],
      post: ["Keep one note for next time, then close it out."],
    },
  },

  // G — Travel
  G: {
    Prepare: {
      pre: [
        "Travel days go the way the first hour of them goes.",
        "Set the day up before the logistics start setting it for you.",
      ],
      during: [
        "Transit is dead time or recovery time — choose deliberately.",
        "The body keeps score of the move even when the schedule doesn't.",
      ],
      post: [
        "Land the day properly or the time-zone cost carries into tomorrow.",
        "Arrival is when the recovery decision actually gets made.",
      ],
    },
    Prevent: {
      pre: [
        "Travel compresses the day; unmanaged it compresses the thinking too.",
        "Rushing the departure is what makes the whole day feel behind.",
      ],
      during: [
        "Long transits erode attention quietly. Interrupt the drift.",
        "Movement without anchoring is how travel debt accumulates.",
      ],
      post: [
        "Time-zone debt compounds if the first evening is unmanaged.",
        "The day after travel is decided by how you close this one.",
      ],
    },
    Protect: {
      pre: ["You're holding up well through the move — keep that."],
      during: ["Protect the state you have while the day moves."],
      post: ["Settle the arrival so tomorrow starts clean."],
    },
    Build: {
      pre: ["Travel weeks are where routines prove they hold."],
      during: ["Keep one anchor intact through the move."],
      post: ["Reset the rhythm now rather than in three days."],
    },
  },

  // H — Routine / no anchoring event
  H: {
    Prepare: {
      pre: [
        "Quiet days are where the capacity for loud ones gets built.",
        "Nothing forcing your hand today — that makes the choice yours.",
      ],
      during: [
        "An unstructured stretch is only useful if you give it a shape.",
        "Use the open block deliberately rather than letting it drain.",
      ],
      post: [
        "Close the day on purpose so tomorrow doesn't inherit the drift.",
        "Ending well is the whole job on a day like this.",
      ],
    },
    Prevent: {
      pre: [
        "Open days drift by default — this is the block that anchors it.",
        "Low structure is where good weeks quietly come apart.",
      ],
      during: [
        "Without an anchor the day fills with other people's work.",
        "Drift is the risk today, not load.",
      ],
      post: [
        "Land the day rather than letting it trail into the evening.",
        "An unclosed quiet day still costs you tomorrow morning.",
      ],
    },
    Protect: {
      pre: ["You're in good shape — today is about keeping it."],
      during: ["Hold the rhythm you already have."],
      post: ["Close the day cleanly and keep the run going."],
    },
    Build: {
      pre: ["Light days are the cheapest place to build the habit."],
      during: ["This is base-building, not maintenance."],
      post: ["Consistency on the quiet days is what carries the hard ones."],
    },
  },
};

/** Role fallback order — always resolves to a populated cell. */
const ROLE_ORDER: ProactiveRole[] = ["Prevent", "Prepare", "Protect", "Build"];
const PHASE_ORDER: Phase[] = ["pre", "during", "post"];

function cell(
  category: EventCategoryId,
  role: ProactiveRole,
  phase: Phase,
): string[] {
  const roleBank = BANK[category] ?? BANK.H;
  const exact = roleBank[role]?.[phase];
  if (exact?.length) return exact;
  // Same role, another phase.
  for (const p of PHASE_ORDER) {
    const v = roleBank[role]?.[p];
    if (v?.length) return v;
  }
  // Same phase, another role.
  for (const r of ROLE_ORDER) {
    const v = roleBank[r]?.[phase];
    if (v?.length) return v;
  }
  // Anything in this category, then the H floor.
  for (const r of ROLE_ORDER) {
    for (const p of PHASE_ORDER) {
      const v = roleBank[r]?.[p];
      if (v?.length) return v;
    }
  }
  return BANK.H.Prepare!.pre!;
}

export interface FallbackWhyInput {
  categoryId: EventCategoryId | null;
  phase: Phase | null;
  role: ProactiveRole | string | null;
  /** Lines already used by earlier slots today — avoids three identical whys. */
  used?: Set<string>;
}

function normaliseRole(role: FallbackWhyInput["role"]): ProactiveRole {
  const r = String(role ?? "").trim();
  return (ROLE_ORDER as string[]).includes(r) ? (r as ProactiveRole) : "Prepare";
}

/**
 * Deterministic Why-line of last resort. Always returns a non-empty sentence,
 * and never repeats a line already in `used` unless the whole bank for that
 * cell is exhausted.
 */
export function fallbackWhyLine(input: FallbackWhyInput): string {
  const category = (input.categoryId ?? "H") as EventCategoryId;
  const phase: Phase = input.phase ?? "pre";
  const role = normaliseRole(input.role);
  const options = cell(category, role, phase);
  const used = input.used;
  if (used) {
    const fresh = options.find((o) => !used.has(o));
    if (fresh) {
      used.add(fresh);
      return fresh;
    }
    // Widen the search across the whole category before repeating.
    for (const r of ROLE_ORDER) {
      for (const p of PHASE_ORDER) {
        const alt = (BANK[category]?.[r]?.[p] ?? []).find((o) => !used.has(o));
        if (alt) {
          used.add(alt);
          return alt;
        }
      }
    }
  }
  return options[0];
}

/** Exposed for tests — total number of distinct lines in the bank. */
export function bankSize(): number {
  let n = 0;
  for (const roleBank of Object.values(BANK)) {
    for (const phaseBank of Object.values(roleBank)) {
      for (const lines of Object.values(phaseBank as PhaseBank)) {
        n += (lines as string[]).length;
      }
    }
  }
  return n;
}
