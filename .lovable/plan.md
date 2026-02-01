
# Comprehensive Redesign: Tiny Wins Psychological Analysis + Coach UI Transformation

## Overview

This plan addresses two major improvements:
1. **Insights Page - Psychological Dimension Bubbles**: Transform "Your Tiny Wins" from full sentences into color-coded single-word bubbles tracking psychological dimensions
2. **Coach Page - Immersive Card-Based Conversation UI**: Replace ChatGPT-style layout with transparent text hero and centered card-based conversation design

---

## Part 1: Psychological Dimension Analysis for Tiny Wins

### New Analysis Framework

Each tiny win will be analyzed across 5 psychological dimensions, producing single-word or short-phrase labels:

| Dimension | Examples | Bubble Color |
|-----------|----------|--------------|
| **Sentiment** | Positive, Negative, Mixed, Neutral | Green/Red/Gray shades |
| **Emotion (Primary + Secondary)** | Joy, Pride, Relief, Gratitude, Confidence | Warm tones (coral, amber) |
| **Agency / Locus of Control** | Proactive, Responsive, Collaborative, External | Blue/Teal shades |
| **Regulation vs Reactivity** | Regulated, Intentional, Reactive, Impulsive | Purple/Violet shades |
| **Growth Signal** | Learning, Breakthrough, Mastery, Resilience, Letting Go | Saffron/Gold shades |

### Database Schema Enhancement

Add new columns to `tiny_wins` table to store analyzed dimensions:

```sql
ALTER TABLE tiny_wins ADD COLUMN IF NOT EXISTS sentiment TEXT;
ALTER TABLE tiny_wins ADD COLUMN IF NOT EXISTS primary_emotion TEXT;
ALTER TABLE tiny_wins ADD COLUMN IF NOT EXISTS secondary_emotion TEXT;
ALTER TABLE tiny_wins ADD COLUMN IF NOT EXISTS agency_type TEXT;
ALTER TABLE tiny_wins ADD COLUMN IF NOT EXISTS regulation_level TEXT;
ALTER TABLE tiny_wins ADD COLUMN IF NOT EXISTS growth_signal TEXT;
ALTER TABLE tiny_wins ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;
```

### AI Analysis Pipeline

Update `tiny-wins-insights` edge function to:
1. Fetch wins without analysis
2. Use Lovable AI to extract psychological dimensions
3. Store analysis back to database
4. Return aggregated dimension bubbles with counts

Analysis prompt structure:
```text
For this win: "[user's win text]"

Extract:
1. Sentiment (positive/negative/mixed/neutral)
2. Primary emotion (joy/pride/relief/gratitude/confidence/hope/courage)
3. Secondary emotion (optional)
4. Agency type (proactive/responsive/collaborative/supported)
5. Regulation indicator (regulated/intentional/reactive/impulsive)
6. Growth signal (learning/breakthrough/mastery/resilience/letting-go/boundary)
```

### New Component: PsychologicalDimensionBubbles

Create `src/components/insights/PsychologicalDimensionBubbles.tsx`:
- Display single-word bubbles organized by dimension category
- Color-coded by dimension type
- Size based on frequency count
- Similar organic layout to InnerWorldBubbles but with category headers

### Coach Probing Integration

When user submits a tiny win in the Coach integrate flow, the AI should:
1. Acknowledge the win
2. Gently probe for psychological dimensions if not obvious
3. Ask follow-up questions like:
   - "What made you decide to do that?" (Agency)
   - "How did you manage to stay calm?" (Regulation)
   - "What does this tell you about yourself?" (Identity/Growth)

---

## Part 2: Coach Page Redesign

### Current vs. New Design

| Aspect | Current | New |
|--------|---------|-----|
| Background | Solid `bg-background` | Immersive visual with transparent overlay |
| Title | Small header text | Large transparent text that dominates the page |
| Conversation | ChatGPT-style bubbles | Centered card with floating messages |
| Input | Bottom textarea | Centered input inside card |
| Voice-ready | No | Yes - designed for voice toggle |

### Design Reference (Epic Life / 3rd Screenshot)

The conversation UI should feature:
- Full-screen atmospheric background (subtle visual/video)
- Large transparent text title ("Self Mastery Coach")
- Centered glass-morphic conversation card
- Messages displayed within the card (not as separate bubbles)
- Coach messages appear prominently, user responses below
- Input area at bottom of card
- "Switch to voice" / "End session" links below input

### New Layout Structure

```text
+--------------------------------------------------+
|                 [Immersive Visual BG]            |
|                                                  |
|        SELF                                      |
|        MASTERY                                   |
|        COACH    (Large transparent text)         |
|                                                  |
|    +----------------------------------------+    |
|    |                                        |    |
|    |   [Thinking indicator if loading]      |    |
|    |                                        |    |
|    |   "What's on your mind today?"         |    |
|    |           - Coach                      |    |
|    |                                        |    |
|    |   +--------------------------------+   |    |
|    |   | Type your response...         |   |    |
|    |   +--------------------------------+   |    |
|    |                                        |    |
|    |     Switch to voice | End session      |    |
|    |                                        |    |
|    +----------------------------------------+    |
|                                                  |
+--------------------------------------------------+
```

