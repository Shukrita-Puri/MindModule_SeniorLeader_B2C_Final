
# Branding & Domain Alignment Implementation Plan

## Summary
Align all app branding from "Kairos" to "Mind Module", update contact emails to @mindmodule.me, and enhance privacy policy to explicitly mention Google Calendar access. This ensures OAuth verification passes and brand consistency across all user-facing content.

## Files to Modify

### 1. **src/pages/Privacy.tsx** (Lines: 16, 19, 97, 137, 181, 204, 234)
Replace:
- Line 16: `Kairos ("we," "our," or "us")` → `Mind Module ("we," "our," or "us")`
- Line 19: `By accessing or using Kairos,` → `By accessing or using Mind Module,`
- Line 97: `Kairos uses artificial intelligence` → `Mind Module uses artificial intelligence`
- Line 137: `protect the rights, safety, or property of Kairos,` → `protect the rights, safety, or property of Mind Module,`
- Line 181: `contact us at privacy@kairos.me` → `contact us at privacy@mindmodule.me`
- Line 204: `Kairos is designed for professionals` → `Mind Module is designed for professionals`
- Line 234: `privacy@kairos.me` → `privacy@mindmodule.me`
- **Enhancement**: Add explicit mention of Google Calendar `calendar.readonly` scope in Section 1.6 (after line 63) to clarify what calendar data is accessed

### 2. **src/pages/Terms.tsx** (Lines: 14, 21, 47, 54, 61, 74, 81, 86, 96, 129)
Replace:
- Line 14: `By accessing and using Kairos,` → `By accessing and using Mind Module,`
- Line 21: `Kairos provides a mental fitness platform` → `Mind Module provides a mental fitness platform`
- Line 47: `Kairos is a mental fitness and wellness tool` → `Mind Module is a mental fitness and wellness tool`
- Line 54: `Do not use Kairos as a substitute` → `Do not use Mind Module as a substitute`
- Line 61: `Some features of Kairos require` → `Some features of Mind Module require`
- Line 74: `All content, features, and functionality of Kairos,` → `All content, features, and functionality of Mind Module,`
- Line 81: `Kairos may integrate with third-party services` → `Mind Module may integrate with third-party services`
- Line 86: `permissions you grant to Kairos` → `permissions you grant to Mind Module`
- Line 96: `Kairos and its affiliates shall not be liable` → `Mind Module and its affiliates shall not be liable`
- Line 129: `support@kairos.me` → `support@mindmodule.me`

### 3. **src/components/Header.tsx** (Line 5)
Replace:
- Line 5: `Kairos` → `Mind Module`

### 4. **src/components/PrivacyDashboard.tsx** (Lines: 133, 251, 336)
Replace:
- Line 133: `https://kairos.app/ref/` → `https://mindmodule.me/ref/`
- Line 251: `Zero data collection by Kairos` → `Zero data collection by Mind Module`
- Line 336: `https://kairos.app/ref/` → `https://mindmodule.me/ref/`

### 5. **src/pages/Refer.tsx** (Lines: 34, 35, 69)
Replace:
- Line 34: `title: 'Kairos'` → `title: 'Mind Module'`
- Line 35: `text: 'Join me on Kairos - Proactive Self Mastery for Peak Performers.'` → `text: 'Join me on Mind Module - Proactive Self Mastery for Peak Performers.'`
- Line 69: `Share Kairos` → `Share Mind Module`

### 6. **src/data/roleplayContent.ts** (Line 153)
Replace:
- Line 153: `creator: 'Kairos'` → `creator: 'Mind Module'`

## Implementation Approach

**Execution Strategy**: Use targeted line replacements to update each file precisely, maintaining code structure and formatting.

**Key Changes**:
1. **Brand Name**: Replace all instances of "Kairos" with "Mind Module"
2. **Domain URLs**: Update `kairos.app` to `mindmodule.me` (used for referral links and sharing)
3. **Contact Emails**: Update `@kairos.me` to `@mindmodule.me`
4. **Enhanced Privacy Disclosure**: Add clarity about Google Calendar `calendar.readonly` access scope (Google requires transparency about what data is accessed)

**Important Notes**:
- The HTML/CSS color references to "kairos" in `tailwind.config.lov.json` are CSS variable names and should NOT be changed (they're internal design tokens, not brand references)
- All changes are surgical—only text content is modified, no structural changes
- After implementation, the app branding will match the OAuth app name ("Mind Module") for verification approval

## Testing Checklist (After Implementation)
- [ ] Visit `/privacy` page and verify "Mind Module" appears throughout and email is `privacy@mindmodule.me`
- [ ] Visit `/terms` page and verify "Mind Module" appears throughout and email is `support@mindmodule.me`
- [ ] Open `/settings` (PrivacyDashboard) and verify referral link shows `mindmodule.me`
- [ ] Visit `/refer` page and verify "Share Mind Module" text appears
- [ ] Verify header displays "Mind Module" instead of "Kairos"
- [ ] Once domain is live at `mindmodule.me`, update Google OAuth redirect URI in edge functions
- [ ] Re-submit Google OAuth verification with updated consent screen

## Post-Implementation Steps (User Action)
1. Once code is deployed and live on `mindmodule.me`, update `FRONTEND_URL` secret to `https://mindmodule.me`
2. Update any calendar-auth edge function redirect URIs if needed
3. Verify Google OAuth flow works with new branding
