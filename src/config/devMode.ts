// Toggle this to true to bypass authentication during development
export const DEV_MODE = false;

// Mock user data for development
export const DEV_USER = {
  id: "dev-user-123",
  email: "dev@example.com",
  name: "Dev User",
  picture: undefined,
  subscription_status: "active" as const,
  subscription_plan: "monthly" as const,
  subscription_tier: "monthly_pro",
  trial_ends_at: null,
  subscription_current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
  subscription_current_period_start: new Date().toISOString(),
  subscription_canceled_at: null,
  subscription_cancel_at: null,
  onboarding_completed: true,
  onboarding_completed_at: new Date().toISOString(),
  user_archetype: "The Strategist",
};
