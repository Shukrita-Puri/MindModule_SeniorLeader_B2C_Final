// Dialogue Room - Type Definitions

export type EmotionType = 
  | 'joy' | 'sadness' | 'anger' | 'fear' | 'surprise' | 'disgust'
  | 'frustration' | 'anxiety' | 'confidence' | 'confusion' | 'enthusiasm'
  | 'defensiveness' | 'openness';

export type SentimentLabel = 'positive' | 'negative' | 'neutral' | 'mixed';

export type ContextType = 'scenario' | 'personal' | 'debate' | 'academic' | 'unclear';

export type SafetyAction = 'proceed' | 'clarify' | 'resources' | 'block';

export type CoachPersonality = 'supportive' | 'challenging' | 'direct';

export type InterventionType = 'observation' | 'framework' | 'wisdom' | 'challenge' | 'encouragement';

export interface SentimentResult {
  score: number; // -1 to 1
  label: SentimentLabel;
  confidence: number;
  intensity: number; // 0 to 1
}

export interface EmotionResult {
  type: EmotionType;
  confidence: number;
  indicators: string[];
}

export interface EIBehaviors {
  empathy: { detected: boolean; indicators: string[] };
  selfRegulation: { detected: boolean; indicators: string[] };
  perspectiveTaking: { detected: boolean; indicators: string[] };
  reflectiveStatement: { detected: boolean; indicators: string[] };
  escalationPattern: { detected: boolean; level: number; indicators: string[] };
}

export interface SkillGap {
  metaSkill: string;
  subSkill: string;
  cluster: 'self_mastery' | 'social_mastery';
  confidence: number;
  indicators: string[];
}

export interface ConversationFlow {
  responseType: 'elaborate' | 'defensive' | 'dismissive' | 'curious' | 'agreement' | 'challenge';
  topicShift: boolean;
  questionsAsked: number;
  assumptionsMade: string[];
  acknowledgementsGiven: boolean;
}

export interface RiskAssessment {
  escalationRisk: 'low' | 'medium' | 'high';
  interventionUrgency: 'none' | 'low' | 'medium' | 'high';
  riskFactors: string[];
}

export interface CoachingReadiness {
  opennessScore: number; // 0-1
  breakthroughPotential: boolean;
  masteryDemonstrated: string[];
  canIntervene: boolean;
  reasonIfNot?: string;
}

export interface DetectedSignals {
  sentiment: SentimentResult;
  emotions: EmotionResult[];
  eiBehaviors: EIBehaviors;
  skillGaps: SkillGap[];
  skillStrengths: SkillGap[];
  conversationFlow: ConversationFlow;
  riskAssessment: RiskAssessment;
  coachingReadiness: CoachingReadiness;
}

export interface SafetyCheckResult {
  action: SafetyAction;
  contextType: ContextType;
  category?: string;
  severity?: 'critical' | 'high' | 'moderate' | 'low';
  message?: string;
  resources?: CrisisResource[];
  responseGuidance?: string;
}

export interface CrisisResource {
  name: string;
  phone?: string;
  url?: string;
  description: string;
  region: 'UK' | 'US' | 'global';
}

export interface WisdomSource {
  category: 'ancient_wisdom' | 'high_performer' | 'psychology' | 'philosophy';
  quote: string;
  attribution: string;
  context: string;
}

export interface CoachingIntervention {
  type: InterventionType;
  observation: string;
  gapOrStrength: SkillGap;
  framework: string;
  action: string;
  wisdomSource?: WisdomSource;
  coachPersonality: CoachPersonality;
}

export interface DialogueEngineResponse {
  personaResponse: {
    message: string;
    emotion: EmotionType;
    followupQuestion?: string;
  };
  coachingIntervention: CoachingIntervention | null;
  refinedAnalysis: {
    sentimentOverride?: SentimentResult;
    emotionOverride?: EmotionResult[];
    skillGapsRefined: SkillGap[];
  };
  safetyResponse: SafetyCheckResult;
}

export interface SessionContext {
  sessionId: string;
  scenarioId: string;
  personaId: string;
  contextType: ContextType;
  scenarioContext: Record<string, any>;
  coachPersonality: CoachPersonality;
  messageCount: number;
  interventionCount: number;
  conversationHistory: Array<{
    role: 'user' | 'persona' | 'coach';
    content: string;
    timestamp: string;
  }>;
}
