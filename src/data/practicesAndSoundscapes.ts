// Updated structure with contentType and tags for recommendation system

export type ContentType = 'soundbath' | 'guided-practice' | 'micro-practice';
export type Category = 'pause' | 'power-up' | 'presence';

export interface SanctuaryContent {
  id: string;
  title: string;
  contentType: ContentType;
  category: Category;
  tags: string[]; // Energy state, context, intensity tags
  duration: number; // in minutes
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  creator: string;
  origin?: string;
  storyHook: string;
  usedBy?: string;
  thumbnail: string;
  audioSrc?: string;
  steps?: number;
  instructions?: string[];
}

export const sanctuaryContent: SanctuaryContent[] = [
  // ============= SOUNDBATHS (formerly Soundscapes) =============
  {
    id: "primal-resonance-power",
    title: "Primal Resonance",
    contentType: "soundbath",
    category: "power-up",
    tags: ['fire', 'pre-meeting', 'intense', 'morning'],
    duration: 3,
    creator: "Ancient sound designed to awaken focus",
    storyHook: "Shamanic drums echo a primal call, designed to snap you into flow state — used before hunts, now before presentations.",
    thumbnail: "/lovable-uploads/cc7c715b-a0d1-4464-b0e1-d338c14452a0.png",
    audioSrc: "/soundscapes/ina-night-fields.mp3"
  },
  {
    id: "cathedral-stillness-pause",
    title: "Cathedral Stillness",
    contentType: "soundbath",
    category: "pause",
    tags: ['earth', 'post-stress', 'gentle', 'afternoon'],
    duration: 5,
    creator: "Medieval choir chant lineage",
    storyHook: "Gregorian chants echo through ancient stone — monks used this sonic architecture to enter deep contemplation.",
    thumbnail: "/lovable-uploads/76cee14b-c6a7-4d75-8162-8a5ba6f74a9d.png",
    audioSrc: "/soundscapes/cathedral-choir-flow.mp3"
  },
  {
    id: "himalayan-clearing-presence",
    title: "Himalayan Clearing",
    contentType: "soundbath",
    category: "presence",
    tags: ['air', 'clarity', 'moderate', 'anytime'],
    duration: 4,
    creator: "Tibetan monastery ritual",
    storyHook: "Singing bowls resonate at frequencies that clear mental noise — used in Himalayan monasteries for clarity before decisions.",
    thumbnail: "/lovable-uploads/6ad3487d-07e9-414e-96cd-7a73d8a12c03.png",
    audioSrc: "/soundscapes/tibetan-bowls.mp3"
  },
  {
    id: "earth-resonance-pause",
    title: "Earth Resonance",
    contentType: "soundbath",
    category: "pause",
    tags: ['earth', 'grounding', 'gentle', 'evening'],
    duration: 7,
    creator: "Binaural grounding frequency",
    storyHook: "Low-frequency earth tones that sync your nervous system — inspired by indigenous connection rituals.",
    thumbnail: "/lovable-uploads/7a5dd5f2-96fb-485c-a58f-0280491740c1.png",
    audioSrc: "/soundscapes/earth-resonance.mp3"
  },
  {
    id: "monastery-flow-presence",
    title: "Monastery Flow",
    contentType: "soundbath",
    category: "presence",
    tags: ['water', 'flow', 'moderate', 'morning'],
    duration: 6,
    creator: "Buddhist walking meditation soundscape",
    storyHook: "Gentle bells and ambient monastery sounds — accompany mindful walking meditation practiced for 2,500 years.",
    thumbnail: "/lovable-uploads/ae4d66fb-b3ea-4ef5-bfff-f228c447224c.png",
    audioSrc: "/soundscapes/himalayan-monastery.wav"
  },

  // ============= GUIDED PRACTICES (10-20 min) =============
  {
    id: "box-breathing",
    title: "Box Breathing Reset",
    contentType: "guided-practice",
    category: "power-up",
    tags: ['fire', 'pre-meeting', 'moderate', 'tactical'],
    duration: 5,
    difficulty: "beginner",
    origin: "Navy SEAL Tactical Protocol",
    storyHook: "Before high-stakes missions, Navy SEALs use this 4-4-4-4 breathing pattern to regulate heart rate and sharpen decision-making.",
    usedBy: "Special Forces, Surgeons, Olympic Athletes",
    thumbnail: "/lovable-uploads/aa4d150b-e5fe-48d7-aa74-9f082d21ffaa.png",
    steps: 4,
    creator: "Navy SEAL Tactical Protocol",
    instructions: [
      "Inhale for 4 counts",
      "Hold for 4 counts",
      "Exhale for 4 counts",
      "Hold for 4 counts",
      "Repeat for 5 minutes"
    ]
  },
  {
    id: "tonglen-breathing",
    title: "Tonglen Compassion Practice",
    contentType: "guided-practice",
    category: "pause",
    tags: ['earth', 'post-conflict', 'gentle', 'compassion'],
    duration: 12,
    difficulty: "intermediate",
    origin: "Buddhist Meditation | Tibet, 9th Century",
    storyHook: "For 1200 years, Tibetan monks have practiced Tonglen to transform suffering into compassion by breathing in pain and breathing out relief.",
    usedBy: "Backed by Stanford neuroscience",
    thumbnail: "/lovable-uploads/909c474b-063c-47f3-aae1-2ef5c7098a8e.png",
    steps: 5,
    creator: "Tibetan Buddhist Lineage",
    instructions: [
      "Sit comfortably, close your eyes",
      "Visualize suffering as dark smoke",
      "Breathe in the darkness, transforming it",
      "Breathe out light and relief",
      "Continue for 12 minutes"
    ]
  },
  {
    id: "wim-hof",
    title: "Wim Hof Power Breathing",
    contentType: "guided-practice",
    category: "power-up",
    tags: ['fire', 'energy-boost', 'intense', 'morning'],
    duration: 15,
    difficulty: "advanced",
    origin: "Cold Exposure Protocol",
    storyHook: "Dutch extreme athlete Wim Hof developed this technique to control the autonomic nervous system and boost energy.",
    usedBy: "Athletes, Biohackers, Performance Seekers",
    thumbnail: "/lovable-uploads/c72cc661-d2db-48b0-b39a-d5c4bb2253d3.png",
    steps: 6,
    creator: "Wim Hof Method",
    instructions: [
      "30 deep breaths in succession",
      "Exhale and hold breath as long as comfortable",
      "Take recovery breath and hold 15 seconds",
      "Repeat 3-4 rounds",
      "Optional cold exposure after",
      "Rest and observe"
    ]
  },
  {
    id: "stoic-reflection",
    title: "Stoic Evening Reflection",
    contentType: "guided-practice",
    category: "presence",
    tags: ['air', 'evening-ritual', 'gentle', 'clarity'],
    duration: 10,
    difficulty: "beginner",
    origin: "Ancient Rome | Marcus Aurelius",
    storyHook: "The Roman Emperor's daily practice of reviewing actions, thoughts, and alignment with virtue at day's end.",
    usedBy: "CEOs, Leaders, Philosophers",
    thumbnail: "/lovable-uploads/afddfc0a-07c8-4659-bfb5-560d510b12c3.png",
    steps: 5,
    creator: "Stoic Philosophy",
    instructions: [
      "Review your day chronologically",
      "What did you do well?",
      "What could you have done better?",
      "What virtue did you practice?",
      "What will you improve tomorrow?"
    ]
  },
  {
    id: "vipassana-body-scan",
    title: "Vipassana Body Scan",
    contentType: "guided-practice",
    category: "pause",
    tags: ['earth', 'grounding', 'moderate', 'awareness'],
    duration: 20,
    difficulty: "intermediate",
    origin: "Buddhist Mindfulness | 2500 years",
    storyHook: "Ancient technique of systematically observing bodily sensations to develop equanimity and insight.",
    usedBy: "Meditators, Mindfulness Practitioners",
    thumbnail: "/lovable-uploads/f0c69073-c184-4d25-baaa-c8e5d07cfbd9.png",
    steps: 8,
    creator: "Vipassana Tradition",
    instructions: [
      "Lie down comfortably",
      "Bring attention to top of head",
      "Slowly scan down through body",
      "Notice sensations without judgment",
      "Continue to feet",
      "Reverse direction, scan upward",
      "Rest in full body awareness",
      "Slowly return to room"
    ]
  },
  {
    id: "pre-performance-ritual",
    title: "Pre-Performance Ritual",
    contentType: "guided-practice",
    category: "power-up",
    tags: ['fire', 'pre-presentation', 'intense', 'visualization'],
    duration: 8,
    difficulty: "intermediate",
    origin: "Olympic Swimmer Protocol",
    storyHook: "Combines ancient visualization with modern sports psychology to create peak performance state before competition.",
    usedBy: "Olympic Swimmers, Performers",
    thumbnail: "/lovable-uploads/b8ffb35c-7a57-47ef-a879-1aff9c47603d.png",
    steps: 6,
    creator: "Sports Psychology",
    instructions: [
      "Find quiet space, close eyes",
      "Breathe deeply 3 times",
      "Visualize perfect performance",
      "Feel the emotions of success",
      "Activate power pose",
      "Channel energy into action"
    ]
  },

  // ============= MICRO PRACTICES (2-5 min) =============
  {
    id: "tactical-pause",
    title: "Tactical Pause",
    contentType: "micro-practice",
    category: "pause",
    tags: ['earth', 'between-meetings', 'gentle', 'quick-reset'],
    duration: 2,
    difficulty: "beginner",
    creator: "Military decision-making technique",
    storyHook: "Special operations teams pause 60 seconds before entering high-risk zones to reset nervous system.",
    thumbnail: "/lovable-uploads/06444f60-b3bd-4d38-a749-aea185d789e6.png",
    steps: 3,
    instructions: [
      "Stop all activity",
      "Take 5 deep breaths",
      "Notice your state before continuing"
    ]
  },
  {
    id: "power-stance",
    title: "Power Stance",
    contentType: "micro-practice",
    category: "power-up",
    tags: ['fire', 'pre-meeting', 'moderate', 'confidence'],
    duration: 2,
    difficulty: "beginner",
    creator: "Amy Cuddy's body language research",
    storyHook: "Harvard research shows 2 minutes in expansive posture increases confidence hormones by 20%.",
    thumbnail: "/lovable-uploads/67bda649-edbb-4f39-8290-175122fe99bf.png",
    steps: 2,
    instructions: [
      "Stand tall, hands on hips or raised overhead",
      "Hold for 2 minutes while breathing deeply"
    ]
  },
  {
    id: "clarity-breath",
    title: "Clarity Breath",
    contentType: "micro-practice",
    category: "presence",
    tags: ['air', 'decision-making', 'gentle', 'mental-clarity'],
    duration: 3,
    difficulty: "beginner",
    creator: "Pranayama breathing technique",
    storyHook: "Ancient yogic breath that clears mental fog — used before important decisions for 3,000 years.",
    thumbnail: "/lovable-uploads/4ed33e6d-77b9-47f9-9981-bab218507307.png",
    steps: 4,
    instructions: [
      "Sit upright, close eyes",
      "Inhale slowly through nose (5 counts)",
      "Hold gently (2 counts)",
      "Exhale fully through mouth (7 counts)",
      "Repeat 5 times"
    ]
  },
  {
    id: "energy-shift",
    title: "Energy Shift",
    contentType: "micro-practice",
    category: "power-up",
    tags: ['fire', 'afternoon-slump', 'moderate', 'energy-boost'],
    duration: 3,
    difficulty: "beginner",
    creator: "Kinesthetic energy technique",
    storyHook: "Movement-based practice to shift stagnant energy — athletes use this between training sets.",
    thumbnail: "/lovable-uploads/b8ffb35c-7a57-47ef-a879-1aff9c47603d.png",
    steps: 3,
    instructions: [
      "Stand and shake out entire body for 30 seconds",
      "Jump lightly 10 times",
      "Take 3 deep energizing breaths"
    ]
  },
  {
    id: "grounding-touch",
    title: "Grounding Touch",
    contentType: "micro-practice",
    category: "pause",
    tags: ['earth', 'anxiety-relief', 'gentle', 'nervous-system'],
    duration: 2,
    difficulty: "beginner",
    creator: "Somatic therapy technique",
    storyHook: "Simple touch technique that calms the vagus nerve — therapists use this for immediate anxiety relief.",
    thumbnail: "/lovable-uploads/7a5dd5f2-96fb-485c-a58f-0280491740c1.png",
    steps: 3,
    instructions: [
      "Place one hand on heart, one on belly",
      "Feel the rise and fall of breath",
      "Breathe slowly for 2 minutes"
    ]
  },
  {
    id: "decision-pause",
    title: "Decision Pause",
    contentType: "micro-practice",
    category: "presence",
    tags: ['air', 'before-decision', 'moderate', 'clarity'],
    duration: 3,
    difficulty: "beginner",
    creator: "Executive decision protocol",
    storyHook: "Top executives use this 3-minute pause before major decisions to check intuition vs. reactivity.",
    thumbnail: "/lovable-uploads/afddfc0a-07c8-4659-bfb5-560d510b12c3.png",
    steps: 4,
    instructions: [
      "Pause before deciding",
      "Ask: Is this reactive or responsive?",
      "Take 3 deep breaths",
      "Check your gut feeling"
    ]
  }
];

// Helper functions
export const getContentByType = (type: ContentType): SanctuaryContent[] => {
  return sanctuaryContent.filter(c => c.contentType === type);
};

export const getContentByCategory = (category: Category): SanctuaryContent[] => {
  return sanctuaryContent.filter(c => c.category === category);
};

export const getContentByTags = (tags: string[]): SanctuaryContent[] => {
  return sanctuaryContent.filter(c => 
    tags.some(tag => c.tags.includes(tag))
  );
};

export const getContentById = (id: string): SanctuaryContent | undefined => {
  return sanctuaryContent.find(c => c.id === id);
};
