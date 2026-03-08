

# Plan: Profile Name Fix, Hero Visuals, Connected Data, and Referral System

## 1. Profile Name — Two-Column Approach

### Database Migration
Add `display_name` and `auth_name` columns to `profiles`, backfill from `full_name`.

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name text;
UPDATE profiles SET auth_name = COALESCE(full_name, email), display_name = COALESCE(full_name, email) WHERE auth_name IS NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON profiles(display_name);
```

### Edge Function: `sync-profile/index.ts`
- Write Auth0 name to `auth_name` (always)
- Only set `display_name` on new profiles (check if profile exists first)
- Stop writing to `full_name`
- Return `display_name` and `auth_name` in SELECT

### Edge Function: `update-profile/index.ts`
- Update `display_name` instead of `full_name`
- Return `display_name` in response

### Frontend: `useAuth.tsx`
- Add `display_name` and `auth_name` to `AppUser` interface
- Map `user.name` from `profile.display_name || profile.auth_name || profile.full_name` in all sync/refresh flows (3 places: initial sync, native sync, refreshProfile)

### Frontend: `Profile.tsx`
- Use `user.name` (which now comes from `display_name`) — no change needed since mapping happens in useAuth

### Frontend: `ExecutiveHome.tsx`
- Greeting already uses `user.name` — will automatically show correct name after useAuth fix

---

## 2. Hero Visual — Remove Legacy Bundled Images

### `ExecutiveHome.tsx`
- **Remove** the 5 ES6 asset imports (lines 27-31): `softnessRelease`, `harmonicCalmBowl`, `flowMeditationColorful`, `vibrantFlowStateHero`, `luxuryWatercolorHero`
- **Update `getHeroVisual()`** to return public paths for poster images instead of bundled assets:
  - Use CSS gradient placeholders or lightweight public poster paths: `/all-visuals/posters/homepage/{tier}-{timeOfDay}.jpg`
  - Since we don't have poster images extracted yet, use a simple transparent/gradient approach: return `undefined` so the video loads without a poster flash, or use a single lightweight default
- **Add preload** for default poster via `useEffect`
- The videos are already correctly in `/all-visuals/videos/` with 15 unique files — no video changes needed

Since we can't run ffmpeg to extract poster frames, the simplest effective fix is:
- Remove the bundled image imports entirely
- Change `getHeroVisual()` to return `undefined` (no poster — the video loads fast enough with `autoPlay`)
- OR use a tiny inline CSS gradient overlay that matches the tier color while video loads
- This eliminates ~700KB from the JS bundle and removes the flash of practice images

---

## 3. Connected Data — Read Real Connection Status

### `ConnectedData.tsx`
- Import `useAuth` and `getAuthToken`
- On mount, call an edge function (or use existing `check-calendar-status`) to fetch real connection status
- For calendar: call `check-calendar-status` edge function (already exists) to get `is_active`, `provider`, `last_sync`
- For Oura: query via a similar pattern (existing `oura_connections` table)
- For Apple Watch: check `wearable_data` table for recent entries (existing pattern in `DailyCheckIn.tsx`)
- Show real connected/disconnected status and last sync time
- Wire "Connect" buttons: Calendar → trigger calendar OAuth flow, Oura/Apple Watch → show setup instructions

### New Edge Function: `check-connections-status/index.ts`
Single function that returns status of all 3 data sources for the authenticated user:
- Queries `calendar_connections`, `oura_connections`, `wearable_data`
- Returns `{ calendar: { connected, provider, lastSync }, oura: { connected, lastSync }, appleWatch: { connected, lastSync } }`

---

## 4. Referral System — Full Backend Implementation

### Database Migration
Create two new tables:

```sql
CREATE TABLE user_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
  referral_code text UNIQUE NOT NULL,
  referral_link text NOT NULL,
  total_signups integer DEFAULT 0,
  total_conversions integer DEFAULT 0,
  credited_months integer DEFAULT 0,
  last_reset_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE user_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON user_referrals FOR ALL USING (auth.role() = 'service_role'::text);
CREATE INDEX idx_user_referrals_code ON user_referrals(referral_code);

CREATE TABLE referral_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id text NOT NULL,
  referee_id text NOT NULL UNIQUE,
  referral_code text NOT NULL,
  signed_up_at timestamptz DEFAULT now(),
  converted_to_pro_at timestamptz,
  credited_to_referrer boolean DEFAULT false,
  credited_at timestamptz
);
ALTER TABLE referral_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON referral_conversions FOR ALL USING (auth.role() = 'service_role'::text);
CREATE INDEX idx_referral_conversions_referrer ON referral_conversions(referrer_id);
CREATE INDEX idx_referral_conversions_code ON referral_conversions(referral_code);
```

### New Edge Functions

1. **`generate-referral-link/index.ts`** — Auth0 JWT verified. Generates `MM{initials}{3chars}` code, stores in `user_referrals`, returns link. Idempotent (returns existing if already created).

2. **`track-referral-signup/index.ts`** — Auth0 JWT verified. Called after signup with referral code from localStorage. Records in `referral_conversions`, increments `total_signups`.

### Frontend: `Refer.tsx` → Complete Rewrite
- New copy: "Share the Gift of Inner Mastery" / "Unlock a month free & become a Founding Member"
- How It Works section with 3 bullet points
- Call `generate-referral-link` on mount to get/create referral link
- Display link with copy button (link-only, no separate code display)
- Show stats: "{n} signed up · {n} converted"
- Terms and Conditions modal
- Remove the old referral code card

### New Route: `/join/:code`
- New page `JoinPage.tsx` — stores referral code in localStorage, redirects to `/onboarding`
- Add route in `App.tsx`

### Auth Callback Integration
- After Auth0 signup completes, check `localStorage.getItem('referral_code')`
- If present, call `track-referral-signup` edge function
- Clear localStorage after tracking

---

## Files Changed Summary

| # | File | Action |
|---|---|---|
| 1 | DB migration: `display_name`, `auth_name` columns | Migration |
| 2 | DB migration: `user_referrals`, `referral_conversions` tables | Migration |
| 3 | `supabase/functions/sync-profile/index.ts` | Edit (two-column approach) |
| 4 | `supabase/functions/update-profile/index.ts` | Edit (use display_name) |
| 5 | `src/hooks/useAuth.tsx` | Edit (map display_name) |
| 6 | `src/pages/ExecutiveHome.tsx` | Edit (remove bundled images) |
| 7 | `src/pages/ConnectedData.tsx` | Rewrite (real DB status) |
| 8 | `supabase/functions/check-connections-status/index.ts` | Create |
| 9 | `src/pages/Refer.tsx` | Rewrite (full referral system) |
| 10 | `supabase/functions/generate-referral-link/index.ts` | Create |
| 11 | `supabase/functions/track-referral-signup/index.ts` | Create |
| 12 | `src/pages/JoinPage.tsx` | Create |
| 13 | `src/App.tsx` | Edit (add /join/:code route) |
| 14 | `supabase/config.toml` | Edit (add new functions) |
| 15 | Deploy all new/updated edge functions | Deploy |

