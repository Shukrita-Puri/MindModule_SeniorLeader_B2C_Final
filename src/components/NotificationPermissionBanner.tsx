import { useEffect, useMemo, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Bell, BellOff, RefreshCcw, Settings } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  getNativeNotificationAuthorizationStatus,
  openNativeNotificationSettings,
  requestFullNotificationPermission,
  type NativeNotificationAuthorizationStatus,
} from '@/utils/nativeNotificationAuthorization';
import {
  forcePushReRegistration,
  getPushRegistrationHealth,
  type PushRegistrationHealth,
} from '@/utils/notificationDiagnostics';

const STALE_TOKEN_DAYS = 7;

type BannerReason =
  | 'denied'
  | 'provisional'
  | 'background_refresh_off'
  | 'stale_token';

function isNativeIos(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
}

function buildReason(
  nativeStatus: NativeNotificationAuthorizationStatus | null,
  health: PushRegistrationHealth | null,
): BannerReason | null {
  if (!nativeStatus) return null;
  if (nativeStatus.authorizationStatus === 'denied') return 'denied';
  if (nativeStatus.authorizationStatus === 'provisional') return 'provisional';
  if (nativeStatus.backgroundRefreshStatus !== 'available') return 'background_refresh_off';

  const staleAge = daysSince(health?.lastPersistSuccessAt);
  if (staleAge !== null && staleAge >= STALE_TOKEN_DAYS) return 'stale_token';
  return null;
}