### Voice-Ready Architecture

The card-based design naturally supports voice conversation:
- When in voice mode, show VoiceOrb component in center of card
- Transcription appears in the same message area
- Easy toggle between text and voice input
- Coach responses can be read aloud (TTS-ready)

### Component Refactoring

#### New: CoachConversationCard.tsx
```typescript
interface CoachConversationCardProps {
  messages: Message[];
  isLoading: boolean;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onVoiceToggle?: () => void;
  onEndSession: () => void;
  isVoiceMode?: boolean;
}
```

Features:
- Glass-morphic card with backdrop blur
- Latest coach message displayed prominently
- Scrollable message history (collapsible)
- Protocol cards and wisdom cards render inside card area
- Thinking indicator (animated dots or spinner)

#### Updated: SelfMasteryCoach.tsx
- Replace current layout with new immersive design
- Add transparent text hero behind conversation card
- Integrate CoachConversationCard component
- Keep all existing functionality (protocol cards, wisdom cards, queue)

### Transparent Text Hero

CSS for large transparent text effect:
```css
.coach-hero-text {
  font-size: 15vw;
  font-weight: 800;
  text-transform: uppercase;
  color: transparent;
  -webkit-text-stroke: 1px rgba(255,255,255,0.15);
  letter-spacing: -0.02em;
  line-height: 0.9;
  position: absolute;
  z-index: 0;
}
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/insights/PsychologicalDimensionBubbles.tsx` | New bubble component for win dimensions |
| `src/components/coach/CoachConversationCard.tsx` | Centered conversation card UI |
| `src/components/coach/CoachHeroBackground.tsx` | Immersive background with transparent text |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/SelfMasteryCoach.tsx` | Complete layout redesign to use new components |
| `src/pages/Insights.tsx` | Replace InnerWorldBubbles for tiny wins with PsychologicalDimensionBubbles |
| `supabase/functions/tiny-wins-insights/index.ts` | Add psychological dimension extraction |
| `supabase/migrations/` | Add dimension columns to tiny_wins table |
| `src/hooks/useCoachConversation.ts` | Potentially add probing prompts for win analysis |

---

## Technical Implementation Details

### Psychological Dimension Detection (Client-Side Fallback)

For DEV_MODE or when AI is unavailable, use keyword-based detection:

```typescript
const DIMENSION_PATTERNS = {
  agency: {
    proactive: ['decided', 'chose', 'initiated', 'started', 'led'],
    responsive: ['responded', 'handled', 'managed', 'adapted'],
    collaborative: ['together', 'team', 'asked for', 'partnered'],
  },
  regulation: {
    regulated: ['calm', 'composed', 'steady', 'controlled', 'breathed'],
    intentional: ['paused', 'thought', 'considered', 'reflected'],
    reactive: ['reacted', 'snapped', 'immediately', 'impulsively'],
  },
  growth: {
    learning: ['learned', 'realized', 'understood', 'discovered'],
    breakthrough: ['finally', 'first time', 'breakthrough', 'overcame'],
    mastery: ['natural', 'effortless', 'automatic', 'second nature'],
    resilience: ['bounced back', 'recovered', 'persisted', 'kept going'],
    boundary: ['said no', 'protected', 'declined', 'limited'],
  }
};
```

### Bubble Color Scheme

```typescript
const DIMENSION_COLORS = {
  sentiment: {
    positive: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    negative: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    mixed: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    neutral: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  },
  emotion: 'bg-coral-500/20 text-coral-400 border-coral-500/30',
  agency: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  regulation: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  growth: 'bg-saffron/20 text-saffron border-saffron/30',
};
```

---

## Expected Outcomes

1. **Insights Page**: "Your Tiny Wins" section displays color-coded single-word bubbles like "Pride", "Proactive", "Regulated", "Learning" instead of full sentences
2. **Coach Page**: Immersive full-screen experience with transparent hero text and centered glass-morphic conversation card
3. **Voice-Ready**: UI architecture supports future voice conversation toggle
4. **Coach Probing**: AI naturally asks follow-up questions to extract psychological dimensions from wins

---

## Implementation Priority

1. **Phase 1**: Database migration + dimension extraction in edge function
2. **Phase 2**: PsychologicalDimensionBubbles component + Insights integration
3. **Phase 3**: CoachConversationCard + CoachHeroBackground components
4. **Phase 4**: SelfMasteryCoach.tsx layout refactor
5. **Phase 5**: Coach probing prompts for dimension extraction

---

## Visual References Applied

- **Screenshot 1 (Mindsera)**: Organic bubble cluster with single-word emotions and counts - applied to PsychologicalDimensionBubbles
- **Screenshot 2 (Epic Life)**: Full-screen visual with centered glass card - applied to Coach hero and conversation card
- **Screenshot 3 (Classmate)**: Centered conversation UI with prominent messages and text input - applied to CoachConversationCard layout
