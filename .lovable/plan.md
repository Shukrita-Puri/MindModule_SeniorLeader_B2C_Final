
# Rebrand to KAIROS + Auth0 Integration + New Color Palette

## Overview

This is a significant rebrand from "Mind Module" / "Inner Architect" / "Mind Atelier" to **KAIROS**. Includes:
1. Auth0 integration details for edge functions (already configured)
2. App-wide name change to KAIROS
3. New logo assets (black/white text logos)
4. Primary button color change from orange/saffron (#FF8C42) to the new elite green (~#1DB954)
5. Updated color palette: cinematic, calming, elite, intelligent

---

## Part 1: Auth0 Configuration (Already in Place)

Good news: **Auth0 is already fully configured** in this project. The secrets are already set up:

| Secret | Status |
|--------|--------|
| `AUTH0_DOMAIN` | Configured |
| `VITE_AUTH0_CLIENT_ID` | Configured |
| `VITE_AUTH0_CLIENT_SECRET` | Configured |
| `VITE_AUTH0_DOMAIN` | Configured |

The current architecture routes authentication through Auth0 (as documented in memory). Edge functions that need user authentication:
- Verify Auth0 token via `/userinfo` endpoint
- Use the service role key to interact with the database
- The `AUTH0_DOMAIN` secret is available in edge functions

**No additional secrets needed** - Auth0 is ready to use.

---

## Part 2: Brand Name Change - KAIROS

### Files Requiring Updates

| Location | Current | New |
|----------|---------|-----|
| `index.html` (title + meta) | "Inner Architect" | "Kairos" |
| `src/components/Header.tsx` | "Inner Architect" | "Kairos" |
| `src/pages/Front.tsx` | "MIND MODULE" | "KAIROS" |
| `src/pages/Front.tsx` | "Mind Mastery for High Performers" | Keep or update tagline |
| `src/components/navigation/LeftSidebar.tsx` | "MIND MODULE" + "Executive Edition" | "KAIROS" + "Executive Edition" |
| `src/components/home/GreetingBanner.tsx` | "Mind Atelier - Your daily practice" | "Kairos - Your daily practice" |
| `src/pages/onboarding/stages/Stage1Welcome.tsx` | "MIND MODULE" | "KAIROS" |
| `src/pages/Privacy.tsx` | Multiple "Mind Module" references | "Kairos" |
| `src/pages/Terms.tsx` | "Mind Module" | "Kairos" |
| `src/pages/Refer.tsx` | "Mind Atelier" | "Kairos" |
| `src/components/PrivacyDashboard.tsx` | "Mind Atelier" | "Kairos" |
| `src/components/SmartNudge.tsx` | "Mind Module" | "Kairos" |
| `src/components/WeeklyInsights.tsx` | "Inner Architect Recommendations" | "Kairos Recommendations" |
| `src/data/roleplayContent.ts` | "Mind Module" | "Kairos" |
| `src/utils/calendarUrlGenerator.ts` | "Mind Module" | "Kairos" |

---

## Part 3: Logo Assets

### New Assets to Add
- **Black text logo**: `src/assets/kairos-logo-black.png` (from uploaded KAIROS black text image)
- **White text logo**: `src/assets/kairos-logo-white.png` (for dark backgrounds if needed)
- **Lambda mark**: The stylized "Λ" can serve as an app icon/favicon

### Logo Usage
- Sidebar: Use the black KAIROS text logo when expanded
- Light backgrounds: Black logo
- Dark backgrounds: White logo (if applicable)

---

## Part 4: Color Palette Update - Elite Green

### New Primary Accent Color
The green from the images is approximately **#1DB954** (a rich, confident green - similar to Spotify green but branded for KAIROS).

HSL equivalent: `145 72% 53%`

### CSS Variable Changes (`src/index.css`)

**Current saffron (orange) values:**
```css
--saffron: 24 85% 63%;           /* #FF8C42 */
--saffron-foreground: 0 0% 100%;
```

**New KAIROS green values:**
```css
--kairos: 145 72% 53%;           /* #1DB954 - Elite Green */
--kairos-foreground: 0 0% 100%;
```

### Button Component Update (`src/components/ui/button.tsx`)

Change the `critical` variant from saffron to the new KAIROS green:

```tsx
// Current
critical: "bg-saffron text-saffron-foreground shadow-[0_4px_16px_rgba(255,140,66,0.3)]..."

// New
critical: "bg-kairos text-kairos-foreground shadow-[0_4px_16px_rgba(29,185,84,0.3)]..."
```

### Icon Effects Update (`src/index.css`)

The `.icon-luxury` class uses saffron colors - update to use KAIROS green:
- Change `rgba(255,140,66,...)` to `rgba(29,185,84,...)`

### Full Color Palette (Cinematic, Calming, Elite, Intelligent)

| Color | Hex | Usage |
|-------|-----|-------|
| **KAIROS Green** | #1DB954 | Primary CTAs, key actions, active states |
| **Black** | #000000 | Text on light backgrounds, strong emphasis |
| **Charcoal** | #2C2C2C | Primary text, foreground |
| **White** | #FFFFFF | Backgrounds, cards, text on dark |
| **Warm Taupe** | #9B8B7E | Secondary buttons, subtle accents (keep) |
| **Mustard/Gold** | #D4AF37 | Decorative accents, badges (keep) |

---

## Part 5: Files to Modify

### Critical Files (Branding)
1. `index.html` - Title and meta tags
2. `src/pages/Front.tsx` - Hero branding
3. `src/components/navigation/LeftSidebar.tsx` - Sidebar brand
4. `src/components/Header.tsx` - Header title
5. `src/components/home/GreetingBanner.tsx` - Greeting subtext
6. `src/pages/onboarding/stages/Stage1Welcome.tsx` - Onboarding branding

### Legal/Content Files
7. `src/pages/Privacy.tsx` - Privacy policy references
8. `src/pages/Terms.tsx` - Terms of service references
9. `src/pages/Refer.tsx` - Referral page
10. `src/components/PrivacyDashboard.tsx` - Privacy dashboard

### Design System Files
11. `src/index.css` - Add KAIROS green CSS variable, update icon effects
12. `src/components/ui/button.tsx` - Update critical variant to green
13. `tailwind.config.ts` - Add kairos color token

### Utility/Data Files
14. `src/components/SmartNudge.tsx` - Nudge branding
15. `src/components/WeeklyInsights.tsx` - Recommendations title
16. `src/data/roleplayContent.ts` - Creator attribution
17. `src/utils/calendarUrlGenerator.ts` - Calendar event branding

### New Assets
18. Copy KAIROS black text logo to `src/assets/kairos-logo-black.png`
19. (Optional) Create/copy white version for dark backgrounds

---

## Implementation Sequence

1. **Copy logo assets** to `src/assets/`
2. **Update CSS variables** in `src/index.css`:
   - Add `--kairos` and `--kairos-foreground`
   - Update icon effect colors
3. **Update Tailwind config** to add `kairos` color token
4. **Update button component** to use new green for `critical` variant
5. **Update branding** across all identified files (search & replace + manual review)
6. **Update meta tags** in `index.html`
7. **Test** the onboarding flow and signup step

---

## Technical Notes

- The existing `--mint-green` variable (`145 100% 39%`) is close but the KAIROS green (#1DB954 / `145 72% 53%`) is slightly different - more saturated and vibrant
- Consider keeping saffron as a secondary accent for warnings/attention if needed
- The green maintains the "calming yet intelligent" aesthetic requested - it's confident without being aggressive
