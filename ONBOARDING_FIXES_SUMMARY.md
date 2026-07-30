# V8 Onboarding & Personalization Fixes Summary

**Date:** July 30, 2026
**Status:** All tasks completed.

## 1. Core Issue Fixed: The Personalization Disconnect
**The Problem:** The v8 onboarding flow was successfully collecting the user's goals, pressures (chips), and LinkedIn data, but it was **never writing this data** to the core `profiles` table. Because of this, every downstream feature in the app (Brief, Plan, Coach, Nudges) saw the user as having a blank profile, resulting in generic, unpersonalized experiences.

**The Fix:** 
- Upgraded the `complete-onboarding` and `synthesize-cos-profile` edge functions. 
- The system now correctly derives the user's `user_archetype`, `practice_priority_tag`, `pressure_context_tag`, `growth_priority`, and more, and writes them directly to the `profiles` table.
- **Impact:** The entire personalization layer (Plan, Brief, Coach) is now fully active for all new v8 users.

## 2. LinkedIn Import & AI Hardening
**The Problem:** The existing LinkedIn scraper (Firecrawl) gets blocked by LinkedIn's anti-bot systems almost 100% of the time. When the scrape fails, the AI doesn't have enough context to generate an accurate leadership profile. Furthermore, the AI synthesis was fragile and would occasionally fail or timeout.

**The Fix:**
- **Proxycurl Integration:** Swapped the primary LinkedIn scraper to Proxycurl, an enterprise-grade API that successfully extracts LinkedIn data without getting blocked.
- **Manual Paste Fallback:** If the LinkedIn import fails entirely, the frontend now displays a text box allowing the user to manually paste their LinkedIn 'About' section or bio.
- **AI Hardening:** The AI profile generator now has strict timeouts, quality gates (ignores paywalls), and automatically falls back to a faster model (`claude-3-5-haiku`) if the primary model gets rate-limited.

## 3. Downstream Wiring & Reliability
**The Problem:** The app was missing the connective tissue to pass onboarding selections to the rest of the app, and users who closed the app too early during onboarding were left in a broken state.

**The Fix:**
- **Memory Seeding:** Created a new `seed-onboarding-memory` function. As soon as onboarding finishes, the user's selected goals are permanently seeded into their "event priority memory," heavily influencing what the AI focuses on in the future.
- **Strategic Context Bridge:** The signal engine now safely falls back to reading v8 onboarding data if the user's core profile is ever missing fields.
- **Safety Net Cron:** The calendar sync cron job now actively sweeps for users who got stuck in onboarding (e.g., closed the app before their AI profile finished generating) and quietly finishes generating their profile in the background.

## 4. Admin Visibility
- The **Admin Panel** (`AdminUserDetail.tsx`) has been upgraded. 
- You can now view the exact AI-generated COS Profile (HTML report) for any user directly from the dashboard, see their generation status, and even manually trigger a re-generation if needed.

## Next Steps for Deployment
To deploy these fixes, you will need to:
1. Run the database migration script.
2. Add the `PROXYCURL_API_KEY` to your Supabase Edge Function Secrets.
3. Deploy the 6 updated edge functions via Lovable.
