

# Rewrite Privacy Policy and Terms of Use

## Summary

Both pages need a comprehensive rewrite to accurately reflect the app's actual data practices, feature naming, global compliance requirements, and iOS-native context. The current versions are outdated and incomplete.

## What changes

### 1. `src/pages/Privacy.tsx` — Full rewrite

The new Privacy Policy will be accurate to the codebase and cover:

**Data collected:**
- Account data via Auth0 (Google OAuth): name, email, profile picture. Only `openid`, `profile`, `email` scopes. No Google password stored.
- Onboarding: Inner World Profile assessment responses (role, pressure points, emotional patterns, stress response, recovery preferences, growth priorities)
- Daily check-ins: Emotional & Cognitive Check-In and Clarity & Confidence Check-In data
- Self Mastery Coach: AI conversation history (processed via Google Gemini)
- Recalibrate Studio: practice completion, session duration, effectiveness ratings
- Insights: pattern analytics derived from the above

**Third-party integrations — precise scopes:**
- Google Calendar: `calendar.readonly` only. Collects event title, start/end time, organiser status, attendee count, recurrence flag, location, description, hangout link. Does NOT create, modify, or delete events. OAuth tokens encrypted with AES-256-GCM and stored server-side. Token refresh runs automatically every 15 minutes; data sync every 6 hours.
- Apple Watch (via Apple HealthKit on iOS): HRV (heart rate variability), resting heart rate, sleep analysis (in-bed minutes, asleep minutes, sleep efficiency, deep sleep, REM sleep), activity rings (move/exercise/stand). Data persisted to backend via `persist-wearable-data` edge function. Read-only — no data written back to HealthKit.
- LinkedIn: sharing only (outbound share URL for achievements). No LinkedIn login or data import. No OAuth connection.

**Data architecture:**
- Wearable data (Apple Watch) is collected on-device and synced to encrypted backend storage
- Calendar tokens encrypted with AES-256-GCM
- All transit encrypted via TLS 1.3
- Row-Level Security enforced on all user data tables
- Auth0 for identity management with Google federation

**Payment data:**
- Processed by Stripe. Mind Module does not store card numbers or payment credentials. Stripe handles PCI compliance.
- Subscription plans: Monthly Pro and Annual Pro
- Referral system: referral codes tracked for billing credit attribution only

**Global compliance sections:**
- GDPR (EU/UK) with lawful basis, DPO contact, data subject rights, international transfer safeguards (SCCs)
- CCPA/CPRA (California)
- DIFC/ADGM data protection (MENA)
- PDPA and equivalent (APAC)
- Apple App Store privacy requirements (iOS)
- Age restriction: 18+

**Contact emails:**
- Privacy: privacy@mindmodule.me
- General: contact@mindmodule.me
- Support: support@mindmodule.me

### 2. `src/pages/Terms.tsx` — Full rewrite

Updated Terms of Use covering:

- Correct feature names: Emotional & Cognitive Check-In, Clarity & Confidence Check-In, Recalibrate Studio, Self Mastery Coach, Insights ("Your Inner World")
- iOS app + website dual-platform scope
- Subscription terms: Monthly Pro ($29/mo), Annual Pro ($24/mo billed $289/yr), via Stripe
- Beta access: 30-day expiry, automatic fallback to subscription system
- Referral programme: earn 1 month free per converted referral, max 6 months per 90-day cycle
- AI disclaimer: Self Mastery Coach is AI-powered (Google Gemini), not a licensed professional
- Third-party integration terms (Google Calendar read-only, Apple HealthKit read-only)
- Medical disclaimer
- Intellectual property
- Termination and account deletion
- Governing law (multi-jurisdictional notice)
- Contact emails: termsofuse@mindmodule.me, billing@mindmodule.me, support@mindmodule.me, contact@mindmodule.me

### Files to edit
- `src/pages/Privacy.tsx` — full content rewrite
- `src/pages/Terms.tsx` — full content rewrite

No backend changes. No routing changes. Both pages already exist and are routed.

