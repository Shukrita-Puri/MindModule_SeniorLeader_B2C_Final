// Dialogue Room - Safety Protocol System
// CRITICAL: Safety checks MUST run FIRST before any LLM call

import { SafetyCheckResult, ContextType, CrisisResource } from '../types';

// Context detection patterns
const SCENARIO_INDICATORS = [
  'in this scenario', 'for this roleplay', 'my character', 'in the interview',
  'the persona', 'lets pretend', "let's pretend", 'hypothetically',
  'in this exercise', 'for practice', 'simulating', 'acting as'
];

const PERSONAL_INDICATORS = [
  'i feel', 'i am', "i'm", 'my life', 'i want to', 'i need to',
  'ive been', "i've been", 'i have', 'my family', 'my friends',
  'really happening', 'in real life', 'actually', 'seriously'
];

const DEBATE_INDICATORS = [
  'discussing', 'debate', 'argument for', 'argument against',
  'perspective on', 'analysis of', 'examining', 'critically'
];

interface SafetyCategory {
  id: string;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  explicitTriggers: string[];
  implicitTriggers: string[];
  allowedInScenario: boolean;
  allowedInDebate: boolean;
  ukResources: CrisisResource[];
  usResources: CrisisResource[];
}

const SAFETY_CATEGORIES: SafetyCategory[] = [
  {
    id: 'self_harm',
    severity: 'critical',
    explicitTriggers: [
      'kill myself', 'end my life', 'suicide', 'want to die',
      'hurt myself', 'self harm', 'self-harm', 'cutting myself'
    ],
    implicitTriggers: [
      'no point living', 'better off dead', 'cant go on', "can't go on",
      'ending it all', 'not worth it anymore', 'disappear forever'
    ],
    allowedInScenario: false,
    allowedInDebate: false,
    ukResources: [
      { name: 'Samaritans', phone: '116 123', description: 'Free 24/7 listening service', region: 'UK' },
      { name: 'PAPYRUS (Under 35)', phone: '0800 068 41 41', description: 'Suicide prevention for young people', region: 'UK' },
      { name: 'Emergency Services', phone: '999', description: 'For immediate danger', region: 'UK' }
    ],
    usResources: [
      { name: '988 Suicide & Crisis Lifeline', phone: '988', description: 'Free 24/7 crisis support', region: 'US' },
      { name: 'Crisis Text Line', phone: 'Text HOME to 741741', description: 'Free 24/7 text support', region: 'US' }
    ]
  },
  {
    id: 'harm_to_others',
    severity: 'critical',
    explicitTriggers: [
      'kill someone', 'hurt them', 'attack', 'weapon', 'gun',
      'knife', 'bomb', 'violence against'
    ],
    implicitTriggers: [
      'make them pay', 'they deserve', 'revenge', 'get back at'
    ],
    allowedInScenario: false,
    allowedInDebate: false,
    ukResources: [
      { name: 'Emergency Services', phone: '999', description: 'For immediate danger', region: 'UK' }
    ],
    usResources: [
      { name: 'Emergency Services', phone: '911', description: 'For immediate danger', region: 'US' }
    ]
  },
  {
    id: 'abuse',
    severity: 'high',
    explicitTriggers: [
      'being abused', 'abusing me', 'hits me', 'beats me',
      'sexual abuse', 'molest', 'assault'
    ],
    implicitTriggers: [
      'hurts me at home', 'scared of', 'forces me', 'touches me'
    ],
    allowedInScenario: false,
    allowedInDebate: true,
    ukResources: [
      { name: 'Childline', phone: '0800 1111', description: 'Support for under 19s', region: 'UK' },
      { name: 'NSPCC', phone: '0808 800 5000', description: 'Child protection', region: 'UK' }
    ],
    usResources: [
      { name: 'Childhelp National Hotline', phone: '1-800-422-4453', description: 'Child abuse support', region: 'US' }
    ]
  },
  {
    id: 'eating_disorder',
    severity: 'high',
    explicitTriggers: [
      'anorexia', 'bulimia', 'purging', 'starving myself',
      'binge eating', 'throwing up food'
    ],
    implicitTriggers: [
      'too fat', 'cant eat', "can't eat", 'hate my body', 'not eating'
    ],
    allowedInScenario: false,
    allowedInDebate: true,
    ukResources: [
      { name: 'Beat Eating Disorders', phone: '0808 801 0677', description: 'Eating disorder support', region: 'UK' }
    ],
    usResources: [
      { name: 'NEDA Helpline', phone: '1-800-931-2237', description: 'Eating disorder support', region: 'US' }
    ]
  }
];

