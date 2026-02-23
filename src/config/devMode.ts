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
};
