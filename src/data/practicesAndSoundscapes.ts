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
  // ============= SOUNDBATHS =============
  
  // POWER-UP Soundbaths
  {
    id: "athletic-activation",
    title: "Athletic Activation",
    contentType: "soundbath",
    category: "power-up",
    tags: ['fire', 'pre-meeting', 'intense', 'morning', 'performance', 'energy-boost'],
    duration: 6,
    creator: "Olympic Performance Protocol",
    origin: "Sports psychology protocol",
    storyHook: "Used by Olympic swimmers and track athletes for pre-competition mental preparation.",
    usedBy: "Olympic athletes, High performers",
    thumbnail: "/lovable-uploads/cc7c715b-a0d1-4464-b0e1-d338c14452a0.png",
    audioSrc: "/soundscapes/tibetan-bowls.mp3"
  },
  {
    id: "primal-resonance-power",
    title: "Primal Resonance",
    contentType: "soundbath",
    category: "power-up",
    tags: ['fire', 'pre-meeting', 'intense', 'morning', 'focus', 'activation'],
    duration: 25,
    creator: "Ancient sound designed to awaken focus",
    origin: "Ancient Sound Traditions",
    storyHook: "A fusion of ancient sound traditions designed to awaken focus and presence before high-energy moments—didgeridoo's primal frequency meets crystalline singing bowls.",
    thumbnail: "/lovable-uploads/cc7c715b-a0d1-4464-b0e1-d338c14452a0.png",
    audioSrc: "/soundscapes/ina-night-fields.mp3"
  },
  {
    id: "warrior-drums",
    title: "Warrior Drums",
    contentType: "soundbath",
    category: "power-up",
    tags: ['fire', 'pre-meeting', 'intense', 'power', 'courage'],
    duration: 4,
    creator: "Ritual of preparation and power",
    origin: "Ancient Warrior Traditions",
    storyHook: "The breath before impact—primal percussion invoking the warrior archetype for modern challenges. Pure drums, no melody, only courage and readiness.",
    thumbnail: "/lovable-uploads/c72cc661-d2db-48b0-b39a-d5c4bb2253d3.png",
    audioSrc: "/soundscapes/earth-resonance.mp3"
  },

  // PAUSE Soundbaths
  {
    id: "harmonic-calm",
    title: "Harmonic Calm",
    contentType: "soundbath",
    category: "pause",
    tags: ['earth', 'post-stress', 'gentle', 'healing', 'meditation'],
    duration: 3,
    creator: "Tibetan Buddhist singing bowl traditions",
    origin: "Drawn from Tibetan Buddhist singing bowl traditions",
    storyHook: "Used to reduce stress, restore emotional balance, and create a sense of grounded presence through harmonic resonance.",
    thumbnail: "/lovable-uploads/76cee14b-c6a7-4d75-8162-8a5ba6f74a9d.png",
    audioSrc: "/soundscapes/harmonic-calm.mp3"
  },
  {
    id: "deep-calm-forest-bathing",
    title: "Deep Calm Forest Bathing",
    contentType: "soundbath",
    category: "pause",
    tags: ['earth', 'nature', 'gentle', 'stress-relief', 'grounding'],
    duration: 2,
    creator: "Japanese Shinrin-yoku practices",
    origin: "Inspired by ancient Japanese Shinrin-yoku (forest bathing) practices",
    storyHook: "Used to cultivate deep calm, restore mental clarity, and anchor attention in the present through gentle rain and subtle village sounds.",
    thumbnail: "/lovable-uploads/7a5dd5f2-96fb-485c-a58f-0280491740c1.png",
    audioSrc: "/soundscapes/forest-bathing.mp3"
  },
  {
    id: "pre-mission-calm",
    title: "Pre-Mission Calm",
    contentType: "soundbath",
    category: "pause",
    tags: ['earth', 'pre-meeting', 'tactical', 'composure'],
    duration: 5,
    creator: "Military performance protocol",
    origin: "Navy SEAL Protocol",
    storyHook: "Used by special forces before high-stakes operations to achieve tactical composure.",
    thumbnail: "/lovable-uploads/aa4d150b-e5fe-48d7-aa74-9f082d21ffaa.png",
    audioSrc: "/soundscapes/cathedral-choir-flow.mp3"
  },
  {
    id: "himalayan-monastery",
    title: "Himalayan Mountain Monastery",
    contentType: "soundbath",
    category: "pause",
    tags: ['earth', 'meditation', 'gentle', 'mystical', 'devotion'],
    duration: 22,
    creator: "Mystical monastic atmosphere",
    origin: "Tibetan Buddhist Monasteries",
    storyHook: "High upon a snow-laden summit stands a monastery carved from volcanic stone—where sound becomes devotion.",
    thumbnail: "/lovable-uploads/ae4d66fb-b3ea-4ef5-bfff-f228c447224c.png",
    audioSrc: "/soundscapes/himalayan-monastery.wav"
  },
  {
    id: "cathedral-stillness-pause",
    title: "Cathedral Choir Flow",
    contentType: "soundbath",
    category: "pause",
    tags: ['earth', 'post-stress', 'gentle', 'afternoon', 'sacred'],
    duration: 18,
    creator: "Sacred harmonic composition",
    origin: "Sacred Cathedral Resonance",
    storyHook: "Step into a grand cathedral, where sunlight spills across vaulted ceilings and every stone resonates with history. Within this vast space, sound takes on dimension: a choir of voices rises and falls, interwoven with bells, subtle percussion, and reverberant harmonics.",
    thumbnail: "/lovable-uploads/76cee14b-c6a7-4d75-8162-8a5ba6f74a9d.png",
    audioSrc: "/soundscapes/cathedral-choir-flow.mp3"
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

  // PRESENCE Soundbaths
  {
    id: "deep-focus-monastic-resonance",
    title: "Deep Focus with Monastic Resonance",
    contentType: "soundbath",
    category: "presence",
    tags: ['air', 'focus', 'moderate', 'meditation', 'clarity'],
    duration: 1.5,
    creator: "Monastic chanting and harmonic rituals",
    origin: "Inspired by monastic chanting and harmonic rituals in Himalayan-style summit monasteries",
    storyHook: "Used to sharpen cognitive clarity, sustain deep focus, and expand awareness through layered chants, resonant gongs, and ethereal chimes.",
    thumbnail: "/lovable-uploads/ae4d66fb-b3ea-4ef5-bfff-f228c447224c.png",
    audioSrc: "/soundscapes/monastic-resonance.mp3"
  },
  {
    id: "sustained-focus-choir-harmonic",
    title: "Sustained Focus with Choir Harmonic",
    contentType: "soundbath",
    category: "presence",
    tags: ['air', 'focus', 'moderate', 'sacred', 'resonance'],
    duration: 3.5,
    creator: "Sacred harmonic compositions",
    origin: "Inspired by sacred harmonic compositions in grand cathedrals",
    storyHook: "Used to enhance focus, cultivate mindful presence, and align energy through layered choirs, bells, and reverberant harmonics.",
    thumbnail: "/lovable-uploads/76cee14b-c6a7-4d75-8162-8a5ba6f74a9d.png",
    audioSrc: "/soundscapes/cathedral-choir-flow.mp3"
  },
  {
    id: "energised-focus-didgeridoo-bowls",
    title: "Energised Focus with Didgeridoo & Bowls",
    contentType: "soundbath",
    category: "presence",
    tags: ['fire', 'focus', 'moderate', 'energy', 'activation'],
    duration: 2.5,
    creator: "Didgeridoo traditions and harmonic bowl practices",
    origin: "Inspired by didgeridoo traditions and harmonic bowl practices that channel energy into sustained attention",
    storyHook: "A two-phase soundscape designed to awaken the body's core and guide energy into focused mental flow. Low didgeridoo frequencies activate vitality, while crystalline bowls elevate awareness — turning primal momentum into calm, precise focus.",
    thumbnail: "/lovable-uploads/cc7c715b-a0d1-4464-b0e1-d338c14452a0.png",
    audioSrc: "/soundscapes/didgeridoo-bowls.mp3"
  },
  {
    id: "warrior-drums-presence",
    title: "Warrior Drums",
    contentType: "soundbath",
    category: "presence",
    tags: ['fire', 'power', 'intense', 'activation'],
    duration: 4,
    creator: "Ritual of preparation and power",
    origin: "Ancient Warrior Traditions",
    storyHook: "Viking Warrior Drums for Power & Activation. Pure drums, only courage and readiness.",
    thumbnail: "/lovable-uploads/c72cc661-d2db-48b0-b39a-d5c4bb2253d3.png",
    audioSrc: "/soundscapes/earth-resonance.mp3"
  },
  {
    id: "ina-night-fields",
    title: "Ina Night Fields (Tsukiyomi)",
    contentType: "soundbath",
    category: "presence",
    tags: ['water', 'nature', 'gentle', 'evening', 'ambient'],
    duration: 42,
    creator: "Natural field recording",
    origin: "Nagano Countryside, Japan",
    storyHook: "In the quiet heart of Nagano's countryside, where the land folds gently into mist and memory, night hums in perfect rhythm. Through the open window of a farmhouse in Ina, the living orchestra of the fields begins.",
    thumbnail: "/lovable-uploads/6ad3487d-07e9-414e-96cd-7a73d8a12c03.png",
    audioSrc: "/soundscapes/ina-night-fields.mp3"
  },
  {
    id: "monastery-flow-presence",
    title: "Monastery Flow",
    contentType: "soundbath",
    category: "presence",
    tags: ['water', 'flow', 'moderate', 'morning', 'meditation'],
    duration: 6,
    creator: "Buddhist walking meditation soundscape",
    storyHook: "Gentle bells and ambient monastery sounds — accompany mindful walking meditation practiced for 2,500 years.",
    thumbnail: "/lovable-uploads/ae4d66fb-b3ea-4ef5-bfff-f228c447224c.png",
    audioSrc: "/soundscapes/himalayan-monastery.wav"
  },

  // ============= GUIDED PRACTICES =============

  // POWER-UP Practices
  {
    id: "kapalabhati",
    title: "Kapalabhati Pranayama",
    contentType: "guided-practice",
    category: "power-up",
    tags: ['fire', 'energy-boost', 'intense', 'morning', 'breathwork'],
    duration: 6,
    difficulty: "intermediate",
    origin: "Ancient Yogic Practice | Hatha Yoga",
    storyHook: "For thousands of years, yogis have used this rapid-fire breathing to generate instant energy and mental clarity—ancient alternative to caffeine.",
    usedBy: "Yogis, Warriors, High Performers",
    thumbnail: "/lovable-uploads/c72cc661-d2db-48b0-b39a-d5c4bb2253d3.png",
    steps: 6,
    creator: "Skull Shining Breath"
  },
  {
    id: "spartan-battle-breath",
    title: "The Spartan Battle Breath",
    contentType: "guided-practice",
    category: "power-up",
    tags: ['fire', 'pre-meeting', 'intense', 'warrior', 'activation'],
    duration: 7,
    difficulty: "advanced",
    origin: "Ancient Spartan Warrior Protocol | 480 BCE",
    storyHook: "Before Thermopylae, 300 Spartans performed this ritual to enter 'menos'—divine battle-trance. Now access that fearless warrior state for any challenge.",
    usedBy: "Spartan Warriors, Athletes, Leaders",
    thumbnail: "/lovable-uploads/aa4d150b-e5fe-48d7-aa74-9f082d21ffaa.png",
    steps: 6,
    creator: "Ancient Greek Warrior Activation"
  },
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
    creator: "Navy SEAL Tactical Protocol"
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
    creator: "Wim Hof Method"
  },

  // PAUSE Practices
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
    creator: "Tibetan Buddhist Lineage"
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
    creator: "Vipassana Tradition"
  },

  // PRESENCE Practices
  {
    id: "pre-performance-ritual",
    title: "Pre-Performance Ritual",
    contentType: "guided-practice",
    category: "presence",
    tags: ['fire', 'pre-presentation', 'intense', 'visualization'],
    duration: 8,
    difficulty: "intermediate",
    origin: "Olympic Swimmer Protocol",
    storyHook: "Combines ancient visualization with modern sports psychology to create peak performance state before competition.",
    usedBy: "Olympic Swimmers, Performers",
    thumbnail: "/lovable-uploads/b8ffb35c-7a57-47ef-a879-1aff9c47603d.png",
    steps: 6,
    creator: "Sports Psychology"
  },
  {
    id: "bhramari",
    title: "Bhramari Pranayama",
    contentType: "guided-practice",
    category: "presence",
    tags: ['air', 'focus', 'gentle', 'meditation', 'calm'],
    duration: 12,
    difficulty: "beginner",
    origin: "Ancient Vedic Meditation | 5000 years",
    storyHook: "Ancient yogis discovered that humming like a bee creates profound mental stillness—modern science confirms it activates the vagus nerve for instant calm and focus.",
    usedBy: "Yogis, Meditators, Focus Seekers",
    thumbnail: "/lovable-uploads/6ad3487d-07e9-414e-96cd-7a73d8a12c03.png",
    steps: 6,
    creator: "The Humming Bee Breath"
  },
  {
    id: "trataka",
    title: "Trataka - The Steady Flame Gaze",
    contentType: "guided-practice",
    category: "presence",
    tags: ['air', 'focus', 'moderate', 'meditation', 'clarity'],
    duration: 8,
    difficulty: "intermediate",
    origin: "Ancient Yogic Practice | Hatha Yoga Pradipika",
    storyHook: "For thousands of years, yogis have gazed at flames to develop superhuman focus—training the eyes trains the mind, leading to instant flow states.",
    usedBy: "Yogis, Meditators, High Performers",
    thumbnail: "/lovable-uploads/afddfc0a-07c8-4659-bfb5-560d510b12c3.png",
    steps: 6,
    creator: "Ancient Yogic Focus Meditation"
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
    creator: "Stoic Philosophy"
  },

  // ============= MICRO PRACTICES =============

  // POWER-UP Micro Practices
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
    steps: 2
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
    steps: 3
  },

  // PAUSE Micro Practices
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
    steps: 3
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
    steps: 3
  },

  // PRESENCE Micro Practices
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
    steps: 4
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
    steps: 4
  }
];

// Helper functions
export const getAllContent = (): SanctuaryContent[] => {
  return sanctuaryContent;
};

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
