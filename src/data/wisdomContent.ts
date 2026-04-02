/**
 * Wisdom Content Registry
 * Mental models, frameworks, and wisdom quotes from elite performance domains
 * Used by the Self Mastery Coach for embedded wisdom cards
 */

export interface WisdomEntry {
  quote: string;
  attribution: string;
  context?: string;
}

export const wisdomContent: Record<string, WisdomEntry> = {
  // Aviation & Military
  'aviation:slow-is-smooth': {
    quote: "Slow is smooth, smooth is fast.",
    attribution: "Aviation & Special Operations",
    context: "Under pressure, deliberate action outperforms rushed reaction."
  },
  'special-ops:control-dichotomy': {
    quote: "What can I control? What can I not? Act only on the first.",
    attribution: "Military Decision Framework"
  },
  'aviation:aviate-navigate-communicate': {
    quote: "Aviate, navigate, communicate – in that order.",
    attribution: "Pilot Emergency Protocol",
    context: "In crisis, stabilize first, orient second, communicate last."
  },
  
  // Medicine & Emergency Response
  'medicine:stabilize-first': {
    quote: "First, stabilize – then act.",
    attribution: "Emergency Medicine"
  },
  'medicine:triage-clarity': {
    quote: "Not everything urgent is important. Not everything important is urgent.",
    attribution: "Triage Principle"
  },
  
  // Diplomacy & Leadership
  'diplomacy:role-not-emotion': {
    quote: "Play the role, not the emotion.",
    attribution: "Diplomatic Corps"
  },
  'leadership:intentional-over-reactional': {
    quote: "Speed matters, but direction matters more.",
    attribution: "2026 Leadership Imperative"
  },
  'leadership:judgment-not-compliance': {
    quote: "Trust, built on ethical judgment, is the new competitive advantage.",
    attribution: "2026 Leadership Imperative"
  },
  'leadership:human-edge': {
    quote: "AI raises the bar on human leadership – presence, judgment, connection.",
    attribution: "2026 Leadership Imperative"
  },
  
  // Elite Sport
  'sport:one-clean-action': {
    quote: "One clean action beats ten reactive ones.",
    attribution: "Elite Sport Psychology"
  },
  'sport:process-over-outcome': {
    quote: "Control the process. Release the outcome.",
    attribution: "Championship Mindset"
  },
  'sport:pressure-is-privilege': {
    quote: "Pressure is a privilege – it means the moment matters.",
    attribution: "Billie Jean King"
  },
  
  // Stoic Philosophy
  'stoic:control-dichotomy': {
    quote: "Some things are within our power, and some things are not.",
    attribution: "Epictetus"
  },
  'stoic:present-moment': {
    quote: "You have power over your mind – not outside events. Realize this, and you will find strength.",
    attribution: "Marcus Aurelius"
  },
  'stoic:obstacle-is-way': {
    quote: "The impediment to action advances action. What stands in the way becomes the way.",
    attribution: "Marcus Aurelius"
  },
  'stoic:memento-mori': {
    quote: "Let us prepare our minds as if we'd come to the very end of life.",
    attribution: "Seneca"
  },
  
  // Eastern Philosophy
  'zen:beginner-mind': {
    quote: "In the beginner's mind there are many possibilities, in the expert's mind there are few.",
    attribution: "Shunryu Suzuki"
  },
  'zen:present-attention': {
    quote: "When walking, walk. When eating, eat.",
    attribution: "Zen Proverb"
  },
  'tao:wu-wei': {
    quote: "Nature does not hurry, yet everything is accomplished.",
    attribution: "Lao Tzu"
  },
  'samurai:fudoshin': {
    quote: "The mind must always be in the state of flowing, for when it stops anywhere, that means the flow is interrupted.",
    attribution: "Takuan Sōhō"
  },
  
  // Modern Performance
  'performance:compound-effect': {
    quote: "Small daily improvements over time lead to stunning results.",
    attribution: "Robin Sharma"
  },
  'performance:clarity-before-action': {
    quote: "Clarity precedes mastery. Get clear first.",
    attribution: "Robin Sharma"
  },
  'performance:energy-management': {
    quote: "Manage your energy, not just your time.",
    attribution: "Jim Loehr"
  },
  
  // Neuroscience & Psychology
  'neuro:name-to-tame': {
    quote: "Name it to tame it.",
    attribution: "Dan Siegel",
    context: "Labeling emotions reduces their intensity."
  },
  'neuro:pause-respond': {
    quote: "Between stimulus and response there is a space. In that space is our power to choose.",
    attribution: "Viktor Frankl"
  }
};

/**
 * Get wisdom content by key
 */
export function getWisdom(key: string): WisdomEntry | null {
  return wisdomContent[key] || null;
}

/**
 * Get wisdom by category and specific key
 */
export function getWisdomByParts(category: string, specificKey: string): WisdomEntry | null {
  const fullKey = `${category}:${specificKey}`;
  return wisdomContent[fullKey] || null;
}

/**
 * Get all wisdom entries for a category
 */
export function getWisdomByCategory(category: string): Record<string, WisdomEntry> {
  const result: Record<string, WisdomEntry> = {};
  for (const [key, entry] of Object.entries(wisdomContent)) {
    if (key.startsWith(`${category}:`)) {
      result[key] = entry;
    }
  }
  return result;
}
