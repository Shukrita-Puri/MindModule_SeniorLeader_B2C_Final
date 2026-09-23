# Project Memory

## Core
- Minimalist Executive UI: Active Calm aesthetics, strict typography, no wellness tropes or human figures.
- Supabase on Lovable Cloud. Proprietary logic (scoring, LLMs) resides strictly in Edge Functions.
- DB is the absolute canonical source of truth for all wearable/readiness data. Fallbacks are forbidden.
- RLS deny-by-default for user data. All writes are handled by Edge Functions via service role.
- Standard time windows: Morning (05-12), Afternoon (12-18), Evening (18-05). Always tied to user timezone.
- Auth0 token session persistence is 30 days. DEV_MODE bypasses Auth0 via headers for local testing.
- A–H categories resolve ONLY via resolveEvent() in _shared/events/resolve-event-category.ts; frontend mirrors src/lib/events/categories.ts.
- Calendar volume/load is factual (deduplicated count, pill vocabulary light/busy/heavy). Never say "no events" when events exist.
- Load is scored filter-first on one list; holidays (home or foreign) never add load; primary_calendar_events merges ALL providers.
- Week-Ahead fires ONLY on the last day of an off-run (last weekend/PTO/holiday/long-weekend day) — never mid-run, never after.
- A pattern may be quoted only through the shared citable-pattern gate (_shared/patterns/pattern-eligibility.ts). No other pattern citation path.

## Memories

