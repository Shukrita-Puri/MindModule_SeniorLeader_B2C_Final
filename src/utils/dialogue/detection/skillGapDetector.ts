// Dialogue Room - Meta-Skill Gap Detection Module

import { SkillGap } from '../types';

interface SkillPattern {
  metaSkill: string;
  subSkill: string;
  cluster: 'self_mastery' | 'social_mastery';
  gapIndicators: string[];
  strengthIndicators: string[];
}

// Self Mastery Cluster
const SELF_MASTERY_PATTERNS: SkillPattern[] = [
  {
    metaSkill: 'emotional_intelligence',
    subSkill: 'emotional_regulation',
    cluster: 'self_mastery',
    gapIndicators: [
      'cant control', "can't control", 'overwhelmed', 'lost my temper',
      'so angry', 'cant help', "can't help", 'just reacted'
    ],
    strengthIndicators: [
      'staying calm', 'managed to', 'kept my composure', 'took a breath',
      'paused before', 'controlled my'
    ]
  },
  {
    metaSkill: 'emotional_intelligence',
    subSkill: 'self_awareness',
    cluster: 'self_mastery',
    gapIndicators: [
      'dont know why', "don't know why", 'not sure what i feel',
      'confused about my', 'no idea why i'
    ],
    strengthIndicators: [
      'i realize', 'i notice', 'im aware', "i'm aware",
      'i recognize in myself', 'reflecting on'
    ]
  },
  {
    metaSkill: 'self_regulation',
    subSkill: 'focus',
    cluster: 'self_mastery',
    gapIndicators: [
      'got distracted', 'lost track', 'cant focus', "can't focus",
      'mind wandered', 'keep forgetting'
    ],
    strengthIndicators: [
      'stayed focused', 'concentrated on', 'kept my attention',
      'prioritized', 'systematically'
    ]
  },
  {
    metaSkill: 'self_regulation',
    subSkill: 'discipline',
    cluster: 'self_mastery',
    gapIndicators: [
      'gave up', 'quit', 'didnt follow through', "didn't follow through",
      'procrastinated', 'put it off'
    ],
    strengthIndicators: [
      'persisted', 'kept going', 'followed through', 'committed to',
      'disciplined myself'
    ]
  },
  {
    metaSkill: 'learning_agility',
    subSkill: 'adaptability_to_feedback',
    cluster: 'self_mastery',
    gapIndicators: [
      'thats not fair', "that's not fair", 'you dont understand',
      "you don't understand", 'but i', 'thats wrong', "that's wrong"
    ],
    strengthIndicators: [
      'good point', 'i hadnt considered', "i hadn't considered",
      'youre right', "you're right", 'i can see', 'thank you for'
    ]
  },
  {
    metaSkill: 'emotional_resilience',
    subSkill: 'stress_management',
    cluster: 'self_mastery',
    gapIndicators: [
      'too much', 'cant handle', "can't handle", 'breaking down',
      'falling apart', 'so stressed'
    ],
    strengthIndicators: [
      'managing', 'coping well', 'handling the pressure',
      'taking it in stride', 'staying grounded'
    ]
  }
];

// Social Mastery Cluster
const SOCIAL_MASTERY_PATTERNS: SkillPattern[] = [
  {
    metaSkill: 'social_intelligence',
    subSkill: 'empathy',
    cluster: 'social_mastery',
    gapIndicators: [
      'dont care', "don't care", 'not my problem', 'whatever',
      'their issue', 'why should i'
    ],
    strengthIndicators: [
      'i understand how', 'must be difficult', 'i can imagine',
      'that sounds', 'i appreciate your'
    ]
  },
  {
    metaSkill: 'social_intelligence',
    subSkill: 'active_listening',
    cluster: 'social_mastery',
    gapIndicators: [
      'wait what', 'sorry what', 'i wasnt listening',
      "i wasn't listening", 'can you repeat'
    ],
    strengthIndicators: [
      'so youre saying', "so you're saying", 'if i understand correctly',
      'what i hear is', 'to summarize'
    ]
  },
  {
    metaSkill: 'communication_excellence',
    subSkill: 'clarity',
    cluster: 'social_mastery',
    gapIndicators: [
      'i mean', 'like', 'sort of', 'kind of', 'you know',
      'basically', 'um', 'uh'
    ],
    strengthIndicators: [
      'specifically', 'precisely', 'to be clear', 'in other words',
      'the key point is'
    ]
  },
  {
    metaSkill: 'communication_excellence',
    subSkill: 'rapport_building',
    cluster: 'social_mastery',
    gapIndicators: [
      'anyway', 'moving on', 'lets just', "let's just",
      'back to my point'
    ],
    strengthIndicators: [
      'thats interesting', "that's interesting", 'i love that',
      'tell me more', 'how did you'
    ]
  },
  {
    metaSkill: 'adaptive_social_navigation',
    subSkill: 'context_reading',
    cluster: 'social_mastery',
    gapIndicators: [
      'is this wrong', 'should i not have', 'was that inappropriate',
      'did i say something'
    ],
    strengthIndicators: [
      'given the context', 'considering', 'appropriate to',
      'in this situation'
    ]
  }
];

const ALL_PATTERNS = [...SELF_MASTERY_PATTERNS, ...SOCIAL_MASTERY_PATTERNS];

export function detectSkillGaps(text: string): { gaps: SkillGap[]; strengths: SkillGap[] } {
  const normalizedText = text.toLowerCase().replace(/['']/g, "'");
  const gaps: SkillGap[] = [];
  const strengths: SkillGap[] = [];

  for (const pattern of ALL_PATTERNS) {
    const gapMatches = pattern.gapIndicators.filter(ind =>
      normalizedText.includes(ind.replace(/['']/g, "'"))
    );
    
    const strengthMatches = pattern.strengthIndicators.filter(ind =>
      normalizedText.includes(ind.replace(/['']/g, "'"))
    );

    if (gapMatches.length > 0) {
      gaps.push({
        metaSkill: pattern.metaSkill,
        subSkill: pattern.subSkill,
        cluster: pattern.cluster,
        confidence: Math.min(0.9, 0.5 + gapMatches.length * 0.2),
        indicators: gapMatches
      });
    }

    if (strengthMatches.length > 0) {
      strengths.push({
        metaSkill: pattern.metaSkill,
        subSkill: pattern.subSkill,
        cluster: pattern.cluster,
        confidence: Math.min(0.9, 0.5 + strengthMatches.length * 0.2),
        indicators: strengthMatches
      });
    }
  }

  return {
    gaps: gaps.sort((a, b) => b.confidence - a.confidence),
    strengths: strengths.sort((a, b) => b.confidence - a.confidence)
  };
}
