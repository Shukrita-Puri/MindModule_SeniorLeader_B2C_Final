/**
 * usePlanLocaleContext — thin React wrapper over the TTL-cached
 * `getPlanLocaleContext` util so pages can read the user's Home Country /
 * timezone context without adding a bespoke fetch each. The util caches for
 * 5 minutes per user, so mounting this on several pages costs no extra
 * network traffic.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { DEV_MODE, DEV_USER } from "@/config/devMode";
import {
  deviceLocaleContext,
  getPlanLocaleContext,
  type PlanLocaleContext,
} from "@/utils/planLocaleContext";

export function usePlanLocaleContext(): PlanLocaleContext {
  const { user } = useAuth();
  const userId = user?.id || (DEV_MODE ? DEV_USER.id : undefined);
  const [locale, setLocale] = useState<PlanLocaleContext>(() =>
    deviceLocaleContext()
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await getPlanLocaleContext(userId).catch(() => null);
      if (!cancelled && next) setLocale(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return locale;
}