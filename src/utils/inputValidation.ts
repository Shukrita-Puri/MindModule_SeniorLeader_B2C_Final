/**
 * Input validation utilities for coach conversation
 * Detects gibberish, keyboard mashing, and low-quality inputs
 */

// Common keyboard mashing patterns
const KEYBOARD_PATTERNS = ['asdf', 'qwer', 'zxcv', 'hjkl', 'jkl', 'fgh', 'ghjk', 'dfgh', 'cvbn', 'bnm'];

// Valid short responses that should not be flagged
const VALID_SHORT_RESPONSES = [
  'ok', 'okay', 'yes', 'no', 'hi', 'hey', 'hello', 'thanks', 'thank you', 'bye', 
  'good', 'bad', 'fine', 'sure', 'nope', 'yep', 'yeah', 'nah', 'hmm', 'hm',
  'idk', "i don't know", 'maybe', 'help', 'please', 'sorry', 'what', 'why', 'how',
  'tired', 'stressed', 'anxious', 'calm', 'ready', 'done', 'stuck', 'lost', 'sad'
];

/**
 * Detects if input is likely gibberish or low-quality
 * @param text - User input text
 * @returns true if the input appears to be gibberish
 */
export const isLikelyGibberish = (text: string): boolean => {
  const trimmed = text.trim().toLowerCase();
  
  // Empty or whitespace only
  if (!trimmed) return true;
  
  // Very short (under 2 characters) unless valid
  if (trimmed.length < 2) return true;
  
  // Check if it's a valid short response
  if (VALID_SHORT_RESPONSES.includes(trimmed)) return false;
  
  // No vowels in longer strings (likely random consonants like "fnfnf", "djkdf")
  const vowelCount = (trimmed.match(/[aeiou]/gi) || []).length;
  if (trimmed.length > 3 && vowelCount === 0) return true;
  
  // Repeated characters (e.g., "aaaa", "hhhh", "jkjkjk")
  if (/(.)\1{2,}/i.test(trimmed)) return true;
  
  // Repeated patterns (e.g., "jkjkjk", "haha" with no other content)
  if (/^(.{1,3})\1{2,}$/i.test(trimmed)) return true;
  
  // Very short non-word inputs (1-2 chars that aren't valid responses)
  if (trimmed.length <= 2 && !/^(ok|no|hi|i|a|so)$/i.test(trimmed)) return true;
  
  // Check for keyboard mashing patterns
  const hasKeyboardPattern = KEYBOARD_PATTERNS.some(pattern => trimmed.includes(pattern));
  if (hasKeyboardPattern && trimmed.length < 10) return true;
  
  // Short inputs (3-4 chars) without vowels or not a real word
  if (trimmed.length <= 4) {
    // Has at least one vowel OR is a known short response
    const hasVowel = vowelCount > 0;
    const isKnownShort = VALID_SHORT_RESPONSES.some(v => trimmed.includes(v));
    if (!hasVowel && !isKnownShort) return true;
  }
  
  return false;
};

/**
 * Gets a friendly message to show when gibberish is detected
 * @returns A gentle prompt asking for clearer input
 */
export const getGibberishPrompt = (): string => {
  const prompts = [
    "I want to make sure I understand you. Could you share what's on your mind?",
    "Take your time. What would be most helpful to talk through?",
    "I'm here when you're ready. What's really going on?",
    "Let's start fresh. What's on your mind right now?",
  ];
  return prompts[Math.floor(Math.random() * prompts.length)];
};
