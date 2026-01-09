// Inner World Archetypes - Self Mastery Profiles
import { InnerWorldScores, InnerWorldProfile, DIMENSION_LABELS } from './innerWorldScoring';

export interface InnerWorldArchetype {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  percentile: string;
  unlockStatement: string;
  recommendedPractices: string[];
  coachConversationStarter: string;
}

export interface ArchetypeInsights {
  patternRevelations: string[];
  primaryFocus: string;
  expectedOutcomes: string[];
  timeline: string;
  coachPrompt: string;
}

export function determineArchetype(profile: InnerWorldProfile): InnerWorldArchetype {
  const { scores, overallScore, primaryStrength, primaryGrowthArea } = profile;
  
  // Check for balanced profile (all scores within 15 points of each other)
  const scoreValues = Object.values(scores);
  const maxScore = Math.max(...scoreValues);
  const minScore = Math.min(...scoreValues);
  const isBalanced = (maxScore - minScore) <= 15;

  // Elite performers
  if (overallScore >= 85) {
    return {
      id: 'grounded_master',
      title: 'The Grounded Master',
      subtitle: 'Inner World Mastery',
      description: 'You\'ve developed exceptional self-mastery. Your ability to stay centered under pressure, recognize emotional patterns, and recover quickly sets you apart. You naturally embody the calm presence that others look to in high-stakes moments.',
      percentile: 'top 5%',
      unlockStatement: 'Your challenge now is refinement and teaching others—deepening your practice while becoming a model for those around you.',
      recommendedPractices: ['Advanced presence protocols', 'Leadership energy practices', 'Mastery integration'],
      coachConversationStarter: 'As someone with strong foundations, where do you feel the edge of your growth now lies?',
    };
  }

  // Balanced profile
  if (isBalanced && overallScore >= 60) {
    return {
      id: 'balanced_navigator',
      title: 'The Balanced Navigator',
      subtitle: 'Harmonized Inner World',
      description: 'You show consistent capability across all dimensions of self-mastery. This balanced foundation is rare—most people have pronounced strengths and gaps. Your even development creates a stable platform for accelerated growth.',
      percentile: 'top 20%',
      unlockStatement: 'With your balanced foundation, focused practice in any area will create amplified results across all dimensions.',
      recommendedPractices: ['Integration practices', 'Flow state protocols', 'Holistic energy management'],
      coachConversationStarter: 'With your balanced profile, what aspect of your inner world would feel most impactful to deepen first?',
    };
  }

  // High emotional awareness + high stability = Aware Leader
  if (scores.emotionalAwareness >= 70 && scores.innerStability >= 70) {
    return {
      id: 'aware_leader',
      title: 'The Aware Leader',
      subtitle: 'Emotional Intelligence & Presence',
      description: 'You combine sharp emotional awareness with natural groundedness. This rare combination means you can read situations accurately while maintaining your center. You\'re likely the person others turn to when tensions run high.',
      percentile: 'top 15%',
      unlockStatement: 'Channel your awareness into strategic pausing—the moment between stimulus and response is where your influence multiplies.',
      recommendedPractices: ['Presence rituals', 'Emotional mastery protocols', 'Pause practices'],
      coachConversationStarter: 'Your emotional awareness is a strength. When does this awareness feel most valuable, and when does it feel heavy?',
    };
  }

  // High resilience + high recovery = Resilient Performer
  if (scores.stressResilience >= 70 && scores.recoveryCapacity >= 65) {
    return {
      id: 'resilient_performer',
      title: 'The Resilient Performer',
      subtitle: 'Bounce-Back Strength',
      description: 'You have an impressive ability to handle pressure and recover quickly. Where others accumulate stress, you process and release it. This resilience is your superpower—but it can also mask when you need to slow down.',
      percentile: 'top 18%',
      unlockStatement: 'Your resilience lets you sustain high performance. The key is ensuring it doesn\'t become a way to avoid necessary rest.',
      recommendedPractices: ['Sustainable performance protocols', 'Recovery optimization', 'Energy renewal practices'],
      coachConversationStarter: 'Your recovery capacity is strong. I\'m curious—do you sometimes use it to push through when pausing might serve you better?',
    };
  }

  // High clarity = Clear Thinker
  if (scores.mentalClarity >= 75) {
    return {
      id: 'clear_thinker',
      title: 'The Clear Thinker',
      subtitle: 'Cognitive Excellence',
      description: 'Your ability to maintain mental clarity under pressure is exceptional. When others get foggy or overwhelmed, you can cut through complexity and prioritize what matters. This is a critical leadership capability.',
      percentile: 'top 15%',
      unlockStatement: 'Your clarity is a gift. The growth edge is ensuring your clear thinking stays connected to emotional wisdom.',
      recommendedPractices: ['Focus protocols', 'Cognitive reset techniques', 'Decision clarity practices'],
      coachConversationStarter: 'Your mental clarity is strong. Does that sometimes create distance from the emotional undercurrents in a situation?',
    };
  }

  // Low recovery capacity = Intensity Driver
  if (scores.recoveryCapacity < 45) {
    return {
      id: 'intensity_driver',
      title: 'The Intensity Driver',
      subtitle: 'High Output, Recovery Needed',
      description: 'You operate at high intensity and likely accomplish a great deal. However, your recovery systems are signaling that this pace isn\'t sustainable. You\'re running a performance debt that compounds over time.',
      percentile: 'top 40%',
      unlockStatement: 'Your capacity for output is clear. The unlock is building recovery rituals that match your intensity—this isn\'t slowing down, it\'s strategic recharging.',
      recommendedPractices: ['Micro-recovery protocols', 'Energy renewal rituals', 'Sustainable pace practices'],
      coachConversationStarter: 'I see signs of running on empty. What would it mean to match your intensity with equally intentional recovery?',
    };
  }

  // Low stress resilience or inner stability = Foundation Builder
  if (scores.stressResilience < 50 || scores.innerStability < 50) {
    return {
      id: 'foundation_builder',
      title: 'The Foundation Builder',
      subtitle: 'Building Core Stability',
      description: 'You\'re at the beginning of a powerful journey. Your responses show you\'re ready to build the foundational skills of self-mastery—the ability to pause, ground, and respond rather than react. These are teachable skills.',
      percentile: 'top 60%',
      unlockStatement: 'Every elite performer started where you are. The difference is they committed to consistent practice. Your path is clear.',
      recommendedPractices: ['Grounding fundamentals', 'Pause & respond protocols', 'Stress inoculation basics'],
      coachConversationStarter: 'Building foundations is powerful work. What moment recently showed you the value of being able to pause before reacting?',
    };
  }

  // Default: Growth Ready
  return {
    id: 'growth_ready',
    title: 'The Growth Ready',
    subtitle: 'Poised for Development',
    description: `You show moderate capability with clear patterns. Your ${DIMENSION_LABELS[primaryStrength]} is your strongest dimension, while ${DIMENSION_LABELS[primaryGrowthArea]} offers the most room for growth. This clarity is valuable—you know where to focus.`,
    percentile: 'top 35%',
    unlockStatement: `Focus your practice on ${DIMENSION_LABELS[primaryGrowthArea]}. Research shows targeted practice in your weakest area creates the fastest overall improvement.`,
    recommendedPractices: ['Targeted skill building', 'Progressive challenge protocols', 'Strength leveraging practices'],
    coachConversationStarter: `Your pattern shows ${DIMENSION_LABELS[primaryGrowthArea]} as an opportunity. What situations trigger challenges in that area?`,
  };
}

