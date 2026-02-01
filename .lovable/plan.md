

# Restore Context Connection Design, Use Lambda Icon, and Capacitor Setup Guide

## Summary

This plan addresses three items:
1. **Use the uploaded Lambda icon image** for the collapsed sidebar (not custom SVG)
2. **Restore the original Context Connection page design** with toggle switches for both Google Calendar and Apple Watch
3. **Step-by-step Capacitor setup guide** to convert this web app to a native mobile app

---

## Part 1: Use Uploaded Lambda Icon Image

### Current State
The sidebar currently uses a custom inline SVG for the Lambda icon when collapsed.

### Change
Copy the uploaded Lambda icon image to `src/assets/kairos-lambda-icon.png` and use it in the LeftSidebar instead of the inline SVG.

### File Changes

**Copy file:**
- From: `user-uploads://PEAK_PERFORMERS_DON'T_JUST_REACT_THEY_ANTICIPATE_-_PROACTIVE_SELF_MASTERY_PLATFORM_5-3.png`
- To: `src/assets/kairos-lambda-icon.png`

**src/components/navigation/LeftSidebar.tsx:**
```tsx
// Add import at top
import kairosLambdaIcon from '@/assets/kairos-lambda-icon.png';

// Replace the inline SVG with:
{isCollapsed ? (
  <img 
    src={kairosLambdaIcon} 
    alt="KAIROS" 
    className="w-6 h-6 object-contain"
  />
) : (
  // Keep existing expanded view
)}
```

---

## Part 2: Restore Original Context Connection Design with Toggles

### Current State
The page currently shows:
- CalendarConnectionSettings component (which requires Auth0 - causes errors for unauthenticated users)
- Apple Watch with "Coming Soon" badge

### Original Design to Restore
Clean toggle-based design with:
- Toggle for Google Calendar (triggers OAuth when authenticated)
- Toggle for Apple Watch (stores preference, shows "Available in mobile app" note)
- Both toggles functional for storing preferences

### File Changes

**src/pages/onboarding/stages/Stage7ContextConnection.tsx:**

Restore the design with Switch toggles:

```tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Calendar, Watch } from "lucide-react";
import { getSession } from "@/utils/onboardingStorage";
import { useAuth } from "@/hooks/useAuth";
import { useAuth0 } from "@auth0/auth0-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Stage7ContextConnection() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { getAccessTokenSilently } = useAuth0();
  
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [watchEnabled, setWatchEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load saved preferences on mount
  useEffect(() => {
    const saved = localStorage.getItem('contextConnectionPreferences');
    if (saved) {
      const prefs = JSON.parse(saved);
      setCalendarEnabled(prefs.calendar || false);
      setWatchEnabled(prefs.watch || false);
    }
  }, []);

  // Handle Google Calendar toggle
  const handleCalendarToggle = async (checked: boolean) => {
    setCalendarEnabled(checked);
    
    // Save preference
    const prefs = { calendar: checked, watch: watchEnabled };
    localStorage.setItem('contextConnectionPreferences', JSON.stringify(prefs));
    
    // If enabling and authenticated, trigger OAuth
    if (checked && isAuthenticated) {
      setLoading(true);
      try {
        const token = await getAccessTokenSilently();
        const { data, error } = await supabase.functions.invoke('calendar-auth', {
          body: { action: 'connect', provider: 'google' },
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (error) throw error;
        if (data.authUrl) {
          window.location.href = data.authUrl;
        }
      } catch (error) {
        console.error('Error connecting calendar:', error);
        toast.error('Failed to connect calendar');
        setCalendarEnabled(false);
      } finally {
        setLoading(false);
      }
    }
  };

  // Handle Apple Watch toggle (preference only - native integration coming)
  const handleWatchToggle = (checked: boolean) => {
    setWatchEnabled(checked);
    
    // Save preference
    const prefs = { calendar: calendarEnabled, watch: checked };
    localStorage.setItem('contextConnectionPreferences', JSON.stringify(prefs));
    
    if (checked) {
      toast.info('Apple Watch will connect when you install the mobile app');
    }
  };

  const handleComplete = () => {
    const contextData = {
      onboardingCompletedAt: new Date().toISOString(),
      calendarEnabled,
      watchEnabled,
      plan: 'super-pro'
    };
    
    localStorage.setItem('contextConnections', JSON.stringify(contextData));
    
    const session = getSession();
    if (session) {
      session.responses.onboardingCompleted = true;
      session.responses.completedAt = new Date().toISOString();
      localStorage.setItem('mind_module_onboarding', JSON.stringify(session));
    }
    
    navigate("/daily-check-in");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-10">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Connect Context
          </h1>
          <p className="text-sm text-muted-foreground">
            Personalise your experience
          </p>
        </div>

        {/* Integration Options with Toggles */}
        <div className="space-y-3">
          
          {/* Google Calendar */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-card border">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="font-medium">Google Calendar</span>
                <span className="text-xs text-muted-foreground">
                  Sync your schedule
                </span>
              </div>
            </div>
            <Switch 
              checked={calendarEnabled}
              onCheckedChange={handleCalendarToggle}
              disabled={loading}
            />
          </div>
          
          {/* Apple Watch */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-card border">
            <div className="flex items-center gap-3">
              <Watch className="w-5 h-5 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="font-medium">Apple Watch</span>
                <span className="text-xs text-muted-foreground">
                  Available in mobile app
                </span>
              </div>
            </div>
            <Switch 
              checked={watchEnabled}
              onCheckedChange={handleWatchToggle}
            />
          </div>
          
        </div>

        {/* Coming soon note */}
        <p className="text-center text-xs text-muted-foreground/70">
          More calendars, wearables & email integrations coming soon
        </p>

        {/* CTAs */}
        <div className="space-y-3">
          <Button onClick={handleComplete} className="w-full" disabled={loading}>
            Continue
          </Button>
          <button 
            onClick={handleComplete} 
            className="w-full text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Skip for now
          </button>
        </div>

        {/* Subtle footer */}
        <p className="text-center text-xs text-muted-foreground/60">
          You can change this anytime in settings
        </p>

      </div>
    </div>
  );
}
```

