// Client-side dimension extraction for DEV_MODE when database dimensions are not populated

export const DIMENSION_PATTERNS = {
  sentiment: {
    positive: ['good', 'great', 'happy', 'proud', 'grateful', 'amazing', 'wonderful', 'excellent', 'accomplished', 'achieved', 'succeeded', 'better', 'improved', 'win', 'won'],
    negative: ['bad', 'sad', 'angry', 'frustrated', 'upset', 'difficult', 'hard', 'struggled', 'failed', 'tough', 'challenging'],
    mixed: ['okay', 'fine', 'mixed', 'some', 'both', 'sometimes'],
  },
  emotion: {
    pride: ['proud', 'accomplished', 'achieved', 'succeeded', 'nailed', 'crushed', 'killed it', 'impressed'],
    relief: ['relief', 'relieved', 'finally', 'whew', 'at last', 'done'],
    gratitude: ['grateful', 'thankful', 'appreciate', 'blessed', 'lucky', 'fortunate'],
    confidence: ['confident', 'capable', 'strong', 'ready', 'certain', 'sure', 'trust'],
    joy: ['joy', 'happy', 'excited', 'thrilled', 'delighted', 'love'],
    calm: ['calm', 'peaceful', 'serene', 'relaxed', 'centered', 'grounded'],
  },
  agency: {
    proactive: ['decided', 'chose', 'initiated', 'started', 'led', 'created', 'built', 'made', 'took initiative', 'proactively'],
    responsive: ['responded', 'handled', 'managed', 'adapted', 'adjusted', 'reacted', 'dealt with'],
    collaborative: ['together', 'team', 'partnered', 'we', 'helped', 'supported', 'collaborated'],
  },
  regulation: {
    regulated: ['calm', 'composed', 'steady', 'controlled', 'breathed', 'paused', 'centered', 'grounded'],
    intentional: ['paused', 'thought', 'considered', 'reflected', 'mindful', 'conscious', 'deliberate'],
    reactive: ['reacted', 'snapped', 'frustrated', 'lost', 'overwhelmed'],
  },
  growth: {
    learning: ['learned', 'realized', 'understood', 'discovered', 'noticed', 'saw', 'insight'],
    breakthrough: ['finally', 'first time', 'overcame', 'breakthrough', 'milestone', 'new', 'never before'],
    mastery: ['mastered', 'expert', 'confident', 'natural', 'easy now', 'got it'],
    resilience: ['bounced back', 'persisted', 'kept going', 'despite', 'anyway', 'still', 'recovered'],
  },
};

export type DimensionType = 'sentiment' | 'emotion' | 'agency' | 'regulation' | 'growth';

export interface ExtractedDimension {
  dimension: DimensionType;
  value: string;
}

export function extractDimensionsFromText(text: string): ExtractedDimension[] {
  const lowerText = text.toLowerCase();
  const dimensions: ExtractedDimension[] = [];
  
  for (const [dimension, categories] of Object.entries(DIMENSION_PATTERNS)) {
    for (const [value, keywords] of Object.entries(categories)) {
      if (keywords.some(k => lowerText.includes(k))) {
        dimensions.push({ dimension: dimension as DimensionType, value });
        break; // Only one per dimension
      }
    }
  }
  
  // Default to positive sentiment for wins (they're accomplishments)
  if (!dimensions.find(d => d.dimension === 'sentiment')) {
    dimensions.push({ dimension: 'sentiment', value: 'positive' });
  }
  
  return dimensions;
}

// Theme extraction for Mind Map - extracts key topics from content
export const THEME_KEYWORDS: Record<string, string[]> = {
  'self-awareness': ['aware', 'realized', 'noticed', 'recognized', 'understood', 'insight', 'clarity'],
  'emotional regulation': ['calm', 'regulated', 'controlled', 'paused', 'breathed', 'centered', 'grounded', 'steady'],
  'stress management': ['stress', 'pressure', 'overwhelmed', 'deadline', 'tension', 'relaxed', 'cope'],
  'focus': ['focused', 'concentrate', 'attention', 'distracted', 'clarity', 'present', 'mindful'],
  'energy': ['energy', 'tired', 'energized', 'drained', 'vitality', 'fatigue', 'rest'],
  'relationships': ['team', 'colleague', 'partner', 'family', 'friend', 'connection', 'together'],
  'communication': ['said', 'told', 'expressed', 'listened', 'conversation', 'discussed', 'shared'],
  'decision making': ['decided', 'chose', 'choice', 'option', 'considered', 'evaluated'],
  'confidence': ['confident', 'believe', 'trust', 'capable', 'ready', 'sure'],
  'resilience': ['bounced', 'recovered', 'persisted', 'despite', 'anyway', 'overcame'],
  'growth': ['learned', 'grew', 'improved', 'progress', 'developed', 'better'],
  'presence': ['present', 'moment', 'now', 'here', 'mindful', 'aware'],
  'gratitude': ['grateful', 'thankful', 'appreciate', 'blessed'],
  'achievement': ['accomplished', 'achieved', 'completed', 'finished', 'done', 'success'],
  'balance': ['balance', 'harmony', 'aligned', 'equilibrium', 'steady'],
};

export function extractThemesFromContent(text: string): string[] {
  const lowerText = text.toLowerCase();
  const themes: string[] = [];
  
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    if (keywords.some(k => lowerText.includes(k))) {
      themes.push(theme);
    }
  }
  
  return themes;
}
