# Daily Check-In & Check-In Detail — Full Technical Documentation

> **Last Updated:** 2026-02-25  
> **Status:** Living document — update when architecture changes

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [Full User Flow](#2-full-user-flow)
3. [Frontend Architecture](#3-frontend-architecture)
4. [Backend Architecture](#4-backend-architecture)
5. [Database Design](#5-database-design)
6. [Edge Function Reference](#6-edge-function-reference)
7. [Tag Mapping & Energy Engine](#7-tag-mapping--energy-engine)
8. [Downstream Consumers](#8-downstream-consumers)
9. [Security & RLS](#9-security--rls)
10. [Known Issues & Technical Debt](#10-known-issues--technical-debt)
11. [API Examples](#11-api-examples)
12. [Sequence Diagrams](#12-sequence-diagrams)

---

## 1. Feature Overview

### Purpose
The Daily Check-In captures a user's **emotional and cognitive state** each day. It feeds downstream systems (Inner Readiness scoring, AI Coach context, Smart Nudges, Recommended Plans) with real-time felt-state data.

### Two-Stage Flow
| Stage | Page | What It Captures | DB Columns Updated |
|-------|------|------------------|--------------------|
| **Stage 1** | `DailyCheckIn.tsx` | Emotional outcome (5 options) | `outcome`, `energy_balance`, `state_tags`, `skipped`, `timestamp`, `data_sources` |
| **Stage 2** | `CheckInDetail.tsx` | Clarity (1–5) & Confidence (1–5) | `clarity_level`, `confidence_level` |

### Outcome Options (Stage 1)
| Value | Display Label | Mapped Energy | Default Balance |
|-------|---------------|---------------|-----------------|
| `overwhelmed` | Overwhelmed / Stressed | Excess Fire | 40 |
| `drained` | Low Energy / Drained | Low Fire | 35 |
| `steady` | Okay / Steady | Balanced | 85 |
| `scattered` | Scattered / Unfocused | Excess Air | 50 |
| `focused` | Focused / Energised | Balanced | 85 |

### Clarity & Confidence Labels (Stage 2)
| Score | Clarity Label | Confidence Label |
|-------|---------------|------------------|
| 1 | Foggy | Uncertain |
| 2 | Hazy | Hesitant |
| 3 | Neutral | Neutral |
| 4 | Clear | Steady |
| 5 | Sharp | Certain |

---

## 2. Full User Flow

### Happy Path
```
User opens app
  → Routed to /daily-check-in (if not checked in today)
  → Swipes carousel, taps an outcome card
  → saveCheckin() upserts to daily_checkins via Edge Function
  → localStorage.setItem('dailyCheckIn', {...}) for optimistic UI
  → Navigate to /check-in-detail (with checkinDate in route state)
  → Adjusts clarity & confidence sliders (default: 3)
  → handleSave() calls UPDATE_CLARITY_CONFIDENCE via Edge Function
  → Navigate to /executive-home
```

### Skip Flow
```
User taps "Skip" on /daily-check-in
  → Calls user-events Edge Function with LOG_CHECKIN_SKIP
  → Sets localStorage 'dailyCheckInSkipped'
  → Navigate to /executive-home
  → No record written to daily_checkins
```

### Edge Cases
| Scenario | Current Behavior |
|----------|------------------|
| Rapid double-tap on outcome card | `TouchOptimized` component debounces, but no server-side idempotency beyond upsert |
| User closes app between Stage 1 and Stage 2 | Stage 1 record exists with `clarity_level = NULL`, `confidence_level = NULL` |
| API timeout on save | Error logged to console; UI navigates anyway (silent failure) |
| Clock tampering | `checkin_date` is client-generated UTC; no server-side enforcement |
| Multiple devices | Upsert on `(user_id, checkin_date)` — last write wins |
| Timezone: evening check-in in UTC-8 | Recorded as next day's UTC date |

---

## 3. Frontend Architecture

### File Map

| File | Role |
|------|------|
| `src/pages/DailyCheckIn.tsx` | Stage 1 — outcome selection carousel |
| `src/pages/CheckInDetail.tsx` | Stage 2 — clarity/confidence sliders |
| `src/utils/dailyCheckins.ts` | API layer — `saveCheckin()`, `getTodayCheckin()`, `getCheckins()`, `getCheckinRange()` |
| `src/utils/checkInToTags.ts` | Maps outcomes → energy tags, state tags, recommendation tags |
| `src/utils/energyStateEngine.ts` | Computes composite energy state using check-in + wearable + calendar data |
| `src/components/home/WellnessCard.tsx` | Reads `localStorage.getItem('dailyCheckIn')` for immediate display |
| `src/components/home/DailyRitual.tsx` | Calls `getTodayCheckin()` to determine recommended practices |
| `src/components/home/RecommendedPlan.tsx` | Calls `getTodayCheckin()` for plan calibration |

### State Management
- **Optimistic UI:** `localStorage` key `dailyCheckIn` stores the outcome immediately for same-session use by `WellnessCard`
- **Server State:** TanStack Query with key `['energy-state']` is invalidated after save
- **Route State:** `checkinDate` passed from Stage 1 → Stage 2 via `navigate('/check-in-detail', { state: { checkinDate } })`

### DEV_MODE Branching
Both `dailyCheckins.ts` and `CheckInDetail.tsx` contain `if (DEV_MODE)` branches that bypass the Edge Function and write directly to the database using `DEV_USER.id = 'dev-user-123'`.

---

## 4. Backend Architecture

### Edge Function: `daily-checkins`

**Location:** `supabase/functions/daily-checkins/index.ts`  
**Auth:** Custom Auth0 JWT validation via `authenticateRequest()` from `_shared/auth.ts`  
**Config:** `verify_jwt = false` in `supabase/config.toml` (JWT verified manually)

### Request Flow
```
Client (supabase.functions.invoke)
  → Authorization: Bearer <Auth0 JWT>
  → Body: { action: string, ...params }
  → Edge Function validates JWT → extracts userId
  → Creates service_role Supabase client
  → Executes action against daily_checkins table
  → Returns { data } or { error }
```

### Actions

| Action | Method | Input | DB Operation | Returns |
|--------|--------|-------|-------------|---------|
| `GET_CHECKINS` | Read | `days?: number` (default 30) | SELECT with `gte(checkin_date, N days ago)` | `CheckinData[]` |
| `GET_TODAY_CHECKIN` | Read | — | SELECT where `checkin_date = today` | `CheckinData \| null` |
| `GET_CHECKIN_RANGE` | Read | `startDate, endDate` | SELECT with date range | `CheckinData[]` |
| `SAVE_CHECKIN` | Upsert | `checkinData` object | UPSERT on `(user_id, checkin_date)` | `CheckinData` |
| `UPDATE_CLARITY_CONFIDENCE` | Update | `checkinDate, clarity, confidence` | UPDATE `clarity_level`, `confidence_level` | `CheckinData` |
| `UPDATE_ENERGY_BALANCE` | Update | `checkinDate, energyBalance` | UPDATE `energy_balance` | `CheckinData` |

---

## 5. Database Design

### Table: `daily_checkins`

```sql
CREATE TABLE public.daily_checkins (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id         text        NOT NULL,
  checkin_date    date        NOT NULL,
  outcome         text        NOT NULL,
  energy_balance  integer,                -- 0–100, derived from outcome
  clarity_level   integer,                -- 1–5, set in Stage 2
  confidence_level integer,               -- 1–5, set in Stage 2
  state_tags      text[],                 -- e.g. ['tense', 'excess_fire']
  skipped         boolean     DEFAULT false,
  timestamp       timestamptz NOT NULL,   -- client-generated
  data_sources    jsonb       DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),

  CONSTRAINT daily_checkins_pkey PRIMARY KEY (id),
  CONSTRAINT daily_checkins_user_date_unique UNIQUE (user_id, checkin_date)
);
```

### Indexes
- **Primary Key:** `id` (uuid)
- **Unique Constraint:** `(user_id, checkin_date)` — enforces one check-in per user per day and enables upsert

### Column Details

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | No | `gen_random_uuid()` | Auto-generated PK |
| `user_id` | text | No | — | Auth0 `sub` claim (not FK to auth.users) |
| `checkin_date` | date | No | — | Client-generated: `new Date().toISOString().split('T')[0]` |
| `outcome` | text | No | — | One of: `overwhelmed`, `drained`, `steady`, `scattered`, `focused` |
| `energy_balance` | integer | Yes | — | 0–100, mapped from outcome by `getEnergyStateFromCheckIn()` |
| `clarity_level` | integer | Yes | — | 1–5, set in CheckInDetail |
| `confidence_level` | integer | Yes | — | 1–5, set in CheckInDetail |
| `state_tags` | text[] | Yes | — | Energy/state tags from `mapCheckInToTags()` |
| `skipped` | boolean | Yes | `false` | Currently always `false` (skips don't create records) |
| `timestamp` | timestamptz | No | — | Client-generated ISO string |
| `data_sources` | jsonb | Yes | `'{}'` | e.g. `{ "check_in": true }` |
| `created_at` | timestamptz | No | `now()` | Server-generated |

### Related Table: `checkin_skip_events`

Records when a user explicitly skips the check-in.

```sql
CREATE TABLE public.checkin_skip_events (
  id           uuid    NOT NULL DEFAULT gen_random_uuid(),
  user_id      text    NOT NULL,
  skip_date    date    NOT NULL,
  has_wearable boolean DEFAULT false,
  has_calendar boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);
```

### Related Table: `checkin_tag_definitions`

Reference table mapping tag keys to display names and energy balance ranges.

| Column | Type | Notes |
|--------|------|-------|
| `key` | text PK | e.g. `excess_fire` |
| `display_name` | text | e.g. `Excess Fire` |
| `energy_balance_min` | integer | Lower bound of mapped range |
| `energy_balance_max` | integer | Upper bound of mapped range |
| `mapped_outcome` | text | Links to outcome value |

---

## 6. Edge Function Reference

### `daily-checkins` (Full Source)

**Path:** `supabase/functions/daily-checkins/index.ts`  
**Shared Auth:** `supabase/functions/_shared/auth.ts`

#### Interface
```typescript
interface RequestBody {
  action: 'GET_CHECKINS' | 'GET_TODAY_CHECKIN' | 'SAVE_CHECKIN' 
        | 'GET_CHECKIN_RANGE' | 'UPDATE_CLARITY_CONFIDENCE' 
        | 'UPDATE_ENERGY_BALANCE';
  days?: number;
  startDate?: string;
  endDate?: string;
  checkinDate?: string;
  clarity?: number;
  confidence?: number;
  energyBalance?: number;
  checkinData?: {
    checkin_date: string;
    outcome: string;
    state_tags?: string[];
    energy_balance?: number;
    skipped?: boolean;
    timestamp: string;
    data_sources?: Record<string, unknown>;
  };
}
```

#### Auth Flow
1. `authenticateRequest(req, corsHeaders)` extracts `Authorization: Bearer <token>`
2. Decodes Auth0 JWT, extracts `sub` claim as `userId`
3. Edge Function creates a **service_role** Supabase client (bypasses RLS)
4. All queries filter by `user_id = userId`

#### Error Handling
- Missing required fields → 400 response
- DB errors → caught and returned as 500
- Unknown action → 400 response

---

## 7. Tag Mapping & Energy Engine

### `src/utils/checkInToTags.ts`

Maps check-in outcomes to energy/state/recommendation tags.

#### ⚠️ CRITICAL BUG: Outcome Mismatch

The tag mapping uses **legacy** outcome keys:
```typescript
// Legacy keys in tagMap:
'pause'     → maps to 'tense', EXCESS_FIRE
'power-up'  → maps to 'fatigued', LOW_FIRE
'presence'  → maps to 'scattered', EXCESS_AIR
'calm'      → maps to 'anxious', EXCESS_AIR
'ready'     → maps to 'focused', BALANCED
```

**Current** outcomes from `DailyCheckIn.tsx`:
```typescript
'overwhelmed' | 'drained' | 'steady' | 'scattered' | 'focused'
```

**Result:** Only `'scattered'` partially matches. All other outcomes fall through to the default (`tagMap['pause']`), meaning:
- `overwhelmed` → gets `pause` mapping (accidentally correct)
- `drained` → gets `pause` mapping (wrong — should be `power-up`)
- `steady` → gets `pause` mapping (wrong — should be `ready`)
- `focused` → gets `pause` mapping (wrong — should be `ready`)

### `src/utils/energyStateEngine.ts`

Consumes check-in data alongside wearable/calendar data to compute a composite energy state. Calls `getEnergyStateFromCheckIn(outcome)` which uses the same broken mapping above.

---

## 8. Downstream Consumers

### 8.1 Inner Readiness Score (`compute-inner-readiness` Edge Function)
- Reads `daily_checkins` for the current day
- Uses `outcome`, `clarity_level`, `confidence_level` to compute "Felt State" layer
- Writes to `inner_readiness_scores` table

### 8.2 AI Coach (`coachContextBuilder.ts`)
- Calls `getCheckins(7)` to fetch last 7 days
- Includes check-in history in system prompt context
- Uses pattern data for coaching personalization

### 8.3 Smart Nudges (`smart-nudges` Edge Function)
- Reads today's check-in to determine nudge urgency
- Adjusts notification content based on `outcome` and `energy_balance`

### 8.4 Daily Ritual / Recommended Plan
- `DailyRitual.tsx` and `RecommendedPlan.tsx` call `getTodayCheckin()`
- Use outcome to filter sanctuary content by matching tags
- Feed into `computeEnergyState()` for practice recommendations

### 8.5 WellnessCard (Home Page)
- Reads `localStorage.getItem('dailyCheckIn')` for instant display
- Shows current emotional state on the executive home page

### 8.6 Performance Rhythm Insights
- `performance-rhythm-insights` Edge Function reads check-in range
- Correlates check-in patterns with calendar density and ritual completion

### Data Flow Diagram
```
┌──────────────┐     localStorage      ┌──────────────────┐
│ DailyCheckIn │────────────────────────│  WellnessCard    │
│   (Stage 1)  │                       │  (Home Page)     │
└──────┬───────┘                       └──────────────────┘
       │ saveCheckin()
       ▼
┌──────────────┐   Edge Function    ┌──────────────────┐
│ daily-checkins│──────────────────▶│  daily_checkins   │
│ (SAVE_CHECKIN)│                   │  (DB Table)       │
└──────────────┘                   └────────┬──────────┘
                                            │
       ┌────────────────────────────────────┼──────────────────────┐
       │                                    │                      │
       ▼                                    ▼                      ▼
┌──────────────┐                   ┌──────────────────┐   ┌──────────────┐
│ CheckInDetail │                   │compute-inner-    │   │smart-nudges  │
│  (Stage 2)    │                   │readiness         │   │              │
│ UPDATE_CLARITY│                   └──────────────────┘   └──────────────┘
└──────────────┘                            │
                                            ▼
                                   ┌──────────────────┐
                                   │inner_readiness_  │
                                   │scores (DB)       │
                                   └──────────────────┘
```

---

## 9. Security & RLS

### RLS Policies on `daily_checkins`

| Policy | Command | Expression |
|--------|---------|------------|
| Users can view their own checkins | SELECT | `(auth.uid())::text = user_id` |
| Users can insert their own checkins | INSERT | `(auth.uid())::text = user_id` |
| Service role can manage all | ALL | `auth.role() = 'service_role'` |
| **DEV_MODE:** dev-user-123 can select | SELECT | `user_id = 'dev-user-123'` |
| **DEV_MODE:** dev-user-123 can insert | INSERT | `user_id = 'dev-user-123'` |
| **DEV_MODE:** dev-user-123 can update | UPDATE | `user_id = 'dev-user-123'` |

### Security Notes
- ⚠️ **DEV_MODE policies** are active in production — any anonymous client could write as `dev-user-123`
- ⚠️ **No UPDATE policy** for authenticated users — Stage 2 works only because the Edge Function uses `service_role`
- ⚠️ `timestamp` is client-controlled — no server-side enforcement
- ✅ `verify_jwt = false` is correct since auth is handled manually in the function
- ✅ Unique constraint prevents duplicate daily entries

### RLS on `checkin_skip_events`

| Policy | Command | Expression |
|--------|---------|------------|
| Users can view own | SELECT | `(auth.uid())::text = user_id` |
| Users can insert own | INSERT | `(auth.uid())::text = user_id` |
| Service role can manage all | ALL | `auth.role() = 'service_role'` |

---

## 10. Known Issues & Technical Debt

### Critical
1. **Tag Mapping Mismatch** — `checkInToTags.ts` uses legacy outcomes (`pause`, `power-up`, `ready`, `calm`, `presence`) while the UI sends `overwhelmed`, `drained`, `steady`, `scattered`, `focused`. Most outcomes fall through to default.

2. **DEV_MODE RLS Policies in Production** — Anyone can read/write as `dev-user-123` using the anon key.

3. **UTC Date Gap** — A user in UTC-8 checking in at 10 PM local time gets `checkin_date` = next day in UTC. This breaks "one check-in per day" logic from the user's perspective.

### High
4. **Silent Failures** — Both Stage 1 and Stage 2 navigate away regardless of save success. No toast/error shown to user.

5. **No UPDATE RLS for Users** — If the client tried to update directly (bypassing Edge Function), it would fail. Stage 2 depends entirely on the Edge Function's service_role access.

6. **No Rate Limiting** — The Edge Function has no request throttling.

### Medium
7. **Streak Source Mismatch** — Streaks (in `useStreakTracking.ts`) are calculated from `daily_ritual_completions`, not `daily_checkins`. Check-in completion alone doesn't advance the streak.

8. **No Offline Support** — If the device is offline, `saveCheckin()` silently fails. localStorage write succeeds but DB write is lost.

9. **No Retroactive Check-In** — Users cannot check in for a missed day.

### Low
10. **No Admin Controls** — No admin panel to adjust/override check-ins or streaks.
11. **No Audit Logging** — Check-in modifications are not tracked in `audit_logs`.

---

## 11. API Examples

### Stage 1: Save Check-In

**Request:**
```typescript
await supabase.functions.invoke('daily-checkins', {
  headers: { Authorization: `Bearer ${accessToken}` },
  body: {
    action: 'SAVE_CHECKIN',
    checkinData: {
      checkin_date: '2026-02-25',
      outcome: 'focused',
      skipped: false,
      timestamp: '2026-02-25T09:30:00.000Z',
      data_sources: { check_in: true }
    }
  }
});
```

**Response (200):**
```json
{
  "data": {
    "id": "a1b2c3d4-...",
    "user_id": "auth0|abc123",
    "checkin_date": "2026-02-25",
    "outcome": "focused",
    "energy_balance": null,
    "clarity_level": null,
    "confidence_level": null,
    "state_tags": null,
    "skipped": false,
    "timestamp": "2026-02-25T09:30:00.000Z",
    "data_sources": { "check_in": true },
    "created_at": "2026-02-25T09:30:01.000Z"
  }
}
```

### Stage 2: Update Clarity & Confidence

**Request:**
```typescript
await supabase.functions.invoke('daily-checkins', {
  headers: { Authorization: `Bearer ${accessToken}` },
  body: {
    action: 'UPDATE_CLARITY_CONFIDENCE',
    checkinDate: '2026-02-25',
    clarity: 4,
    confidence: 5
  }
});
```

**Response (200):**
```json
{
  "data": {
    "id": "a1b2c3d4-...",
    "clarity_level": 4,
    "confidence_level": 5,
    "...": "..."
  }
}
```

### Get Today's Check-In

**Request:**
```typescript
await supabase.functions.invoke('daily-checkins', {
  headers: { Authorization: `Bearer ${accessToken}` },
  body: { action: 'GET_TODAY_CHECKIN' }
});
```

### Get Check-In History

**Request:**
```typescript
await supabase.functions.invoke('daily-checkins', {
  headers: { Authorization: `Bearer ${accessToken}` },
  body: { action: 'GET_CHECKINS', days: 30 }
});
```

---

## 12. Sequence Diagrams

### Stage 1: Outcome Selection
```
User          DailyCheckIn.tsx     dailyCheckins.ts    Edge Function       DB
 │                 │                     │                  │                │
 │──tap card──────▶│                     │                  │                │
 │                 │──localStorage.set──▶│                  │                │
 │                 │──saveCheckin()──────▶│                  │                │
 │                 │                     │──invoke()────────▶│                │
 │                 │                     │                  │──UPSERT───────▶│
 │                 │                     │                  │◀──row──────────│
 │                 │                     │◀──{ data }───────│                │
 │                 │──invalidateQueries──│                  │                │
 │                 │──navigate(/detail)─▶│                  │                │
 │◀────────────────│                     │                  │                │
```

### Stage 2: Clarity & Confidence
```
User          CheckInDetail.tsx    Edge Function       DB
 │                 │                  │                │
 │──adjust slider─▶│                  │                │
 │──tap "Continue"▶│                  │                │
 │                 │──invoke()────────▶│                │
 │                 │                  │──UPDATE────────▶│
 │                 │                  │◀──row──────────│
 │                 │◀──{ data }───────│                │
 │                 │──navigate(/home)─│                │
 │◀────────────────│                  │                │
```

---

## Appendix: File Index

| File | Lines | Purpose |
|------|-------|---------|
| `src/pages/DailyCheckIn.tsx` | 284 | Stage 1 UI — outcome carousel |
| `src/pages/CheckInDetail.tsx` | 146 | Stage 2 UI — clarity/confidence sliders |
| `src/utils/dailyCheckins.ts` | 201 | Client API layer for all check-in operations |
| `src/utils/checkInToTags.ts` | 95 | Outcome → tag mapping (⚠️ uses legacy keys) |
| `src/utils/energyStateEngine.ts` | — | Composite energy state computation |
| `supabase/functions/daily-checkins/index.ts` | 211 | Edge Function — all CRUD actions |
| `supabase/functions/_shared/auth.ts` | — | JWT validation shared module |
| `src/components/home/WellnessCard.tsx` | — | Reads localStorage check-in |
| `src/components/home/DailyRitual.tsx` | — | Reads DB check-in for ritual recommendations |
| `src/components/home/RecommendedPlan.tsx` | — | Reads DB check-in for plan calibration |
