// Dialogue Room - Conversation Flow Analysis Module

import { ConversationFlow } from '../types';
import {
  DEFENSIVE_PATTERNS,
  CURIOSITY_INDICATORS,
  AGREEMENT_INDICATORS
} from './lexicons';

export function analyzeConversationFlow(
  currentMessage: string,
  previousMessage?: string
): ConversationFlow {
  const normalizedText = currentMessage.toLowerCase().replace(/['']/g, "'");
  
  // Count questions asked
  const questionMarks = (currentMessage.match(/\?/g) || []).length;
  const questionWords = ['how', 'what', 'why', 'when', 'where', 'who', 'could you', 'would you', 'can you'];
  const implicitQuestions = questionWords.filter(w => normalizedText.includes(w)).length;
  const questionsAsked = Math.max(questionMarks, Math.floor(implicitQuestions / 2));

  // Detect response type
  let responseType: ConversationFlow['responseType'] = 'elaborate';
  
  const defensiveCount = DEFENSIVE_PATTERNS.filter(p => 
    normalizedText.includes(p.replace(/['']/g, "'"))
  ).length;
  
  const curiosityCount = CURIOSITY_INDICATORS.filter(p =>
    normalizedText.includes(p.replace(/['']/g, "'"))
  ).length;
  
  const agreementCount = AGREEMENT_INDICATORS.filter(p =>
    normalizedText.includes(p.replace(/['']/g, "'"))
  ).length;

  // Short dismissive responses
  if (currentMessage.length < 20 && /^(ok|fine|sure|whatever|i guess|idk)\.?$/i.test(currentMessage.trim())) {
    responseType = 'dismissive';
  } else if (defensiveCount >= 2) {
    responseType = 'defensive';
  } else if (curiosityCount >= 2 || questionsAsked >= 2) {
    responseType = 'curious';
  } else if (agreementCount >= 2) {
    responseType = 'agreement';
  } else if (normalizedText.includes('but') && normalizedText.includes('however')) {
    responseType = 'challenge';
  }

  // Detect topic shift
  let topicShift = false;
  if (previousMessage) {
    const prevWords = new Set(previousMessage.toLowerCase().split(/\s+/).filter(w => w.length > 4));
    const currWords = currentMessage.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const overlap = currWords.filter(w => prevWords.has(w)).length;
    topicShift = overlap < 2 && currWords.length > 5;
  }

  // Detect assumptions
  const assumptionPatterns = [
    /i assume/i, /obviously/i, /clearly/i, /everyone knows/i,
    /its obvious/i, /of course/i, /naturally/i
  ];
  const assumptionsMade = assumptionPatterns
    .filter(p => p.test(currentMessage))
    .map(p => p.source);

  // Detect acknowledgments
  const acknowledgmentPatterns = [
    /thank you/i, /thanks/i, /i appreciate/i, /good point/i,
    /thats helpful/i, /that helps/i, /i see/i
  ];
  const acknowledgementsGiven = acknowledgmentPatterns.some(p => p.test(currentMessage));

  return {
    responseType,
    topicShift,
    questionsAsked,
    assumptionsMade,
    acknowledgementsGiven
  };
}