- [Shared Citable Pattern Gate](mem://features/patterns/shared-citable-pattern-gate) — one 365-day gate for quoted patterns in nudges/Plan/Brief: 3+ occurrences, latest included, negative, same event type today/tomorrow
- [Week-Ahead Last-Day-Only](mem://features/notifications/week-ahead-last-day-only) — tomorrowIsOffDay guard in evaluateWeekAheadMode; wired through nudges, plan, brief, home cards
- [Calendar Load Truth SSOT](mem://architecture/calendar/load-truth-ssot) — filter-first day-level load, FYI holiday exclusion by feed name, same-slot collapse, all-provider view, holiday framing overlay
- [Single A–H Entry Point](mem://architecture/events/single-a-h-entry-point) — resolveEvent() is the only allowed resolver; legacy shim deleted
- [Frontend Home Rule + Title SSOT](mem://features/content/frontend-home-rule-and-title-ssot) — plan only sources practices visible on the frontend; one canonical name per practice across list, plan, page, deck, DB
- [Deterministic Brief Quality v7.7](mem://features/performance-readiness/deterministic-brief-quality-v7-7) — calendar-load honesty, window-context sourcing, generic-branch copy invariants, validator gating, manual refresh
- [Two-Party Title Inference](mem://architecture/events/two-party-title-inference) — 1:1 from title only; attendee count and duration are never evidence

### Architecture & Security
- [Auth0 Dialogue Scoping](mem://security/auth0-dialogue-message-scoping-standard) — Session-scoped retrieval for messages
- [Mastery Plan Server Derivation](mem://architecture/mastery-plan-server-side-derivation) — Signals derived server-side via Edge Functions
- [Standardized Time Windows](mem://backend/architecture/standardized-time-windows) — 05:00-11:59 Morning, 12:00-17:59 Afternoon, 18:00-04:59 Evening
- [Executive Memory System](mem://architecture/executive-memory-system) — Structured pattern ledger for coach contexts
- [Proprietary Logic Protection](mem://security/proprietary-logic-protection) — Algorithms and prompts hidden in Edge Functions
- [RLS Auth0 Access Protocol](mem://security/rls-auth0-access-protocol) — Deny-by-default RLS relying on Auth0 sub
- [Coach Session Management](mem://architecture/coach-session-lifecycle-management) — Idempotent finalize_coach action
- [Energy State Integrity](mem://architecture/energy-state-data-integrity) — DB is absolute source for readiness inputs
- [Timezone Persistence](mem://backend/auth/timezone-persistence-protocol) — User timezone stored in profiles on app open
- [Check-in Window Assignment](mem://backend/architecture/check-in-window-assignment-protocol) — Assignment driven by local timezone at check-in
- [Auth0 Lifecycle Hardening](mem://auth/auth0-lifecycle-hardening) — Session persistence and retry fallbacks
- [Canonical App State](mem://auth/canonical-app-state-resolver) — Unified resolver for auth, onboarding, subscription
- [Calendar Metric Distinction](mem://architecture/calendar-metric-distinction) — eventCount vs meetingCount usage
- [Context Intelligence Relay](mem://architecture/context-intelligence-relay-standard) — Unified signal array progression
- [Dev Mode Auth Bypass](mem://dev/auth-bypass-logic) — Rules for bypassing auth during development
- [Backend Provider](mem://constraints/backend-provider) — Lovable Cloud Supabase requirement
- [Edge Function Auth Secrets](mem://architecture/edge-function-auth-secrets-priority) — Non-prefixed vs VITE_ fallback
- [Onboarding Completion Protocol](mem://architecture/unified-onboarding-completion-and-routing) — Route guarding and redirection
- [Session Persistence Standard](mem://auth/session-persistence-standard) — 30-day token rotation rules
- [Background Sync Status](mem://backend/infrastructure/background-sync-status-v2) — pg_cron maintenance jobs
- [Coach Intelligence Schema](mem://backend/database/coach-intelligence-schema-standard) — Native Postgres text arrays
- [Edge Function Observability](mem://reliability/edge-function-observability-standard) — Fatal Error Logging wrapper
- [Unified Wearable Contract](mem://architecture/performance-readiness/unified-wearable-contract) — wearableStatus tracking and staleness
- [APNS P8 Key Normalization](mem://infrastructure/apns-p8-key-normalization-protocol) — Parsing logic for push notification keys
- [LLM Resilience Strategy](mem://architecture/llm-provider-resilience-strategy) — Gemini Flash to Claude Sonnet fallback
- [Daily Intelligence Snapshot](mem://architecture/daily-intelligence-snapshot-standard) — compute-daily-intelligence centralized analysis
- [Unified Pattern Store](mem://architecture/unified-pattern-store) — causality_findings.signal_summary as canonical proactive-pattern store
- [Build Daily Context Orchestrator](mem://architecture/signal-engine/build-daily-context-orchestrator) — SSOT contract + null-safety rules for daily_context_snapshot
- [Window Context Split](mem://architecture/signal-engine/window-context-split) — morning/afternoon/evening pure builders + behaviour-snapshot layer shared by Brief, Plan, Nudges
- [Event Taxonomy Learning Loop](mem://architecture/event-taxonomy-learning-loop) — confirmed titles + nightly token promotion read by the single A–H resolver on every surface

### Features: Mastery & Performance
- [Access Gating Strategy](mem://features/subscription/access-gating-strategy) — Trial, pro, and beta bypass rules
- [JIT Queue Logic](mem://features/mastery-plan/jit-queue-logic) — Shared practiceQueue for JIT completion
- [JIT Snooze Protocol](mem://features/mastery-plan/jit-snooze-protocol) — 3-strike snooze rule
- [Mastery Plan Regeneration](mem://features/mastery-plan/regeneration-stability-logic) — Prevents reshuffling for active plans
- [HRV Event Correlation](mem://features/performance-intelligence/hrv-event-correlation-logic) — 30-day wearable and calendar crossover
- [Temporal Context Logic](mem://features/performance-readiness/temporal-context-logic-v2) — Brief formatting by day-of-week
- [Advanced Signal Matrix](mem://features/performance-readiness/advanced-signal-matrix-standard) — Triage for top 5 readiness signals
- [Content Recommendation Weights](mem://features/mastery-plan/content-recommendation-weights) — Practice priority and onboarding tags
- [Deterministic Why Line](mem://features/performance-readiness/deterministic-why-line-logic) — Forward-looking anchor generation
- [Sanctuary Content Baseline](mem://data/sanctuary-content-baseline) — Core 40 executive practices
- [Midday Regeneration Trigger](mem://features/performance-readiness/midday-regeneration-trigger) — Slot 2 adaptation for energy shifts
- [Onboarding Data Relay](mem://features/performance-readiness/onboarding-data-relay-logic) — Immediate personalization usage
- [HR Elevated Proxy](mem://features/wearable/hr-elevated-proxy-logic) — HRV-based proxy for sympathetic dominance
- [Readiness Scoring Weights v3](mem://architecture/readiness-scoring-weights-v3) — MRS v3 two-state (baseline+refined ±15), 4 Mind dims, divergence flags, cold start. Full spec docs/MRS_V3_SPECIFICATION.md
- [Today's 3 Data Fallback](mem://features/performance-readiness/today-three-priorities-data-fallback) — Fallback placeholders for empty library
- [Content Metadata Tagging](mem://backend/database/content-metadata-tagging-standard) — 6 specialized tags for matching
- [Subscription Pricing](mem://features/subscription/pricing-and-upgrade-logic) — Upgrade detection and redirection
- [State Signaling Logic](mem://features/performance-readiness/state-signaling-logic) — Physiological vs cognitive reality
- [Compass Intersection](mem://features/performance-readiness/compass-intersection-intelligence) — Calendar pressure matching
- [Wearable Recovery Override](mem://features/performance-readiness/wearable-recovery-override) — Sustained deficit detection
- [Relevance First Standard](mem://features/performance-readiness/relevance-first-standard) — Rules for event and data reference
- [Mastery Plan Completion](mem://features/mastery-plan/completion-and-navigation-standard) — Atomic completion and pruning
- [JIT Logic Rules](mem://features/mastery-plan/jit-logic) — JIT Deduplication and absorption
- [Data Honesty Standards](mem://features/performance-readiness/data-honesty-standards) — Minimum check-in requirements for AI
- [Module Eligibility Standards](mem://features/mastery-plan/module-eligibility-standards) — Restricts specific practices per slot
- [Smart Nudges Framework](mem://features/notifications/smart-nudges-mvp-framework) — Context-aware push scheduling
- [Incremental Feedback Protocol](mem://features/mastery-plan/incremental-feedback-protocol) — Post-slot completion feedback
- [Atomic Brief Contract](mem://architecture/performance-readiness/atomic-brief-contract) — All-or-nothing LLM brief acceptance
- [Readiness Brief Logic](mem://features/performance-readiness/brief-logic) — 6-step advisory framework
- [Phrase Validation Standard](mem://features/performance-readiness/phrase-validation-standard) — Rejection rules for wellness tropes
- [Today's 3 Priorities Logic](mem://features/mastery-plan/today-three-priorities-logic) — Reasoning visibility and Taupe Tick
- [Per-Priority Queue Contract](mem://features/mastery-plan/per-priority-queue-contract) — Each priority owns its own queue + feedback; player tracker scoped to slot
- [Insights Progress Tab v2](mem://features/insights/progress-tab-v2) — Show-Up calendar above Trajectory; PRS from brief_snapshots (mean first/last 3); confetti at 3/7-day streaks
- [Inline Mindset Reflection Capture](mem://features/mastery-plan/inline-mindset-reflection-capture) — Optional auto-saved textarea on each mindset-protocol step card in the player
- [JIT Selection v2](mem://features/mastery-plan/jit-selection-v2) — Triangulated Immediate/Tactical/Strategic selector; tier weights shift Immediate→Tactical as patterns mature; patterns READ from causality_findings; personal noise excluded; 24h horizon

### Features: Wearables & Integrations
- [HealthKit Wearable Standard](mem://integrations/healthkit/wearable-data-standard) — Sync triggered via iOS native app
- [Wearable Calibration](mem://integrations/wearable/calibration-and-correction-protocol) — 4-tier calibration model for baseline
- [Wearable Database Schema](mem://integrations/wearable/database-schema-standard) — Required columns for wearable queries
- [Stripe Webhook](mem://integrations/stripe/webhook-endpoint) — URL and event handling rules
- [Google Calendar Auth](mem://integrations/google-calendar/auth-resilience) — Edge function JWKS resolution
- [Google Calendar OAuth](mem://integrations/google-calendar/oauth-flow-v2) — Custom redirect URI and header mapping
- [Wearable Connection UX](mem://integrations/wearable/connection-ux-and-persistence-protocol) — Verified-state architecture

### Features: Coach & Onboarding
- [Coach Accountability](mem://features/coach/accountability-extraction) — Pre-scan logic for tracking commitments
- [Coach Win Extraction](mem://features/coach/win-extraction) — Tiny win detection via tool usage
- [Coach Insight Recency](mem://features/coach/insight-recency-model) — Tiered expiration for dashboard inclusion
- [Coach Session Completion](mem://features/coach/session-completion-logic) — Session persistence lifecycle
- [Coach Intelligence Hub](mem://features/coach/intelligence-hub) — STATE -> STORY -> STRATEGY framework
- [Coach Homepage Voice](mem://features/coach/homepage-voice) — Proactive contextual insights rendering
- [App Tour Walkthrough](mem://features/onboarding/app-tour) — sessionStorage tour state handling
- [Coach Prompt Architecture](mem://features/coach/prompt-architecture) — CEO persona and The Vault rules
- [Coach Suppression](mem://features/coach/suppression-standard) — Plan + players strip isCoachCard and never hand off to /coach (forward direction)

### Design & UX Rules
- [Minimalist UI Standard](mem://ux/minimalist-ui-standard) — Executive layout requirements
- [Post-Practice Navigation](mem://ux/rituals/post-practice-navigation) — Redirects to /executive-home
- [Hero Visual System](mem://style/active-calm-visual-language/hero-visual-system-v3) — Nature-true scene mapping to tiers
- [Daily Check-in Mobile UX](mem://ux/rituals/daily-check-in-mobile-optimization) — Bottom 16px CTA placement
- [Button Color Roles](mem://brand/color-palette/button-roles-v3) — Saffron/Orange critical accent
- [Dashboard Navigation](mem://ux/navigation/dashboard-navigation-standard) — Pill-shaped floating bottom bar
- [Check-in Interaction](mem://features/performance-readiness/check-in-interaction-v3) — Single-fold mobile UI design
- [Onboarding Imagery](mem://style/active-calm-visual-language/onboarding-imagery-standard) — B&W woodcut without humans
- [Homepage Layout Order](mem://ux/homepage/layout-order-standard) — Hero -> Brief -> Priorities cascade
- [Design System Fidelity](mem://ux/design-system-fidelity-constraint) — Enforces visual guidelines
- [Reset Studio Aesthetics](mem://brand/reset-studio-visual-system) — 19th-century scientific engraving style
- [Terminology Standard](mem://brand/terminology-standard-v3) — Performance Science terminology vs Wellness
- [Imagery Philosophy](mem://style/active-calm-visual-language/imagery-philosophy) — Active Calm vs Passive Calm
- [Onboarding UI Consistency](mem://features/onboarding/ui-consistency-standard) — High-vantage immersive intro
- [Onboarding Results Report](mem://features/onboarding/results-report-standard) — Horizontal dimension bars
- [Hero Visual Remotion Pipeline](mem://features/hero-visual/remotion-pipeline-logic) — Parametric assembly of elements
- [Inline Pattern Mapping](mem://features/performance-readiness/inline-pattern-mapping) — Subtle textual qualifiers
- [Optimistic Brief Rendering](mem://ux/homepage/optimistic-brief-rendering) — Instant pills with fade-in text
- [Signal Pill System](mem://ui/performance-readiness/signal-pill-system) — Priority order and front/back rendering
- [Cached Render + Silent Verify](mem://ux/loading/cached-render-and-silent-verification) — Skip scripted loaders on revisit; session verification stays invisible
