# Plan & Onboarding Audit — Fixes Summary

**Date:** July 30, 2026  
**Status:** All tasks completed. TypeScript build passes with zero errors.

---

## Part A — Plan Engine Fixes

### 1. Memory Scoring Now Active on All Paths
**The Problem:** The JIT scoring engine had two call paths. The secondary path (used for shadow/tactical evaluation) was calling `selectJitCandidates` without passing the user's memory signals — meaning "never show this event" and "prioritise this event" signals were silently ignored on that path.

**The Fix:** Added `memoryDeltaByEventId` to the secondary call site in `generate-mastery-plan/index.ts`. User memory signals (priority, never, deprioritise) now influence JIT scoring on both paths.

### 2. Smarter Arc Allocation for E-Category Events
**The Problem:** The event phase map treated all Category E (focus/operational) events identically. Routine syncs, learning sessions, and community calls were getting Prepare/Recover arc slots they didn't need — cluttering the plan with unnecessary coaching prompts.

**The Fix:** Added subcategory-level phase overrides in `event-phase-map.ts`. Now:
- **E.deep_work / E.review** → Keep pre + post arcs (protect focus, recover after)
- **E.routine_sync / E.learning / E.community / E.compliance** → No arcs at all

---

## Part C — LinkedIn & Writing Context: MVP Rework

### 3. All Scraping Removed for MVP
**The Problem:** The previous system relied on Firecrawl and Proxycurl to scrape LinkedIn profiles during onboarding. Firecrawl gets blocked by LinkedIn 100% of the time, and Proxycurl has been shut down. This meant the AI profile generator was receiving no LinkedIn context for any user.

**The Fix:** Removed all scraping infrastructure entirely. The `linkedin-profile-scrape` edge function is disabled (kept for future NinjaPear integration). The frontend no longer calls it.

### 4. New Input: PDF Upload + Paste
**The Problem:** Users had no reliable way to provide their LinkedIn context since URL scraping failed.

**The Fix:** Completely rewrote `StageLeadershipContext.tsx`:
- **Card 1 (LinkedIn):** Now a paste textarea ("Paste your LinkedIn About section, current role, or any bio text") + a PDF upload button ("📄 Upload LinkedIn PDF" with iOS instructions).
- **Card 2 (Writing):** Now a paste textarea ("Paste a paragraph from a recent article, interview, or talk") with an optional URL field below for Substack/blog links.
- **Card 3 (Notes):** Unchanged.
- All fields remain optional — users can skip without being blocked by URL validation.

The pasted content goes directly into the AI synthesis pipeline via `freetext_context`, which the LLM already reads. No backend changes needed for the synthesis function.

---

## Part D — Production Blockers

### 5. Stripe Fail-Fast Guard
**The Problem:** When Stripe credentials are missing, payments fail silently with no diagnostic output.

**The Fix:** Added explicit error logging in `stripe-config.ts` when the secret key or webhook secret is missing. Developers and logs will now show exactly which key is missing and what environment variable to set.

> **Action Required:** Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and live price IDs to Supabase Edge Function secrets for production.

### 6. Anthropic → Gemini Automatic Fallback
**The Problem:** Both Claude model constants (SONNET and HAIKU) are pinned to `claude-haiku-4-5-20251001`. If Anthropic credits are exhausted, all AI-powered features (Brief, Coach, Nudges, Insights) fail.

**The Fix:** Added a new `callAIText()` wrapper in `anthropic.ts` that:
- Tries Claude first (existing behavior)
- If the API key is missing or credits are exhausted (401/402/429), automatically falls back to `google/gemini-2.5-flash` via the Lovable AI Gateway
- Existing `callClaudeText` remains unchanged for backward compatibility

---

## Items Already Fixed (Earlier Session)

| Item | Status |
|------|--------|
| profiles.* personality fields written from v8 data | ✅ Done |
| profiles.country / home_country persistence | ✅ Done |
| notification_preferences initialization | ✅ Done |
| /onboarding/subscription in V8_PATHS | ✅ Done |
| Negative cache bug in synthesize-cos-profile | ✅ Done |
| light_routine mode label fix | ✅ Done |
| Board-protect label for Cat A | ✅ Done |

## Deferred Items

| Item | Reason |
|------|--------|
| COS profile email delivery (48h trigger) | No `send-email` edge function exists in the repo |
| Substack scraping | Post-MVP |
| CI grep gates | Low priority |
| APNs notification delivery investigation | Requires deploy-time token audit |

---

## Deploy Checklist

1. Run migration: `20260730181600_linkedin_pdf_base64.sql`
2. Add Stripe live credentials to Supabase secrets
3. Deploy all updated edge functions
4. Test fresh v8 onboarding with PDF upload + paste
5. Verify COS profile generates from pasted content
