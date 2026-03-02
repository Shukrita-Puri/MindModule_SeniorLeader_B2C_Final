

## Payment Page Redesign Plan

### Pricing Changes
- **Annual**: £24/mo (billed annually at £289/yr) — currently shows £19. Fix to £24/$24 with "billed annually" text like the screenshot reference
- **Monthly**: £29/mo — stays the same
- **Savings badge**: Change from 35% to 17%

### Feature Lists — Three-Tier Display

Replace the current simple feature list with the full tier breakdown the user specified:

**Monthly Pro (£29/mo) — shows when Monthly selected:**
- ✅ Full access: Daily Check-Ins, Recalibrate Studio, Daily Mastery Plan, Outer Readiness Brief, JIT Pre-Event Prep, Tiny Wins, Calendar + Wearable integration, Insights (all 4 cards)
- ✅ Unlimited AI Coach conversations
- ✅ Full AI Insights (all 4 cards with AI observations)
- ✅ Weekly Pattern Summary Email
- ✅ Data Export (CSV)
- ✅ Unlimited History
- ✅ Priority Support

**Annual Pro (£289/yr) — shows when Annual selected:**
- ✅ Everything in Monthly Pro
- ✅ Quarterly Deep-Dive Report (PDF)
- ✅ Early Access to New Features
- Save 17% (2 months free)

### Visual Changes
- **Annual card**: Dark background with **orange/saffron border** (border-2 border-saffron) — already partially done, keep it
- **Monthly card**: Light card with standard border
- **Price display for Annual**: Show `£29` crossed out, then `£24` large, with "/ month" and "£289 billed annually" below

### ROI Section
- Change copy to: *"Daily Check-in for Readiness + Unlimited Coaching + Your Performance Insight + Unlimited Recalibration = 30+ touchpoints/mo. That's less than £1 per session vs £300-£500/per session for executive coaching."*
- Change colour from `text-saffron` to `text-taupe`

### Trust Footer
- Replace "Secure" with "Local First Privacy & End to End Encryption"
- Remove "Cancel anytime" entirely
- Keep Shield icon

### Trial Note
- Keep minimal: "Includes 7-day free trial · Cancel anytime before for no charge"

### Files Modified
| File | Change |
|------|--------|
| `src/pages/onboarding/stages/Stage6Payment.tsx` | Full rewrite of pricing data, feature lists, ROI copy, trust footer |

