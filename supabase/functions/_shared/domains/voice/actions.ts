// [KIND: registry] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Action Registry for Chief of Staff Voice & Behaviour Domain.
// Defines allowed executive actions, required consents, confirmation wording, and reversibility.
// Source: Part 2 Layer 5 (Section 6.7).

export interface ActionDefinition {
  id: string;
  owner: "plan" | "interventions" | "nudges" | "memory" | "importance" | "device" | "calendar" | "marketplace";
  status: "mvp" | "planned";
  requiredConsent: "in_app_yes" | "confirmation" | "os_permission" | "calendar_write" | "health_consent";
  reversible: boolean;
  exampleOffer: string;
}

export const ACTION_REGISTRY: Record<string, ActionDefinition> = {
  "plan.slot_move": {
    id: "plan.slot_move",
    owner: "plan",
    status: "mvp",
    requiredConsent: "in_app_yes",
    reversible: true,
    exampleOffer: "Want the reset moved to 1:40, right before the board?",
  },
  "practice.start": {
    id: "practice.start",
    owner: "interventions",
    status: "mvp",
    requiredConsent: "in_app_yes",
    reversible: false,
    exampleOffer: "Two minutes now, before the call?",
  },
  "reminder.set": {
    id: "reminder.set",
    owner: "nudges",
    status: "mvp",
    requiredConsent: "in_app_yes",
    reversible: true,
    exampleOffer: "Remind you at 10:40?",
  },
  "memory.remember": {
    id: "memory.remember",
    owner: "memory",
    status: "mvp",
    requiredConsent: "confirmation",
    reversible: true,
    exampleOffer: "Keep evenings for family: want me to remember that?",
  },
  "meeting.tag": {
    id: "meeting.tag",
    owner: "importance",
    status: "mvp",
    requiredConsent: "in_app_yes",
    reversible: true,
    exampleOffer: "Mark this one as a priority?",
  },
  "device.dnd": {
    id: "device.dnd",
    owner: "device",
    status: "planned",
    requiredConsent: "os_permission",
    reversible: true,
    exampleOffer: "Four hours straight, then the 4pm. Want your phone quiet until then?",
  },
  "calendar.hold": {
    id: "calendar.hold",
    owner: "calendar",
    status: "planned",
    requiredConsent: "calendar_write",
    reversible: true,
    exampleOffer: "Hold 3:40–4:00 before the pitch?",
  },
};
