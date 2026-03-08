

## Referral System Overhaul: Code-Based Sharing with Native iOS Share Sheet

### Changes Required

**1. Update `generate-referral-link` edge function** — Branded referral code format

- Change code format from `MM{initials}{3chars}` to `MM-{initials}-1MP-{3chars}` (e.g. `MM-SH-1MP-K8X`)
- Store App Store placeholder URL as `referral_link` (column is required/NOT NULL): `https://apps.apple.com/app/mind-module/id123456789`
- Return `referral_code` and stats as before

**2. Fix referral tracking auth bug in `AuthCallback.tsx`**

- The `track-referral-signup` call (line 161) has **no Authorization header** — the edge function requires auth via `authenticateRequest()`, so every call silently fails 401
- Add `Authorization: Bearer ${token}` using `getAccessTokenSilently()` from Auth0 (web flow) or native token

**3. Redesign `Refer.tsx`**

- **Remove** all floating MM logo images (lines 88-92) and sparkle spans (lines 94-100)
- **"Share the Gift" button** replaces "Copy link" — uses `navigator.share()` (Web Share API, supported in Capacitor WKWebView) with corrected copy:
  ```
  I've been using Mind Module — an inner operating system for leaders who operate under sustained pressure. It has been helping me stay regulated under pressure, lead with more clarity and make better decisions when it matters most. Thought you'd find it valuable too. Download it here: https://apps.apple.com/app/mind-module/id123456789 — use my code MM-SH-1MP-K8X
  ```
  - Note: the referred user does NOT get 1 month free — only the referrer does. Copy reflects this correctly.
  - Fallback to `navigator.clipboard.writeText()` if share API unavailable
- **"Your Referral Code"** section replaces "Your Referral Link" — displays the code prominently (large, centered, mono font) instead of a URL
- **Update "How It Works" text**:
  1. "Share your referral code"
  2. "You get 1 month free once they subscribe to Pro (valid for up to 6 months free & this resets every 3 months)"
  3. "You unlock Founding Member badge with first access to new features (locked after first 100 users)"
- **Card styling** — match executive-home JitCarousel pattern: `bg-white/50 backdrop-blur-[16px] border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl` for non-hero cards. Hero keeps its saffron gradient.
- **Stats** — "Share your code to get started!" (not "link")

**4. Deploy updated edge function**

- Redeploy `generate-referral-link` with the new branded code format

### Tracking Architecture (Verified — Already Working)

The system uniquely tracks referrals correctly once the auth bug is fixed:

- `user_referrals` table: maps `user_id` → `referral_code` (1:1)
- `referral_conversions` table: maps `referrer_id` + `referee_id` + `referral_code` with timestamps
- `track-referral-signup` edge function: prevents self-referral, prevents duplicate referee tracking, increments `total_signups`
- `total_conversions` increment would happen when referee subscribes to Pro (payment webhook — not yet implemented but column exists)

### Files Modified
- `supabase/functions/generate-referral-link/index.ts`
- `src/pages/Refer.tsx`
- `src/pages/AuthCallback.tsx`