---

## Part 3: Capacitor Setup - Step-by-Step Guide

### Overview
Capacitor allows you to wrap this React web app as a native iOS and Android app. The app will use the same codebase but can access native device features (like HealthKit for Apple Watch data).

### Prerequisites
Before starting, you will need:
- **For iOS**: A Mac computer with Xcode installed (from Mac App Store)
- **For Android**: Android Studio installed on your computer
- **Node.js** installed on your machine

### Step-by-Step Instructions

#### Step 1: Export and Clone Your Project

1. In Lovable, click the **"Export to Github"** button (in the top-right menu)
2. This creates a GitHub repository with your code
3. On your computer, open Terminal and clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   cd YOUR_REPO_NAME
   ```

#### Step 2: Install Dependencies

Run this command to install all project packages:
```bash
npm install
```

#### Step 3: Install Capacitor Packages

Install Capacitor core and platform packages:
```bash
npm install @capacitor/core @capacitor/ios @capacitor/android
npm install -D @capacitor/cli
```

#### Step 4: Initialize Capacitor

Run the Capacitor initialization:
```bash
npx cap init
```

When prompted:
- **App name**: KAIROS (or your app name)
- **App Package ID**: `app.lovable.eb63fb97dcc84fc58148517646438c6d`

This creates a `capacitor.config.ts` file.

#### Step 5: Configure Capacitor for Development

Edit the `capacitor.config.ts` file to enable hot-reload during development:

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.eb63fb97dcc84fc58148517646438c6d',
  appName: 'KAIROS',
  webDir: 'dist',
  server: {
    url: 'https://eb63fb97-dcc8-4fc5-8148-517646438c6d.lovableproject.com?forceHideBadge=true',
    cleartext: true
  }
};

export default config;
```

Note: The `server.url` enables live-reload from Lovable during development. Remove it for production builds.

#### Step 6: Build the Web App

Build the project to create the `dist` folder:
```bash
npm run build
```

#### Step 7: Add Native Platforms

Add the platforms you want to support:

**For iOS:**
```bash
npx cap add ios
```

**For Android:**
```bash
npx cap add android
```

#### Step 8: Sync and Update

After adding platforms, sync your web code:
```bash
npx cap sync
```

Run this command whenever you:
- Pull new code from git
- Make changes to your web app
- Update Capacitor plugins

#### Step 9: Run on Device/Emulator

**For iOS** (requires Mac with Xcode):
```bash
npx cap run ios
```
- Select your connected iPhone or choose a simulator
- Xcode will open and build the app

**For Android**:
```bash
npx cap run android
```
- Android Studio will open
- Select an emulator or connected device

### Future: Apple Watch / HealthKit Integration

Once your Capacitor app is running, you can add HealthKit support:

```bash
npm install @capacitor-community/health-kit
npx cap sync
```

Then update your iOS project's Info.plist (in Xcode) with HealthKit permissions.

### Development Workflow

1. Make changes in Lovable (web app)
2. Export changes to GitHub
3. On your machine: `git pull`
4. Run: `npm run build && npx cap sync`
5. Run: `npx cap run ios` or `npx cap run android`

For faster development with hot-reload:
- Keep the `server.url` in capacitor.config.ts pointing to your Lovable preview
- The app will load directly from Lovable (requires internet)

---

## Files Summary

| File | Action |
|------|--------|
| `src/assets/kairos-lambda-icon.png` | **Copy** from uploaded file |
| `src/components/navigation/LeftSidebar.tsx` | Update to use image instead of SVG |
| `src/pages/onboarding/stages/Stage7ContextConnection.tsx` | Restore toggle design with working switches |

---

## Testing After Implementation

- [ ] Collapsed sidebar shows the uploaded Lambda icon image
- [ ] Expanded sidebar shows KAIROS wordmark
- [ ] Context Connection page shows two toggle rows (Google Calendar, Apple Watch)
- [ ] Google Calendar toggle triggers OAuth when enabled (if authenticated)
- [ ] Apple Watch toggle shows toast about mobile app availability
- [ ] Both toggles save preferences to localStorage
- [ ] Continue button works and navigates to daily check-in

