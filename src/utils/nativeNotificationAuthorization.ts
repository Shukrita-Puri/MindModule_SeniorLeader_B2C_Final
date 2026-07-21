import { Capacitor, registerPlugin } from '@capacitor/core';

export type NotificationAuthorizationStatus =
  | 'not_determined'
  | 'denied'
  | 'authorized'
  | 'provisional'
  | 'ephemeral'
  | 'unknown';

export type NotificationSettingState =
  | 'enabled'
  | 'disabled'
  | 'not_supported'
  | 'unknown';

export type BackgroundRefreshStatus =
  | 'available'
  | 'denied'
  | 'restricted'
  | 'unknown';

export interface NativeNotificationAuthorizationStatus {
  authorizationStatus: NotificationAuthorizationStatus;
  alertSetting: NotificationSettingState;
  badgeSetting: NotificationSettingState;
  soundSetting: NotificationSettingState;
  notificationCenterSetting: NotificationSettingState;
  lockScreenSetting: NotificationSettingState;
  backgroundRefreshStatus: BackgroundRefreshStatus;
  quietAuthorization: boolean;
  canRequestFullPrompt: boolean;
}

interface NotificationAuthorizationPlugin {
  getStatus(): Promise<NativeNotificationAuthorizationStatus>;
  requestProvisionalPermission(): Promise<NativeNotificationAuthorizationStatus>;
  requestFullPermission(): Promise<NativeNotificationAuthorizationStatus>;
  openAppSettings(): Promise<{ opened: boolean }>;
}

const NotificationAuthorization = registerPlugin<NotificationAuthorizationPlugin>('NotificationAuthorization');

function isNativeIos(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
}

export function isAuthorizedForRemoteNotifications(
  status: NativeNotificationAuthorizationStatus | null | undefined,
): boolean {
  return status?.authorizationStatus === 'authorized'
    || status?.authorizationStatus === 'provisional'
    || status?.authorizationStatus === 'ephemeral';
}

export async function getNativeNotificationAuthorizationStatus(): Promise<NativeNotificationAuthorizationStatus | null> {
  if (!isNativeIos()) return null;
  try {
    return await NotificationAuthorization.getStatus();
  } catch {
    return null;
  }
}

export async function requestProvisionalNotificationPermission(): Promise<NativeNotificationAuthorizationStatus | null> {
  if (!isNativeIos()) return null;
  try {
    return await NotificationAuthorization.requestProvisionalPermission();
  } catch {
    return null;
  }
}

export async function requestFullNotificationPermission(): Promise<NativeNotificationAuthorizationStatus | null> {
  if (!isNativeIos()) return null;
  try {
    return await NotificationAuthorization.requestFullPermission();
  } catch {
    return null;
  }
}

export async function openNativeNotificationSettings(): Promise<boolean> {
  if (!isNativeIos()) return false;
  try {
    const result = await NotificationAuthorization.openAppSettings();
    return result.opened === true;
  } catch {
    return false;
  }
}
