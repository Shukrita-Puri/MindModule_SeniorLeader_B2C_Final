import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.moonshot.mindmoduleapp',
  appName: 'Mind Module',
  webDir: 'dist',
  plugins: {
    PushNotifications: {
      // iOS does not show foreground remote pushes by default when Capacitor
      // owns the notification delegate. Keep remote test pushes and smart
      // nudges visible while the app is open.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      // overlaysWebView: true means the status bar is transparent and content
      // renders behind it. We compensate via env(safe-area-inset-top) padding
      // on #root and all fixed/sticky headers. This gives us edge-to-edge
      // visuals (hero images bleed under the status bar) while keeping
      // interactive content below the notch.
      overlaysWebView: true,
      style: 'LIGHT',
    },
  },
  android: {
    backgroundColor: '#FAFAF8',
  },
};

export default config;
