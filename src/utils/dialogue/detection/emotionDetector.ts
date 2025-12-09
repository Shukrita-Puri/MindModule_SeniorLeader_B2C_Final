// Dialogue Room - Emotion Detection Module

import { EmotionResult, EmotionType } from '../types';

interface EmotionPattern {
  type: EmotionType;
  keywords: string[];
  phrases: string[];
  weight: number;
}

const EMOTION_PATTERNS: EmotionPattern[] = [
  {
    type: 'frustration',
    keywords: ['frustrated', 'annoying', 'irritating', 'ugh', 'argh'],
    phrases: ['this is frustrating', 'so annoying', 'drives me crazy', 'cant believe'],
    weight: 1.2
  },
  {
    type: 'anxiety',
    keywords: ['worried', 'anxious', 'nervous', 'stressed', 'overwhelmed'],
    phrases: ['what if', 'im worried', 'makes me nervous', 'stressed about'],
    weight: 1.3
  },
  {
    type: 'confidence',
    keywords: ['confident', 'certain', 'sure', 'definitely', 'absolutely'],
    phrases: ['i believe', 'im certain', 'no doubt', 'i know that'],
    weight: 1.0
  },
  {
    type: 'confusion',
    keywords: ['confused', 'unclear', 'lost', 'puzzled', 'unsure'],
    phrases: ['dont understand', 'not sure', 'what do you mean', 'im confused'],
    weight: 1.1
  },
  {
    type: 'enthusiasm',
    keywords: ['excited', 'thrilled', 'eager', 'passionate', 'love'],
    phrases: ['really excited', 'cant wait', 'love this', 'so interesting'],
    weight: 1.0
  },
  {
    type: 'defensiveness',
    keywords: ['defensive', 'attacked', 'unfair', 'blame'],
    phrases: ['thats not fair', 'you misunderstood', 'i never said', 'not my fault'],
    weight: 1.4
  },
  {
    type: 'openness',
    keywords: ['open', 'willing', 'interested', 'curious', 'receptive'],
    phrases: ['tell me more', 'id like to', 'help me understand', 'good point'],
    weight: 1.0
  },
  {
    type: 'fear',
    keywords: ['scared', 'afraid', 'terrified', 'frightened', 'dread'],
    phrases: ['im scared', 'afraid of', 'scares me', 'dreading'],
    weight: 1.3
  },
  {
    type: 'anger',
    keywords: ['angry', 'furious', 'mad', 'livid', 'outraged'],
    phrases: ['makes me angry', 'so mad', 'cant stand', 'sick of'],
    weight: 1.5
  },
  {
    type: 'sadness',
    keywords: ['sad', 'upset', 'disappointed', 'hurt', 'down'],
    phrases: ['feeling down', 'so disappointed', 'it hurts', 'makes me sad'],
    weight: 1.2
  },
  {
    type: 'joy',
    keywords: ['happy', 'joyful', 'delighted', 'pleased', 'glad'],
    phrases: ['so happy', 'makes me smile', 'delighted to', 'glad that'],
    weight: 1.0
  },
  {
    type: 'surprise',
    keywords: ['surprised', 'shocked', 'amazed', 'unexpected', 'wow'],
    phrases: ['didnt expect', 'surprised to', 'never thought', 'caught off guard'],
    weight: 0.9
  }
];

export function detectEmotions(text: string): EmotionResult[] {
  const normalizedText = text.toLowerCase().replace(/['']/g, '');
  const results: EmotionResult[] = [];

  for (const pattern of EMOTION_PATTERNS) {
    let score = 0;
    const indicators: string[] = [];

    // Check keywords
    for (const keyword of pattern.keywords) {
      if (normalizedText.includes(keyword)) {
        score += 1 * pattern.weight;
        indicators.push(keyword);
      }
    }

    // Check phrases (higher weight)
    for (const phrase of pattern.phrases) {
      if (normalizedText.includes(phrase.replace(/['']/g, ''))) {
        score += 2 * pattern.weight;
        indicators.push(phrase);
      }
    }

    if (score > 0) {
      results.push({
        type: pattern.type,
        confidence: Math.min(0.95, score / 5),
        indicators
      });
    }
  }

  // Sort by confidence and return top emotions
  return results
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
}
