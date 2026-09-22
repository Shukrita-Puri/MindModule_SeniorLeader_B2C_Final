/**
 * Silent screen-usage tracker (admin analytics only).
 *
 * Observes which route is open and for how long, pausing the timer when the
 * app is backgrounded. Renders nothing, blocks nothing, and never awaits on
 * the render path — every failure is swallowed. Removing the single call site
 * in App.tsx fully disables it.
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { getAuthToken } from '@/services/authTokenService';
import { getSupabaseFunctionHeaders, getSupabaseFunctionUrl } from '@/utils/supabaseFunctions';
import { getDeviceLocaleContext, getInstallId } from '@/utils/installId';

interface PendingView {
  route: string;
  enteredAt: string;
  durationMs: number;
  localDate: string;
}

const MIN_TRACKED_MS = 500;
const MAX_BATCH = 20;

let queue: PendingView[] = [];
let flushing = false;

function localDateString(): string {
  try {
    return new Intl.DateTimeFormat('en-CA').format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function platform(): string {
  try {
    return Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';
  } catch {
    return 'web';
  }
}

async function appVersion(): Promise<string | null> {
  try {
    if (!Capacitor.isNativePlatform()) return null;
    const info = await CapacitorApp.getInfo();
    return info?.version ? `${info.version}${info.build ? ` (${info.build})` : ''}` : null;
  } catch {
    return null;
  }
}

/** Fire-and-forget send. Never throws, never retries aggressively. */
export async function flushUsage(extra?: Record<string, unknown>): Promise<void> {
  if (flushing) return;
  const views = queue.slice(0, MAX_BATCH);
  if (views.length === 0 && !extra) return;
  flushing = true;
  queue = queue.slice(views.length);
  try {
    const { timezone, locale, country } = getDeviceLocaleContext();
    // Token is optional context (it links the install to an account). Never
    // let auth resolution delay or block an anonymous ping.
    let token: string | null = null;
    try {
      token = await Promise.race<string | null>([
        getAuthToken().catch(() => null),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1500)),
      ]);
    } catch {
      token = null;
    }
    await fetch(getSupabaseFunctionUrl('track-app-usage'), {
      method: 'POST',
      headers: getSupabaseFunctionHeaders(token),
      body: JSON.stringify({
        installId: getInstallId(),
        platform: platform(),
        appVersion: await appVersion(),
        timezone,
        locale,
        country,
        views,
        ...(extra ?? {}),
      }),
      keepalive: true,
    });
  } catch {
    /* analytics must never surface or retry-loop */
  } finally {
    flushing = false;
  }
}

/**
 * Records notification opt-in state (and the device token) against the
 * anonymous install. Uses its own request rather than the shared view-batch
 * flush, so it can never be dropped because a screen-time ping is in flight.
 * Retries once, then gives up silently.
 */
export function recordInstallNotificationState(optIn: boolean, status: string | null, deviceToken?: string | null): void {
  void (async () => {
    const { timezone, locale, country } = getDeviceLocaleContext();
    const body = JSON.stringify({
      installId: getInstallId(),
      platform: platform(),
      timezone,
      locale,
      country,
      views: [],
      notificationOptIn: optIn,
      notificationStatus: status,
      ...(deviceToken ? { deviceToken } : {}),
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        let token: string | null = null;
        try {
          token = await Promise.race<string | null>([
            getAuthToken().catch(() => null),
            new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1500)),
          ]);
        } catch {
          token = null;
        }
        const res = await fetch(getSupabaseFunctionUrl('track-app-usage'), {
          method: 'POST',
          headers: getSupabaseFunctionHeaders(token),
          body,
          keepalive: true,
        });
        if (res.ok) return;
      } catch {
        /* fall through to the single retry */
      }
      if (attempt === 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
    }
  })();
}

export function useAppUsageTracking(): void {
  const { pathname } = useLocation();
  const currentRoute = useRef<string | null>(null);
  const enteredAt = useRef<number>(Date.now());
  const accumulated = useRef<number>(0);

  // Record the current screen and reset the timer whenever the route changes.
  useEffect(() => {
    const close = () => {
      const route = currentRoute.current;
      if (!route) return;
      const elapsed = accumulated.current + (Date.now() - enteredAt.current);
      accumulated.current = 0;
      // Consume the visit: a second close() (cleanup then next effect run) must
      // never re-record the same screen.
      currentRoute.current = null;
      enteredAt.current = Date.now();
      if (elapsed < MIN_TRACKED_MS) return;
      queue.push({
        route,
        enteredAt: new Date(Date.now() - elapsed).toISOString(),
        durationMs: elapsed,
        localDate: localDateString(),
      });
      void flushUsage();
    };

    // A full page unload never finishes an unmount flush — record what is
    // pending while the page is still alive.
    const onPageHide = () => {
      close();
    };
    window.addEventListener('pagehide', onPageHide);

    close();
    currentRoute.current = pathname;
    enteredAt.current = Date.now();
    // First open (or first route of the session) registers the install even
    // when nothing else is queued yet.
    if (queue.length === 0) void flushUsage({});
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      close();
    };
  }, [pathname]);

  // Pause the timer while the app is backgrounded so idle time is not counted.
  useEffect(() => {
    let removeListener: (() => void) | null = null;
    (async () => {
      try {
        const handle = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            enteredAt.current = Date.now();
          } else {
            accumulated.current += Date.now() - enteredAt.current;
            void flushUsage();
          }
        });
        removeListener = () => { void handle.remove(); };
      } catch {
        /* web / unsupported */
      }
    })();

    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        accumulated.current += Date.now() - enteredAt.current;
        void flushUsage();
      } else {
        enteredAt.current = Date.now();
      }
    };
    document.addEventListener('visibilitychange', onHidden);

    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      if (removeListener) removeListener();
    };
  }, []);
}