export function getArchetypeInsights(
  archetype: InnerWorldArchetype,
  profile: InnerWorldProfile
): ArchetypeInsights {
  const { scores, primaryGrowthArea, primaryStrength } = profile;
  
  // Generate pattern revelations based on scores
  const patternRevelations: string[] = [];
  
  if (scores.emotionalAwareness < 50) {
    patternRevelations.push('Your responses suggest emotions often surface after the fact, which can lead to reactive decisions in high-stakes moments.');
  } else if (scores.emotionalAwareness >= 75) {
    patternRevelations.push('You have strong emotional awareness—you can name what you\'re feeling in the moment, which is foundational to self-regulation.');
  }
  
  if (scores.stressResilience < 50) {
    patternRevelations.push('Under pressure, you may react before fully processing, or freeze when quick action is needed. This is a pattern that responds well to practice.');
  } else if (scores.stressResilience >= 75) {
    patternRevelations.push('You demonstrate strong capacity to stay grounded under pressure—a key differentiator in high-stakes leadership moments.');
  }
  
  if (scores.recoveryCapacity < 45) {
    patternRevelations.push('Your recovery systems are strained. Fatigue may be accumulating faster than you realize, affecting decision quality and presence.');
  } else if (scores.recoveryCapacity >= 75) {
    patternRevelations.push('You bounce back efficiently from demanding periods—this recovery capacity is a competitive advantage that prevents burnout.');
  }
  
  if (scores.mentalClarity < 50) {
    patternRevelations.push('Cognitive load may be affecting your ability to prioritize clearly. Brain fog or overwhelm during busy periods signals an opportunity.');
  } else if (scores.mentalClarity >= 75) {
    patternRevelations.push('You maintain mental clarity even when juggling multiple priorities—a rare ability that serves leadership demands well.');
  }
  
  if (scores.innerStability < 50) {
    patternRevelations.push('Staying grounded before reacting may be a challenge. The pause between stimulus and response is where self-mastery lives.');
  } else if (scores.innerStability >= 75) {
    patternRevelations.push('You have natural inner stability—the ability to stay calm and grounded is your anchor in turbulent moments.');
  }
  
  // Ensure at least 2 revelations
  if (patternRevelations.length < 2) {
    patternRevelations.push(`Your ${DIMENSION_LABELS[primaryStrength]} provides a solid foundation to build upon.`);
    patternRevelations.push(`Focused development in ${DIMENSION_LABELS[primaryGrowthArea]} will create the most significant shift.`);
  }

  // Generate expected outcomes based on growth area
  const expectedOutcomes = getExpectedOutcomes(primaryGrowthArea);
  
  return {
    patternRevelations: patternRevelations.slice(0, 3),
    primaryFocus: DIMENSION_LABELS[primaryGrowthArea],
    expectedOutcomes,
    timeline: 'Research shows measurable improvement in 3-4 weeks with consistent practice (3-4 sessions/week). Significant transformation occurs in 8-12 weeks.',
    coachPrompt: archetype.coachConversationStarter,
  };
}

