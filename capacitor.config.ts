import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.mindmodule.me',
  appName: 'Mind Module',
  webDir: 'dist',
  plugins: {
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
};

export default config;
