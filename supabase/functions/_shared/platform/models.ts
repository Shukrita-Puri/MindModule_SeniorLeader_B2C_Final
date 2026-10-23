// [KIND: configuration] [LAYER: platform] [TIERS: 0] [AUDIENCE: universal]
// Platform Model Register.
// Source: Knowledge & Memory Spine (Section 8.1, Decisions 40 & 41).
// Invariant: Platform configuration, not Layer 5. Every AI task declared by role.

export type ModelRole =
  | "profile_synthesis"
  | "voice_validation"
  | "llm_event_finding_read"
  | "brief_generation"
  | "plan_generation"
  | "nudge_generation"
  | "coaching";

export interface ModelRegistration {
  role: ModelRole;
  primaryModel: string;
  fallbackModel: string;
  provider: "lovable_gateway" | "anthropic";
  temperature: number;
  maxTokens: number;
}

export const DEFAULT_PLATFORM_MODEL = "google/gemini-3.1-flash-lite";

export const MODEL_REGISTER: Record<ModelRole, ModelRegistration> = {
  profile_synthesis: {
    role: "profile_synthesis",
    primaryModel: "google/gemini-3.1-flash-lite",
    fallbackModel: "google/gemini-2.5-flash",
    provider: "lovable_gateway",
    temperature: 0.2,
    maxTokens: 1024,
  },
  voice_validation: {
    role: "voice_validation",
    primaryModel: "google/gemini-3.1-flash-lite",
    fallbackModel: "google/gemini-2.5-flash",
    provider: "lovable_gateway",
    temperature: 0.1,
    maxTokens: 512,
  },
  llm_event_finding_read: {
    role: "llm_event_finding_read",
    primaryModel: "google/gemini-3.1-flash-lite",
    fallbackModel: "google/gemini-2.5-flash",
    provider: "lovable_gateway",
    temperature: 0.1,
    maxTokens: 256,
  },
  brief_generation: {
    role: "brief_generation",
    primaryModel: "google/gemini-3.1-flash-lite",
    fallbackModel: "google/gemini-2.5-flash",
    provider: "lovable_gateway",
    temperature: 0.3,
    maxTokens: 1024,
  },
  plan_generation: {
    role: "plan_generation",
    primaryModel: "google/gemini-3.1-flash-lite",
    fallbackModel: "google/gemini-2.5-flash",
    provider: "lovable_gateway",
    temperature: 0.3,
    maxTokens: 1024,
  },
  nudge_generation: {
    role: "nudge_generation",
    primaryModel: "google/gemini-3.1-flash-lite",
    fallbackModel: "google/gemini-2.5-flash",
    provider: "lovable_gateway",
    temperature: 0.2,
    maxTokens: 512,
  },
  coaching: {
    role: "coaching",
    primaryModel: "google/gemini-3.1-flash-lite",
    fallbackModel: "google/gemini-2.5-flash",
    provider: "lovable_gateway",
    temperature: 0.4,
    maxTokens: 2048,
  },
};

export function resolveModelConfig(role: ModelRole): ModelRegistration {
  return MODEL_REGISTER[role] ?? {
    role,
    primaryModel: DEFAULT_PLATFORM_MODEL,
    fallbackModel: "google/gemini-2.5-flash",
    provider: "lovable_gateway",
    temperature: 0.2,
    maxTokens: 1024,
  };
}