function getExpectedOutcomes(growthArea: keyof InnerWorldScores): string[] {
  const outcomes: Record<keyof InnerWorldScores, string[]> = {
    emotionalAwareness: [
      'Recognize emotional patterns before they drive behavior',
      'Name feelings in real-time during high-stakes moments',
      'Use emotional data to inform better decisions',
    ],
    stressResilience: [
      'Stay grounded when pressure intensifies',
      'Respond thoughtfully instead of reacting impulsively',
      'Maintain presence during conflict or crisis',
    ],
    recoveryCapacity: [
      'Bounce back faster after demanding periods',
      'Prevent fatigue accumulation throughout the week',
      'Sustain performance without burning out',
    ],
    mentalClarity: [
      'Cut through noise to prioritize what matters',
      'Maintain focus during cognitive overload',
      'Make clear decisions when everything feels urgent',
    ],
    innerStability: [
      'Create space between stimulus and response',
      'Stay calm and centered in turbulent moments',
      'Project groundedness that steadies others',
    ],
  };
  
  return outcomes[growthArea];
}

// Get recommended content based on archetype
export function getArchetypeRecommendations(archetype: InnerWorldArchetype): {
  rituals: string[];
  practices: string[];
  coachTopics: string[];
} {
  const baseRecommendations = {
    rituals: archetype.recommendedPractices,
    practices: [],
    coachTopics: [],
  };

  switch (archetype.id) {
    case 'grounded_master':
      return {
        rituals: ['Mastery meditation', 'Advanced breathwork', 'Integration protocols'],
        practices: ['Leadership presence', 'Energy transmission', 'Wisdom integration'],
        coachTopics: ['Mastery refinement', 'Teaching and modeling', 'Edge exploration'],
      };
    case 'intensity_driver':
      return {
        rituals: ['Micro-recovery breaks', 'Energy renewal rituals', 'Sustainable pace protocols'],
        practices: ['Recovery optimization', 'Stress release', 'Burnout prevention'],
        coachTopics: ['Sustainable performance', 'Recovery rituals', 'Energy management'],
      };
    case 'foundation_builder':
      return {
        rituals: ['Grounding basics', 'Pause practices', 'Breath awareness'],
        practices: ['Stress response training', 'Emotional naming', 'Inner anchor building'],
        coachTopics: ['Building foundations', 'Pause power', 'Stress patterns'],
      };
    default:
      return {
        rituals: archetype.recommendedPractices,
        practices: ['Targeted skill building', 'Progressive challenge', 'Strength leveraging'],
        coachTopics: ['Growth focus', 'Pattern interruption', 'Skill development'],
      };
  }
}