export function NotificationPermissionBanner() {
  const { isAuthenticated } = useAuth();
  const [nativeStatus, setNativeStatus] = useState<NativeNotificationAuthorizationStatus | null>(null);
  const [health, setHealth] = useState<PushRegistrationHealth | null>(null);
  const [loadingAction, setLoadingAction] = useState<'full' | 'refresh' | 'settings' | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !isNativeIos()) {
      setNativeStatus(null);
      setHealth(null);
      return;
    }

    let cancelled = false;
    let removeResumeListener: (() => void) | null = null;

    const refresh = async () => {
      const [status, registrationHealth] = await Promise.all([
        getNativeNotificationAuthorizationStatus(),
        Promise.resolve(getPushRegistrationHealth()),
      ]);
      if (cancelled) return;
      setNativeStatus(status);
      setHealth(registrationHealth);
    };

    void refresh();

    const onHealthChange = () => { void refresh(); };
    window.addEventListener('mm:push-registration-health-changed', onHealthChange);

    void (async () => {
      try {
        const handle = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) void refresh();
        });
        if (cancelled) {
          void handle.remove();
        } else {
          removeResumeListener = () => { void handle.remove(); };
        }
      } catch {
        // no-op on unsupported platforms
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('mm:push-registration-health-changed', onHealthChange);
      removeResumeListener?.();
    };
  }, [isAuthenticated]);

  const reason = useMemo(() => buildReason(nativeStatus, health), [health, nativeStatus]);

  const bannerCopy = useMemo(() => {
    if (!reason || !nativeStatus) return null;

    const staleAge = daysSince(health?.lastPersistSuccessAt);
    const backgroundRefreshOff = nativeStatus.backgroundRefreshStatus !== 'available';
    const backgroundRefreshCopy = backgroundRefreshOff
      ? ' Background App Refresh is also off, which can block silent pushes and delivery callbacks.'
      : '';

    switch (reason) {
      case 'denied':
        return {
          icon: BellOff,
          variant: 'destructive' as const,
          title: 'Notifications are off on this iPhone',
          body: `Mind Module can’t reopen Apple’s system prompt after a denial, so the next step has to happen in iOS Settings.${backgroundRefreshCopy}`,
          primaryLabel: 'Open Settings',
          primaryAction: 'settings' as const,
          secondaryLabel: null,
        };
      case 'provisional':
        return {
          icon: Bell,
          variant: 'default' as const,
          title: 'Quiet notification mode is active',
          body: `You’re currently on provisional delivery, so nudges can arrive quietly without the full alert treatment. Turn on full alerts when you’re ready.${backgroundRefreshCopy}`,
          primaryLabel: 'Turn On Alerts',
          primaryAction: 'full' as const,
          secondaryLabel: 'Settings',
        };
      case 'background_refresh_off':
        return {
          icon: Settings,
          variant: 'default' as const,
          title: 'Background App Refresh is off',
          body: 'Mind Module can still send visible pushes, but silent delivery and receipt callbacks are less reliable until Background App Refresh is re-enabled in iOS Settings.',
          primaryLabel: 'Open Settings',
          primaryAction: 'settings' as const,
          secondaryLabel: null,
        };
      case 'stale_token':
        return {
          icon: RefreshCcw,
          variant: 'default' as const,
          title: 'Notification delivery looks stale',
          body: `This iPhone hasn’t completed a successful push-token refresh in about ${staleAge ?? STALE_TOKEN_DAYS} day${staleAge === 1 ? '' : 's'}. Refresh it now, then check Settings if the banner keeps returning.${backgroundRefreshCopy}`,
          primaryLabel: 'Refresh Token',
          primaryAction: 'refresh' as const,
          secondaryLabel: 'Settings',
        };
      default:
        return null;
    }
  }, [health?.lastPersistSuccessAt, nativeStatus, reason]);

  if (!isAuthenticated || !isNativeIos() || !bannerCopy) return null;

  const Icon = bannerCopy.icon;

  const handleOpenSettings = async () => {
    setLoadingAction('settings');
    try {
      const opened = await openNativeNotificationSettings();
      if (!opened) toast.error('Could not open iOS Settings.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleEnableFullAlerts = async () => {
    setLoadingAction('full');
    try {
      const status = await requestFullNotificationPermission();
      if (status?.authorizationStatus === 'authorized') {
        await forcePushReRegistration();
        toast.success('Full notification alerts enabled.');
      } else {
        toast.message('Notification settings refreshed.');
      }
      setNativeStatus(status);
      setHealth(getPushRegistrationHealth());
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRefreshToken = async () => {
    setLoadingAction('refresh');
    try {
      await forcePushReRegistration();
      setHealth(getPushRegistrationHealth());
      setNativeStatus(await getNativeNotificationAuthorizationStatus());
      toast.success('Push token refresh requested.');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="px-4 pt-4 sm:px-6">
      <Alert
        variant={bannerCopy.variant}
        className={cn(
          'border-[#d8ccb8] bg-[#fffaf2] text-foreground shadow-[0_10px_30px_rgba(88,62,25,0.08)]',
          bannerCopy.variant === 'destructive' && 'border-[#f0b6a7] bg-[#fff3ef]',
        )}
      >
        <Icon className="h-4 w-4" />
        <AlertTitle>{bannerCopy.title}</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <p>{bannerCopy.body}</p>
          <div className="flex flex-wrap gap-2">
            {bannerCopy.primaryAction === 'settings' && (
              <Button size="sm" variant="critical" loading={loadingAction === 'settings'} onClick={() => void handleOpenSettings()}>
                Open Settings
              </Button>
            )}
            {bannerCopy.primaryAction === 'full' && (
              <Button size="sm" variant="critical" loading={loadingAction === 'full'} onClick={() => void handleEnableFullAlerts()}>
                {bannerCopy.primaryLabel}
              </Button>
            )}
            {bannerCopy.primaryAction === 'refresh' && (
              <Button size="sm" variant="critical" loading={loadingAction === 'refresh'} onClick={() => void handleRefreshToken()}>
                {bannerCopy.primaryLabel}
              </Button>
            )}
            {bannerCopy.secondaryLabel && (
              <Button size="sm" variant="outline" onClick={() => void handleOpenSettings()}>
                {bannerCopy.secondaryLabel}
              </Button>
            )}
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
