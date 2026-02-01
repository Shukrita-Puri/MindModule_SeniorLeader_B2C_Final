
# Simplify Context Connection Page for C-Suite Leaders

## Overview

The current `/onboarding/context-connection` page has too much text and justification. For C-Suite executives, the page should be:
- **Ultra-clean** with generous negative space
- **No over-explanation** - just simple toggle controls
- **Minimal copy** - trust the user understands the value
- **Premium feel** - sleek, confident, not salesy

---

## Current Issues

1. **Too much text**: Value props section with bullet points and statistics feels like a sales pitch
2. **Over-justification**: "Why Our Users Love Integrations" with percentages is unnecessary for executives
3. **Coming Soon card**: Adds clutter without immediate value
4. **Privacy link**: Can be simplified or moved to footer
5. **Two buttons**: "Continue to App" and "Skip for now" are redundant - executives just want to proceed

---

## Proposed Simplified Design

### Visual Structure
```
┌─────────────────────────────────────┐
│                                     │
│                                     │  (generous top padding)
│                                     │
│         Connect Context             │  (clean headline)
│                                     │
│  (subtle one-line description)      │
│                                     │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 📅  Google Calendar     [○] │   │  (simple toggle row)
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ ⌚  Apple Watch          [○] │   │  (simple toggle row - coming soon)
│  └─────────────────────────────┘   │
│                                     │
│                                     │
│         [ Continue ]                │  (single CTA)
│                                     │
│       You can change this later     │  (subtle footer note)
│                                     │
└─────────────────────────────────────┘
```

---

## Implementation Details

### Remove
- "Value Prop Section" with statistics (lines 341-359)
- "Coming Soon Teaser" card (lines 363-368)
- "Skip for now" button (redundant)
- Detailed description text under each integration

### Simplify
- Header: "Connect Context" (short, elegant)
- Subtitle: One brief line, no multi-sentence explanation
- Calendar row: Just icon + "Google Calendar" + toggle
- Apple Watch row: Same format with "Coming Soon" badge (disabled)
- Single "Continue" button
- Move privacy note to subtle footer text

### Updated Code Structure

```tsx
<div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-6">
  <div className="w-full max-w-sm space-y-10">
    
    {/* Header - minimal */}
    <div className="text-center space-y-2">
      <h1 className="text-2xl font-headline font-semibold tracking-tight">
        Connect Context
      </h1>
      <p className="text-sm text-muted-foreground">
        Personalise your experience
      </p>
    </div>

    {/* Integration Toggles - clean rows */}
    <div className="space-y-3">
      
      {/* Google Calendar */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-card border">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-muted-foreground" />
          <span className="font-medium">Google Calendar</span>
        </div>
        <Switch 
          checked={calendarConnected} 
          onCheckedChange={handleToggleCalendar}
          disabled={connecting}
        />
      </div>
      
      {/* Apple Watch - coming soon */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-card/50 border border-dashed">
        <div className="flex items-center gap-3">
          <Watch className="w-5 h-5 text-muted-foreground/50" />
          <span className="font-medium text-muted-foreground/70">Apple Watch</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            Soon
          </span>
        </div>
        <Switch disabled checked={false} />
      </div>
      
    </div>

    {/* Single CTA */}
    <Button onClick={() => handleComplete(false)} className="w-full">
      Continue
    </Button>

    {/* Subtle footer */}
    <p className="text-center text-xs text-muted-foreground/60">
      You can change this anytime in settings
    </p>

  </div>
</div>
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/onboarding/stages/Stage7ContextConnection.tsx` | Remove value props, coming soon card, privacy link, skip button. Simplify to clean toggle rows. Add Apple Watch row (disabled). |

---

## Visual Outcome

A page that feels like:
- **Executive-level minimalism**: No sales copy, no justification
- **Confident design**: Trust the user knows why they're here
- **Generous whitespace**: Premium, uncluttered feel
- **Quick decision**: Two toggles, one button, done

Total content: ~20 words vs current ~100+ words.
