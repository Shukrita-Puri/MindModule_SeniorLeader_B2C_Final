import { Navigate } from "react-router-dom";
import { useCheckInMode } from "@/hooks/useCheckInMode";

/**
 * Route-level guard for /daily-check-in and /check-in-detail.
 * Redirects users to /executive-home when their persisted mode hides the page.
 * Pure visibility — no business logic.
 */
export function CheckInVisibilityGuard({
  page,
  children,
}: {
  page: "daily-check-in" | "check-in-detail";
  children: React.ReactNode;
}) {
  const { showDailyCheckIn, showCheckInDetail, isLoading } = useCheckInMode();

  if (isLoading) return <>{children}</>;

  const allowed = page === "daily-check-in" ? showDailyCheckIn : showCheckInDetail;
  if (!allowed) return <Navigate to="/executive-home" replace />;
  return <>{children}</>;
}
