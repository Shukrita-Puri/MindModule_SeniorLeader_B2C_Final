import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.mindmodule.me',
  appName: 'wwwmindmoduleme',
  webDir: 'dist',
  server: {
    url: 'https://mindmodule.me?forceHideBadge=true',
    cleartext: true,
  },
};

export default config;
