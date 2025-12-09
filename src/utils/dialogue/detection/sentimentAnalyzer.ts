// Dialogue Room - Sentiment Analysis Module

import { SentimentResult } from '../types';
import { POSITIVE_WORDS, NEGATIVE_WORDS, INTENSIFIERS, NEGATORS } from './lexicons';

export function analyzeSentiment(text: string): SentimentResult {
  const words = text.toLowerCase().split(/\s+/);
  let positiveCount = 0;
  let negativeCount = 0;
  let intensifierMultiplier = 1;
  let negationActive = false;

  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^a-z']/g, '');
    
    // Check for intensifiers
    if (INTENSIFIERS.has(word)) {
      intensifierMultiplier = 1.5;
      continue;
    }

    // Check for negators
    if (NEGATORS.has(word)) {
      negationActive = true;
      continue;
    }

    // Score word
    if (POSITIVE_WORDS.has(word)) {
      if (negationActive) {
        negativeCount += intensifierMultiplier;
      } else {
        positiveCount += intensifierMultiplier;
      }
    } else if (NEGATIVE_WORDS.has(word)) {
      if (negationActive) {
        positiveCount += intensifierMultiplier;
      } else {
        negativeCount += intensifierMultiplier;
      }
    }

    // Reset modifiers after scoring
    intensifierMultiplier = 1;
    negationActive = false;
  }

  const total = positiveCount + negativeCount;
  const score = total > 0 ? (positiveCount - negativeCount) / total : 0;
  
  // Calculate intensity based on emotional word density
  const intensity = Math.min(1, total / (words.length * 0.3));

  // Determine label
  let label: SentimentResult['label'];
  if (Math.abs(score) < 0.1) {
    label = total > 0 ? 'mixed' : 'neutral';
  } else if (score > 0) {
    label = 'positive';
  } else {
    label = 'negative';
  }

  // Calculate confidence based on word count and consistency
  const confidence = Math.min(0.95, 0.5 + (total / 10) * 0.45);

  return {
    score: Math.round(score * 100) / 100,
    label,
    confidence: Math.round(confidence * 100) / 100,
    intensity: Math.round(intensity * 100) / 100
  };
}
