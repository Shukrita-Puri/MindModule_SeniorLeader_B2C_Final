// User Archetype Determination Engine

import { ComponentScores } from './selfRegulationScoring';

export interface UserArchetype {
  id: string;
  title: string;
  description: string;
  percentile: string;
  unlockStatement: string;
  strengthArea: string;
  growthArea: string;
  recommendedMastery: 'Pause' | 'Flow' | 'Renewal';
}

export function determineArchetype(scores: ComponentScores): UserArchetype {
  const avgScore = (scores.q2_energy_regulation + scores.q3_focus_recovery + scores.q4_energy_renewal) / 3;
  
  // Archetype 1: The Natural Regulator (Elite baseline - 80+ average)
  if (avgScore >= 80) {
    return {
      id: 'natural_regulator',
      title: 'The Natural Regulator',
      description: "You're operating at an elite baseline with strong capabilities across energy regulation, focus recovery, and renewal strategies. Only 8% of professionals start at this level.",
      percentile: 'top 8%',
      unlockStatement: "Your unlock: leveraging this natural advantage to handle exponentially higher complexity and pressure without breaking stride.",
      strengthArea: 'Comprehensive Self-Regulation',
      growthArea: 'Advanced Integration',
      recommendedMastery: 'Flow'
    };
  }
  
  // Archetype 2: The Strategic Pauser (High focus + high composure priority)
  if (scores.q3_focus_recovery >= 75 && scores.q5_growth_priority >= 75) {
    return {
      id: 'strategic_pauser',
      title: 'The Strategic Pauser',
      description: "You excel at recovering focus and prioritize staying composed under pressure. This pattern appears in only 15% of professionals and predicts high effectiveness in high-stakes moments.",
      percentile: 'top 15%',
      unlockStatement: "Your unlock: channeling that natural pause into sustained momentum across extended high-pressure cycles.",
      strengthArea: 'Focus Recovery & Composure',
      growthArea: 'Energy Downshift',
      recommendedMastery: 'Pause'
    };
  }
  
  // Archetype 3: The High-Octane Performer (Low energy regulation + high renewal)
  if (scores.q2_energy_regulation <= 50 && scores.q4_energy_renewal >= 70) {
    return {
      id: 'high_octane_performer',
      title: 'The High-Octane Performer',
      description: "You run hot and recover well—a classic high-performer pattern found in 23% of professionals. You excel at renewal but struggle to downshift energy during intense work.",
      percentile: 'top 35%',
      unlockStatement: "Your unlock: learning to prevent crashes before they happen by building strategic downshift capabilities.",
      strengthArea: 'Energy Renewal',
      growthArea: 'Proactive Regulation',
      recommendedMastery: 'Renewal'
    };
  }
  
  // Archetype 4: The Awareness Builder (Moderate scores, high growth awareness)
  return {
    id: 'awareness_builder',
    title: 'The Awareness Builder',
    description: "You're at the beginning of your self-regulation journey with clear awareness of where you want to grow. This awareness alone puts you ahead of 58% of professionals who never start.",
    percentile: 'top 58%',
    unlockStatement: "Your unlock: building the foundational tools that transform stress response from reactive to strategic.",
    strengthArea: 'Growth Awareness',
    growthArea: 'Foundational Tools',
    recommendedMastery: 'Pause'
  };
}

export function getArchetypeInsights(archetype: UserArchetype, scores: ComponentScores): {
  patternRevealation: string[];
  developmentFocus: string;
  expectedOutcomes: string[];
  timeline: string;
} {
  const insights: Record<string, any> = {
    natural_regulator: {
      patternRevealation: [
        "You naturally downshift energy after intense work—a capability found in only 19% of professionals.",
        "You recover focus within minutes of interruptions, demonstrating exceptional cognitive control.",
        "You have established go-to renewal strategies that actually work—rare at this baseline level."
      ],
      developmentFocus: "Advanced integration techniques to sustain peak performance under extreme complexity.",
      expectedOutcomes: [
        "Handle 3x more complexity without performance degradation",
        "Maintain elite-level decision quality across 12+ hour days",
        "Become the go-to leader for highest-stakes situations"
      ],
      timeline: "Week 1-2: Baseline mapping | Week 3-4: Advanced tools | Week 5-8: Integration under pressure"
    },
    strategic_pauser: {
      patternRevealation: [
        "You pause before reacting—only 12% of people naturally do this, and it's the #1 predictor of influence under pressure.",
        "You can re-establish focus quickly after disruptions, showing strong cognitive control.",
        "Your growth priority aligns with your natural strengths—this self-awareness accelerates development."
      ],
      developmentFocus: "Energy regulation techniques to complement your natural composure.",
      expectedOutcomes: [
        "Sustain composure across marathon decision cycles",
        "Reduce decision fatigue by 47% in high-pressure situations",
        "Increase clarity during complexity by 38%"
      ],
      timeline: "Week 1-2: Build awareness | Week 3-4: Master tactical downshift tools | Week 5-8: Daily integration"
    },
    high_octane_performer: {
      patternRevealation: [
        "You have effective renewal strategies when you step away—a capability many professionals lack.",
        "You struggle to downshift during intense work, leading to 64% higher burnout risk over 18 months.",
        "Your pattern: high output with crash-and-recover cycles rather than sustainable regulation."
      ],
      developmentFocus: "Proactive energy regulation to prevent crashes before they happen.",
      expectedOutcomes: [
        "Replace reactive recovery with strategic downshift capabilities",
        "Sustain peak performance 3x longer without crashes",
        "Reduce recovery time from 3-4 days to 5-10 minutes"
      ],
      timeline: "Week 1-2: Pattern recognition | Week 3-4: Preventative tools | Week 5-8: Build sustainable rhythm"
    },
    awareness_builder: {
      patternRevealation: [
        "You're aware you need better tools—this insight puts you ahead of 58% who never start.",
        "Current patterns show reactive rather than strategic stress response.",
        "Research shows this exact awareness is the strongest predictor of rapid skill development."
      ],
      developmentFocus: "Build foundational self-regulation tools from the ground up.",
      expectedOutcomes: [
        "Transform stress response from reactive to strategic",
        "Build go-to recovery protocols that work in 5-10 minutes",
        "Reduce stress impact by 68% within 8 weeks"
      ],
      timeline: "Week 1-2: Foundational awareness | Week 3-4: Core techniques | Week 5-8: Daily integration"
    }
  };

  return insights[archetype.id] || insights.awareness_builder;
}

export function getLowestComponent(scores: ComponentScores): {
  component: string;
  score: number;
  label: string;
} {
  const components = [
    { key: 'q2_energy_regulation', score: scores.q2_energy_regulation, label: 'Energy Regulation' },
    { key: 'q3_focus_recovery', score: scores.q3_focus_recovery, label: 'Focus Recovery' },
    { key: 'q4_energy_renewal', score: scores.q4_energy_renewal, label: 'Energy Renewal' }
  ];

  const lowest = components.reduce((a, b) => a.score < b.score ? a : b);
  
  return {
    component: lowest.key,
    score: lowest.score,
    label: lowest.label
  };
}