function detectContextType(text: string, conversationHistory: string[]): ContextType {
  const fullContext = [...conversationHistory, text].join(' ').toLowerCase();
  
  let scenarioScore = 0;
  let personalScore = 0;
  let debateScore = 0;

  SCENARIO_INDICATORS.forEach(ind => {
    if (fullContext.includes(ind)) scenarioScore += 2;
  });

  PERSONAL_INDICATORS.forEach(ind => {
    if (fullContext.includes(ind)) personalScore += 1;
  });

  DEBATE_INDICATORS.forEach(ind => {
    if (fullContext.includes(ind)) debateScore += 2;
  });

  // Recent messages have higher weight
  const recentText = text.toLowerCase();
  PERSONAL_INDICATORS.forEach(ind => {
    if (recentText.includes(ind)) personalScore += 2;
  });

  if (debateScore > scenarioScore && debateScore > personalScore) return 'debate';
  if (scenarioScore > personalScore) return 'scenario';
  if (personalScore > 3) return 'personal';
  
  return 'unclear';
}

export function runSafetyCheck(
  text: string,
  conversationHistory: string[] = [],
  isInScenario: boolean = true
): SafetyCheckResult {
  const normalizedText = text.toLowerCase();
  const contextType = detectContextType(text, conversationHistory);
  
  // Force personal context if explicit personal indicators are strong
  const effectiveContext = isInScenario ? contextType : 'personal';

  for (const category of SAFETY_CATEGORIES) {
    // Check explicit triggers (always flag)
    for (const trigger of category.explicitTriggers) {
      if (normalizedText.includes(trigger)) {
        // Even in scenario/debate, critical severity is never allowed
        if (category.severity === 'critical') {
          return {
            action: 'resources',
            contextType: effectiveContext,
            category: category.id,
            severity: category.severity,
            message: "I want to make sure you're okay. If you're experiencing these thoughts in real life, please reach out for support.",
            resources: [...category.ukResources], // UK default
            responseGuidance: 'Provide resources immediately. Do not roleplay. Express genuine concern.'
          };
        }

        // For non-critical, check context
        if (effectiveContext === 'personal') {
          return {
            action: 'resources',
            contextType: effectiveContext,
            category: category.id,
            severity: category.severity,
            message: "Thank you for sharing. This sounds like something important to address with proper support.",
            resources: [...category.ukResources],
            responseGuidance: 'Provide resources. Show empathy. Encourage professional help.'
          };
        }

        // In scenario/debate, check if allowed
        if (effectiveContext === 'scenario' && !category.allowedInScenario) {
          return {
            action: 'clarify',
            contextType: effectiveContext,
            category: category.id,
            severity: category.severity,
            message: "I noticed something in what you said. Are you speaking about the scenario, or is this something you're experiencing personally?",
            responseGuidance: 'Request clarification before proceeding.'
          };
        }
      }
    }

    // Check implicit triggers (require clarification in unclear context)
    for (const trigger of category.implicitTriggers) {
      if (normalizedText.includes(trigger)) {
        if (effectiveContext === 'unclear' || effectiveContext === 'personal') {
          return {
            action: 'clarify',
            contextType: effectiveContext,
            category: category.id,
            severity: category.severity,
            message: "I want to make sure I understand correctly. Are you describing a scenario for practice, or is this something you're going through?",
            responseGuidance: 'Seek clarification with warmth. Do not dismiss.'
          };
        }
      }
    }
  }

  // No safety concerns detected
  return {
    action: 'proceed',
    contextType: effectiveContext,
    responseGuidance: 'Continue with normal dialogue flow.'
  };
}
