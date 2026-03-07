/**
 * SubscriptionGuard — wraps protected routes to enforce valid subscription.
 * 
 * CURRENTLY DISABLED (pass-through) until Stripe subscription flow is fully
 * wired and existing users have subscription_tier populated.
 * 
 * To activate: remove the early return and uncomment the enforcement logic.
 */
export const SubscriptionGuard = ({ children }: { children: React.ReactNode }) => {
  // TODO: Enable once Stripe is live and all users have subscription data
  // For now, pass through to avoid blocking existing beta users
  return <>{children}</>;
};
