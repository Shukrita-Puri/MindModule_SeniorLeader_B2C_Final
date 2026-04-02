/**
 * Quick Interventions - Ultra-short practices (30-60 seconds)
 * Designed for Micro Self-Recalibration when time is extremely limited
 * These are the "emergency toolkit" for students before high-stakes moments
 */

import type { SanctuaryContent } from './practicesAndSoundscapes';

// Placeholder thumbnails - using pause category default
const quickBreathThumbnail = "/placeholder.svg";
const quickGroundThumbnail = "/placeholder.svg";
const quickResetThumbnail = "/placeholder.svg";

export const quickInterventions: SanctuaryContent[] = [
  // ============= SOMATIC QUICK INTERVENTIONS (30-60 sec) =============
  
  {
    id: "physiological-sigh",
    title: "Physiological Sigh",
    contentType: "micro-practice",
    category: "pause",
    tags: ['breathing', 'calm', 'quick', 'nervous_system', 'instant_reset'],
    structuredTags: {
      pillar: 'pause',
      masterySubtypes: ['grounding', 'composure'],
      goalTags: ['nervous_system_calm', 'stress_relief', 'quick_reset', 'breathing_regulation'],
      physioTarget: ['vagal_activation', 'cortisol_reduce', 'heart_rate_decrease'],
      contextTags: ['pre-performance', 'pre-meeting', 'anxiety_moment', 'quick_reset'],
      environmentSuitability: ['anywhere', 'discreet'],
      equipment: ['none'],
      cognitiveLoadHelp: ['lowers_cognitive_load'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'stabilize'
    },
    duration: 0.5, // 30 seconds
    difficulty: "beginner",
    creator: "Stanford Neuroscience (Dr. Andrew Huberman)",
    origin: "Discovered by Stanford researchers as the fastest way to activate the parasympathetic nervous system",
    storyHook: "The single fastest way to calm your nervous system–used by Navy SEALs and surgeons alike.",
    essence: "Two inhales through nose, one long exhale through mouth. Your nervous system will respond in seconds.",
    cue: "Double inhale, long exhale.",
    usedBy: "When you need to calm down in 30 seconds–before walking into a room, after receiving bad news, during panic",
    thumbnail: quickBreathThumbnail,
    steps: 3,
    subType: "tool",
    instructions: [
      "Double inhale through nose (5 sec): Take a deep breath in through your nose, then sneak in a second shorter inhale on top of it. This maximally inflates your lungs.",
      "Long slow exhale through mouth (10 sec): Let the air out slowly through your mouth. Make the exhale at least twice as long as your inhale.",
      "Repeat 2-3 times: Do this 2-3 times total. You should feel calmer within 30 seconds."
    ],
    whyThisWorks: "The double inhale maximally inflates the tiny air sacs in your lungs (alveoli), which activates receptors that signal your brain to activate the parasympathetic nervous system. The long exhale slows your heart rate. This is the fastest voluntary way to reduce stress."
  },

  {
    id: "box-breath-mini",
    title: "Box Breath Express",
    contentType: "micro-practice",
    category: "pause",
    tags: ['breathing', 'focus', 'quick', 'composure', 'military'],
    structuredTags: {
      pillar: 'pause',
      masterySubtypes: ['grounding', 'composure'],
      goalTags: ['focus', 'composure', 'breathing_regulation', 'mental_clarity'],
      physioTarget: ['vagal_activation', 'hrv_increase'],
      contextTags: ['pre-performance', 'pre-exam', 'focus_needed', 'quick_reset'],
      environmentSuitability: ['anywhere', 'discreet'],
      equipment: ['none'],
      cognitiveLoadHelp: ['improves_concentration'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'stabilize'
    },
    duration: 1, // 60 seconds
    difficulty: "beginner",
    creator: "Navy SEALs / Mark Divine",
    origin: "Standard breathing technique used by special forces operators before high-stakes operations",
    storyHook: "The same technique Navy SEALs use before breaching a door–adapted for your exam or interview.",
    essence: "4-4-4-4: Inhale 4 counts, hold 4 counts, exhale 4 counts, hold 4 counts.",
    cue: "Square your breath.",
    usedBy: "Before any high-stakes moment requiring calm focus",
    thumbnail: quickBreathThumbnail,
    steps: 4,
    subType: "tool",
    instructions: [
      "Inhale for 4 counts: Breathe in slowly through your nose for 4 seconds",
      "Hold for 4 counts: Hold the breath gently–no tension in your throat",
      "Exhale for 4 counts: Release slowly through your mouth for 4 seconds",
      "Hold for 4 counts: Pause at the bottom before your next inhale. Repeat 3 times total."
    ],
    whyThisWorks: "The equal timing creates a sense of control and predictability that calms the amygdala. The holds activate the vagus nerve and increase heart rate variability, the gold standard measure of stress resilience."
  },

  {
    id: "54321-grounding",
    title: "5-4-3-2-1 Sensory Ground",
    contentType: "micro-practice",
    category: "pause",
    tags: ['grounding', 'anxiety', 'quick', 'presence', 'sensory'],
    structuredTags: {
      pillar: 'pause',
      masterySubtypes: ['grounding', 'presence'],
      goalTags: ['grounding', 'anxiety_relief', 'presence', 'overwhelm_reduction'],
      physioTarget: ['prefrontal_activation', 'amygdala_calm'],
      contextTags: ['anxiety_moment', 'overwhelm', 'panic', 'quick_reset'],
      environmentSuitability: ['anywhere'],
      equipment: ['none'],
      cognitiveLoadHelp: ['lowers_cognitive_load'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'stabilize'
    },
    duration: 1, // 60 seconds
    difficulty: "beginner",
    creator: "Clinical Psychology / CBT",
    origin: "Standard grounding technique from cognitive behavioral therapy for anxiety and panic",
    storyHook: "Hijack your anxious brain by flooding it with sensory data from the present moment.",
    essence: "Name 5 things you see, 4 you hear, 3 you feel, 2 you smell, 1 you taste. You cannot be anxious and fully present simultaneously.",
    cue: "Five senses, sixty seconds.",
    usedBy: "When anxiety is spiraling, before panic takes hold, when you need to get out of your head",
    thumbnail: quickGroundThumbnail,
    steps: 5,
    subType: "tool",
    instructions: [
      "5 things you SEE: Look around and name 5 things you can see right now (wall, chair, window, phone, shoes)",
      "4 things you HEAR: Notice 4 sounds (air conditioning, distant voices, your breath, birds outside)",
      "3 things you FEEL: Name 3 physical sensations (feet on floor, fabric on skin, air temperature)",
      "2 things you SMELL: Identify 2 scents (coffee, paper, your shampoo, nothing–that counts)",
      "1 thing you TASTE: Notice 1 taste in your mouth (toothpaste, coffee, nothing specific)"
    ],
    whyThisWorks: "Anxiety lives in the future. This technique forces your brain to process present-moment sensory data, which occupies the same neural real estate as anxious rumination. You literally cannot be fully present and fully anxious at the same time."
  },

  {
    id: "power-stance-30",
    title: "Power Stance Reset",
    contentType: "micro-practice",
    category: "power-up",
    tags: ['confidence', 'posture', 'quick', 'activation', 'presence'],
    structuredTags: {
      pillar: 'renewal',
      masterySubtypes: ['activate', 'recharge'],
      goalTags: ['confidence', 'presence', 'activation', 'composure'],
      physioTarget: ['testosterone_increase', 'cortisol_reduce', 'posture_improvement'],
      contextTags: ['pre-performance', 'pre-interview', 'pre-presentation', 'confidence_needed'],
      environmentSuitability: ['private', 'bathroom'],
      equipment: ['none'],
      cognitiveLoadHelp: ['supports_decision'],
      socialTag: 'solo',
      intensityLevel: 'medium',
      energyDirection: 'uplift'
    },
    duration: 0.5, // 30 seconds
    difficulty: "beginner",
    creator: "Amy Cuddy / Harvard Business School",
    origin: "Research on embodied cognition showing posture changes hormone levels",
    storyHook: "Your body tells your brain how confident you are. Change your posture, change your state.",
    essence: "Stand tall, hands on hips or raised overhead, chin up. Hold for 30 seconds.",
    cue: "Stand like you already won.",
    usedBy: "Before interviews, presentations, difficult conversations–anywhere you need instant confidence",
    thumbnail: quickResetThumbnail,
    steps: 3,
    subType: "tool",
    instructions: [
      "Find a private space: Bathroom stall, empty hallway, your car. You need 30 seconds alone.",
      "Adopt the stance: Feet shoulder-width apart. Hands on hips (Wonder Woman) OR raised overhead in a V (victory pose). Chin slightly lifted. Chest open.",
      "Hold and breathe: Maintain for 30 seconds. Take 3-4 deep breaths. Feel yourself expand into the space."
    ],
    whyThisWorks: "Research shows expansive postures increase testosterone (confidence hormone) and decrease cortisol (stress hormone) within minutes. More importantly, the posture sends a signal to your brain: you are safe, you are powerful, you belong here."
  },

  {
    id: "cold-water-reset",
    title: "Cold Water Reset",
    contentType: "micro-practice",
    category: "pause",
    tags: ['nervous_system', 'quick', 'physical', 'reset', 'dive_reflex'],
    structuredTags: {
      pillar: 'pause',
      masterySubtypes: ['grounding', 'composure'],
      goalTags: ['nervous_system_calm', 'quick_reset', 'stress_relief', 'mental_clarity'],
      physioTarget: ['vagal_activation', 'heart_rate_decrease', 'dive_reflex'],
      contextTags: ['panic', 'overwhelm', 'extreme_stress', 'quick_reset'],
      environmentSuitability: ['bathroom', 'near_sink'],
      equipment: ['cold_water', 'sink'],
      cognitiveLoadHelp: ['lowers_cognitive_load'],
      socialTag: 'solo',
      intensityLevel: 'medium',
      energyDirection: 'stabilize'
    },
    duration: 0.5, // 30 seconds
    difficulty: "beginner",
    creator: "Physiological Research",
    origin: "Based on the mammalian dive reflex that instantly activates the parasympathetic nervous system",
    storyHook: "Hack your mammalian dive reflex to instantly calm your nervous system.",
    essence: "Cold water on your face or wrists triggers an automatic calming response.",
    cue: "Cold water, calm mind.",
    usedBy: "When you are highly activated, approaching panic, or need to reset quickly between back-to-back high-stress events",
    thumbnail: quickResetThumbnail,
    steps: 3,
    subType: "tool",
    instructions: [
      "Get to cold water: Bathroom sink, water fountain, even a cold water bottle will work",
      "Apply cold water: Splash cold water on your face (especially forehead and cheeks) OR run cold water over your inner wrists for 20-30 seconds",
      "Breathe slowly while you do it: Take slow, deep breaths as the cold activates your dive reflex and calms your system"
    ],
    whyThisWorks: "When cold water touches your face, it triggers the mammalian dive reflex–an ancient survival mechanism that immediately slows heart rate by 10-25% and redirects blood to vital organs. This is the fastest physiological reset available."
  },

  // ============= MINDSET QUICK INTERVENTIONS (30-60 sec) =============

  {
    id: "one-word-intention",
    title: "One Word Intention",
    contentType: "micro-practice",
    category: "presence",
    tags: ['focus', 'intention', 'quick', 'mental_clarity', 'pre-performance'],
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['optimize', 'focus'],
      goalTags: ['focus', 'intention', 'mental_clarity', 'confidence'],
      physioTarget: ['prefrontal_activation'],
      contextTags: ['pre-performance', 'pre-meeting', 'pre-exam', 'transition_moment'],
      environmentSuitability: ['anywhere', 'discreet'],
      equipment: ['none'],
      cognitiveLoadHelp: ['supports_decision', 'improves_concentration'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'focus'
    },
    duration: 0.5, // 30 seconds
    difficulty: "beginner",
    creator: "Executive Coaching / Sports Psychology",
    origin: "Used by elite athletes and performers to anchor focus before competition",
    storyHook: "One word to anchor your entire performance. Choose it. Repeat it. Become it.",
    essence: "Choose one word that represents how you want to show up. Let it be your anchor.",
    cue: "What is my word?",
    usedBy: "Before exams, presentations, interviews, competitions–any moment requiring intentional presence",
    thumbnail: quickResetThumbnail,
    steps: 3,
    subType: "mindset",
    instructions: [
      "Ask: How do I want to show up? (10 sec): Not what you want to achieve, but how you want to BE. Calm? Confident? Curious? Powerful? Present?",
      "Choose ONE word (5 sec): Not a sentence. Not an affirmation. One word that captures your intention.",
      "Breathe the word in (15 sec): Close your eyes briefly. Inhale and silently say the word. Exhale and feel it settle into your body. Repeat 2-3 times."
    ],
    whyThisWorks: "Single-word intentions act as cognitive anchors that prime your brain for a specific state. They are easier to access under pressure than complex thoughts, and they can be silently repeated during the event to maintain focus."
  },

  {
    id: "reframe-30",
    title: "Nervous to Excited Flip",
    contentType: "micro-practice",
    category: "power-up",
    tags: ['reframe', 'anxiety', 'quick', 'mindset', 'performance'],
    structuredTags: {
      pillar: 'renewal',
      masterySubtypes: ['activate', 'reframe'],
      goalTags: ['confidence', 'anxiety_transform', 'activation', 'performance'],
      physioTarget: ['cortisol_reframe', 'adrenaline_channel'],
      contextTags: ['pre-performance', 'pre-presentation', 'pre-competition', 'nervous_moment'],
      environmentSuitability: ['anywhere', 'discreet'],
      equipment: ['none'],
      cognitiveLoadHelp: ['supports_decision'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'uplift'
    },
    duration: 0.5, // 30 seconds
    difficulty: "beginner",
    creator: "Alison Wood Brooks / Harvard Business School",
    origin: "Research showing that reframing anxiety as excitement improves performance",
    storyHook: "Nervousness and excitement are the same physiological state. Choose your label.",
    essence: "Say out loud: I am excited. Your body cannot tell the difference between nervous and excited–only your label can.",
    cue: "I am excited.",
    usedBy: "When you feel nervous before a performance, presentation, or high-stakes moment",
    thumbnail: quickResetThumbnail,
    steps: 3,
    subType: "mindset",
    instructions: [
      "Notice the feeling (5 sec): Racing heart, butterflies, sweaty palms. Notice but do not judge.",
      "Say out loud: I am excited (10 sec): Actually say the words. Out loud if possible, silently if not. Say it 2-3 times with conviction.",
      "Reframe the story (15 sec): Tell yourself: This energy is here to help me perform. My body is preparing me for something important."
    ],
    whyThisWorks: "Harvard research shows that saying \"I am excited\" before stressful tasks significantly improves performance compared to trying to calm down. Both nervousness and excitement involve arousal–the only difference is your interpretation. Excitement is approach-oriented; nervousness is avoidance-oriented."
  },

  {
    id: "three-wins-prime",
    title: "Three Wins Prime",
    contentType: "micro-practice",
    category: "power-up",
    tags: ['confidence', 'priming', 'quick', 'self-efficacy', 'pre-performance'],
    structuredTags: {
      pillar: 'renewal',
      masterySubtypes: ['recharge', 'activate'],
      goalTags: ['confidence', 'self_efficacy', 'composure', 'mental_clarity'],
      physioTarget: ['dopamine_release', 'prefrontal_activation'],
      contextTags: ['pre-performance', 'pre-interview', 'confidence_needed', 'quick_reset'],
      environmentSuitability: ['anywhere', 'discreet'],
      equipment: ['none'],
      cognitiveLoadHelp: ['supports_decision'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'uplift'
    },
    duration: 1, // 60 seconds
    difficulty: "beginner",
    creator: "Sports Psychology / Peak Performance",
    origin: "Used by Olympic athletes to build state before competition",
    storyHook: "Remind your brain you are someone who succeeds. Three examples is all it takes.",
    essence: "Recall three times you succeeded at something hard. Feel each one. You are someone who handles challenges.",
    cue: "Three times I won.",
    usedBy: "When self-doubt creeps in before a challenge, when you need to remember you are capable",
    thumbnail: quickResetThumbnail,
    steps: 3,
    subType: "mindset",
    instructions: [
      "Recall Win #1 (20 sec): Think of a time you succeeded at something difficult. See it clearly. Feel how it felt to succeed.",
      "Recall Win #2 (20 sec): Another time. Different context. You prepared, you showed up, you handled it.",
      "Recall Win #3 (20 sec): One more. Let these three examples stack. You are someone who rises to challenges. Take a deep breath and carry that identity into what comes next."
    ],
    whyThisWorks: "This is called self-efficacy priming. By recalling specific examples of past success, you activate neural pathways associated with competence and confidence. Your brain starts to predict success rather than failure, which changes how you approach the challenge."
  },

  {
    id: "worst-case-release",
    title: "Worst Case Release",
    contentType: "micro-practice",
    category: "pause",
    tags: ['anxiety', 'perspective', 'quick', 'cognitive', 'pre-performance'],
    structuredTags: {
      pillar: 'pause',
      masterySubtypes: ['composure', 'perspective'],
      goalTags: ['anxiety_relief', 'perspective', 'composure', 'mental_clarity'],
      physioTarget: ['amygdala_calm', 'prefrontal_activation'],
      contextTags: ['pre-performance', 'anxiety_moment', 'catastrophizing', 'fear'],
      environmentSuitability: ['anywhere', 'discreet'],
      equipment: ['none'],
      cognitiveLoadHelp: ['lowers_cognitive_load', 'supports_decision'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'stabilize'
    },
    duration: 1, // 60 seconds
    difficulty: "beginner",
    creator: "Stoic Philosophy / Cognitive Behavioral Therapy",
    origin: "Premeditatio malorum (premeditation of evils) from Stoic philosophy, modernized in CBT",
    storyHook: "Name your worst fear directly. Watch it shrink when you look at it head-on.",
    essence: "Ask: What is the worst that could happen? Would I survive it? This usually deflates the fear.",
    cue: "And then what?",
    usedBy: "When catastrophic thinking is spiraling, when fear is disproportionate to the actual risk",
    thumbnail: quickResetThumbnail,
    steps: 4,
    subType: "mindset",
    instructions: [
      "Name the fear specifically (15 sec): What exactly are you afraid will happen? Be specific. Not \"it will go badly\" but \"I will forget my words and stand there in silence.\"",
      "Ask: And then what? (15 sec): If that happened, what would you do? You would probably recover, move on, or it would not be as catastrophic as it feels.",
      "Ask: Would I survive it? (15 sec): The answer is almost always yes. Even embarrassment, failure, rejection–you have survived these before.",
      "Release and refocus (15 sec): Take a breath. Say: The worst is survivable. Now, what is most likely to happen? Focus on that instead."
    ],
    whyThisWorks: "Anxiety thrives in vagueness. When you name the specific fear and follow it to its conclusion, you often realize you could handle it. This is called defusion in ACT therapy–separating yourself from the thought and seeing it as just a thought, not reality."
  },

  {
    id: "shoulders-jaw-release",
    title: "Tension Release Scan",
    contentType: "micro-practice",
    category: "pause",
    tags: ['tension', 'body', 'quick', 'release', 'somatic'],
    structuredTags: {
      pillar: 'pause',
      masterySubtypes: ['grounding', 'release'],
      goalTags: ['tension_release', 'body_awareness', 'nervous_system_calm', 'quick_reset'],
      physioTarget: ['muscle_relaxation', 'vagal_activation'],
      contextTags: ['tension_buildup', 'mid_day_reset', 'between_meetings', 'quick_reset'],
      environmentSuitability: ['anywhere', 'discreet'],
      equipment: ['none'],
      cognitiveLoadHelp: ['lowers_cognitive_load'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'stabilize'
    },
    duration: 0.5, // 30 seconds
    difficulty: "beginner",
    creator: "Progressive Muscle Relaxation / Somatic Therapy",
    origin: "Adapted from Edmund Jacobson's progressive muscle relaxation technique",
    storyHook: "Your body stores stress in predictable places. Release them in 30 seconds.",
    essence: "Scan jaw, shoulders, hands. Clench tight for 5 seconds, then release completely.",
    cue: "Clench and release.",
    usedBy: "Between classes, meetings, or events. Whenever you notice you are holding tension.",
    thumbnail: quickResetThumbnail,
    steps: 3,
    subType: "tool",
    instructions: [
      "Jaw (10 sec): Clench your jaw tightly for 5 seconds. Then release completely. Let your mouth hang slightly open. Notice the contrast.",
      "Shoulders (10 sec): Raise shoulders to ears, squeeze tight for 5 seconds. Drop them completely. Feel them settle.",
      "Hands (10 sec): Make tight fists for 5 seconds. Release and spread fingers wide. Shake them gently."
    ],
    whyThisWorks: "Progressive muscle relaxation works by creating a strong contrast between tension and release, which helps your nervous system recognize and let go of chronic holding patterns. The jaw, shoulders, and hands are the most common stress-storage sites."
  }
];

// Helper to get only quick interventions suitable for micro self-recalibration
export const getQuickInterventions = (): SanctuaryContent[] => {
  return quickInterventions.filter(c => c.duration <= 1);
};

// Get quick interventions by type
export const getQuickSomatic = (): SanctuaryContent[] => {
  return quickInterventions.filter(c => c.subType === 'tool');
};

export const getQuickMindset = (): SanctuaryContent[] => {
  return quickInterventions.filter(c => c.subType === 'mindset');
};
