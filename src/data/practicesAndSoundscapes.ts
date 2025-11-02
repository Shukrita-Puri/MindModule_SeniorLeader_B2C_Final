export interface PracticeOrSoundscape {
  id: string;
  type: 'soundscape' | 'practice';
  title: string;
  subtitle: string;
  duration: string;
  description: string;
  origin: string;
  storyHook: string;
  category: 'pause' | 'power-up' | 'presence';
  thumbnail: string;
  // Practice-specific
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  usedBy?: string;
  steps?: number;
  // Soundscape-specific
  creator?: string;
}

export const allContent: PracticeOrSoundscape[] = [
  // PAUSE - Soundscapes
  {
    id: "tibetan-bowls",
    type: "soundscape",
    title: "Tibetan Bowl Resonance",
    subtitle: "Ancient Himalayan Healing",
    category: "pause",
    duration: "8 min",
    origin: "Ancient Himalayan Tradition",
    storyHook: "5000-year practice used by monks to achieve deep meditative states through harmonic frequencies.",
    creator: "Curated from Tibetan Buddhist lineages",
    description: "432Hz frequencies align with Earth's natural vibration for deep restoration",
    thumbnail: "/lovable-uploads/909c474b-063c-47f3-aae1-2ef5c7098a8e.png"
  },
  {
    id: "navy-seal-calm",
    type: "soundscape",
    title: "Pre-Mission Calm",
    subtitle: "Navy SEAL Protocol",
    category: "pause",
    duration: "5 min",
    origin: "Navy SEAL Protocol",
    storyHook: "Used by special forces before high-stakes operations to achieve tactical composure.",
    creator: "Military performance protocol",
    description: "Special forces audio protocol for stress regulation under pressure",
    thumbnail: "/lovable-uploads/aa4d150b-e5fe-48d7-aa74-9f082d21ffaa.png"
  },
  {
    id: "forest-bathing",
    type: "soundscape",
    title: "Forest Bathing",
    subtitle: "Japanese Shinrin-yoku",
    category: "pause",
    duration: "15 min",
    origin: "Japanese Shinrin-yoku",
    storyHook: "Proven by Tokyo researchers to lower cortisol and boost immune function through nature immersion.",
    creator: "Traditional Japanese practice",
    description: "Recorded nature sounds proven to reduce cortisol by 50% in executive studies",
    thumbnail: "/lovable-uploads/afddfc0a-07c8-4659-bfb5-560d510b12c3.png"
  },
  {
    id: "vedic-om",
    type: "soundscape",
    title: "Vedic Om Chanting",
    subtitle: "3000-year Ancient Practice",
    category: "pause",
    duration: "10 min",
    origin: "Ancient Indian Tradition",
    storyHook: "3000-year Vedic practice that synchronizes breath, sound, and consciousness.",
    creator: "Traditional Vedic lineage",
    description: "Ancient sound vibrations for deep relaxation and nervous system reset",
    thumbnail: "/lovable-uploads/f0c69073-c184-4d25-baaa-c8e5d07cfbd9.png"
  },
  
  // PAUSE - Practices
  {
    id: "box-breathing",
    type: "practice",
    title: "Box Breathing Reset",
    subtitle: "Navy SEAL Tactical Protocol",
    category: "pause",
    duration: "5 min",
    difficulty: "beginner",
    origin: "Navy SEAL Tactical Protocol",
    storyHook: "Before high-stakes missions, Navy SEALs use this 4-4-4-4 breathing pattern to regulate heart rate and sharpen decision-making.",
    usedBy: "Special Forces, Surgeons, Olympic Athletes",
    description: "4-4-4-4 pattern used by elite military for stress regulation under pressure",
    thumbnail: "/lovable-uploads/aa4d150b-e5fe-48d7-aa74-9f082d21ffaa.png",
    steps: 4
  },
  {
    id: "vipassana-body-scan",
    type: "practice",
    title: "Vipassana Body Scan",
    subtitle: "Buddhist Mindfulness",
    category: "pause",
    duration: "20 min",
    difficulty: "intermediate",
    origin: "Buddhist Mindfulness | 2500 years",
    storyHook: "Ancient technique of systematically observing bodily sensations to develop equanimity and insight.",
    usedBy: "Meditators, Mindfulness Practitioners",
    description: "Stanford research confirms reduction in cortisol and increased emotional regulation",
    thumbnail: "/lovable-uploads/f0c69073-c184-4d25-baaa-c8e5d07cfbd9.png",
    steps: 8
  },
  {
    id: "stoic-reflection",
    type: "practice",
    title: "Stoic Evening Reflection",
    subtitle: "Marcus Aurelius Practice",
    category: "pause",
    duration: "10 min",
    difficulty: "beginner",
    origin: "Ancient Rome | Marcus Aurelius",
    storyHook: "The Roman Emperor's daily practice of reviewing actions, thoughts, and alignment with virtue at day's end.",
    usedBy: "CEOs, Leaders, Philosophers",
    description: "Daily review practice for wisdom and self-improvement",
    thumbnail: "/lovable-uploads/afddfc0a-07c8-4659-bfb5-560d510b12c3.png",
    steps: 5
  },
  {
    id: "nile-sunset-meditation",
    type: "practice",
    title: "Nile Sunset Pause Meditation",
    subtitle: "Ancient Egyptian Temple Practice",
    category: "pause",
    duration: "18 min",
    difficulty: "beginner",
    origin: "Ancient Egyptian Temple Practice",
    storyHook: "Temple priests performed sunset rituals to honor Ra's journey, using liminal moments to restore Ma'at—cosmic balance and harmony.",
    usedBy: "Temple Priests, Contemplatives, Balance Seekers",
    description: "Sacred Nile temple meditation combining breath work, lotus visualization, and sunset contemplation for deep restoration",
    thumbnail: "/lovable-uploads/909c474b-063c-47f3-aae1-2ef5c7098a8e.png",
    steps: 7
  },
  {
    id: "zazen-stone-garden",
    type: "practice",
    title: "Zazen in the Stone Garden",
    subtitle: "Japanese Zen Meditation",
    category: "pause",
    duration: "15 min",
    difficulty: "beginner",
    origin: "Japanese Zen Buddhism | 12th-13th Century",
    storyHook: "The heart of Zen Buddhism—'just sitting' meditation refined in Japanese monasteries, where monks sit for hours to achieve mushin (no-mind).",
    usedBy: "Zen Monks, Samurai Warriors, Mindfulness Practitioners",
    description: "Pure shikantaza practice in a traditional stone garden setting, cultivating profound stillness and spacious awareness",
    thumbnail: "/lovable-uploads/909c474b-063c-47f3-aae1-2ef5c7098a8e.png",
    steps: 7
  },
  
  // POWER-UP - Soundscapes
  {
    id: "gamma-frequency",
    type: "soundscape",
    title: "40Hz Gamma Focus",
    subtitle: "MIT Neuroscience Protocol",
    category: "power-up",
    duration: "12 min",
    origin: "MIT Neuroscience Protocol",
    storyHook: "Researched at MIT's McGovern Institute to enhance cognitive performance and mental clarity.",
    creator: "Based on neuroscience research",
    description: "MIT research shows 40Hz stimulation enhances cognitive performance and memory consolidation",
    thumbnail: "/lovable-uploads/c72cc661-d2db-48b0-b39a-d5c4bb2253d3.png"
  },
  {
    id: "athlete-activation",
    type: "soundscape",
    title: "Athletic Activation",
    subtitle: "Olympic Performance Audio",
    category: "power-up",
    duration: "6 min",
    origin: "Olympic Performance Protocol",
    storyHook: "Used by Olympic swimmers and track athletes for pre-competition mental preparation.",
    creator: "Sports psychology protocol",
    description: "Pre-competition energizing audio for peak performance states",
    thumbnail: "/lovable-uploads/b8ffb35c-7a57-47ef-a879-1aff9c47603d.png"
  },
  
  // POWER-UP - Practices
  {
    id: "wim-hof",
    type: "practice",
    title: "Wim Hof Power Breathing",
    subtitle: "Cold Exposure Protocol",
    category: "power-up",
    duration: "15 min",
    difficulty: "advanced",
    origin: "Cold Exposure Protocol",
    storyHook: "Dutch extreme athlete Wim Hof developed this technique to control the autonomic nervous system and boost energy.",
    usedBy: "Athletes, Biohackers, Performance Seekers",
    description: "Proven to boost adrenaline and focus through controlled hyperventilation",
    thumbnail: "/lovable-uploads/c72cc661-d2db-48b0-b39a-d5c4bb2253d3.png",
    steps: 6
  },
  
  // PRESENCE - Soundscapes
  {
    id: "deep-focus-40hz",
    type: "soundscape",
    title: "Deep Focus 40Hz",
    subtitle: "Extended Concentration Audio",
    category: "presence",
    duration: "25 min",
    origin: "MIT Neuroscience Research",
    storyHook: "Extended gamma frequency session designed for deep work and sustained focus.",
    creator: "Based on MIT research",
    description: "MIT research shows 40Hz stimulation enhances focus and cognitive performance for extended periods",
    thumbnail: "/lovable-uploads/c72cc661-d2db-48b0-b39a-d5c4bb2253d3.png"
  },
  {
    id: "binaural-study-flow",
    type: "soundscape",
    title: "Binaural Study Flow",
    subtitle: "Learning Optimization",
    category: "presence",
    duration: "45 min",
    origin: "Neuroscience-backed protocol",
    storyHook: "Beta-Alpha bridge frequency combines alertness with relaxation for optimal learning.",
    creator: "Academic performance research",
    description: "Combines alertness with relaxation for optimal learning and retention",
    thumbnail: "/lovable-uploads/c72cc661-d2db-48b0-b39a-d5c4bb2253d3.png"
  },
  {
    id: "library-ambience",
    type: "soundscape",
    title: "Library Ambience",
    subtitle: "Productive Environment Sounds",
    category: "presence",
    duration: "90 min",
    origin: "Environmental Psychology",
    storyHook: "Soft background sounds scientifically proven to enhance focus in academic settings.",
    creator: "Environmental sound design",
    description: "Soft background sounds proven to enhance focus in academic settings",
    thumbnail: "/lovable-uploads/afddfc0a-07c8-4659-bfb5-560d510b12c3.png"
  },
  
  // PRESENCE - Practices
  {
    id: "pre-performance-ritual",
    type: "practice",
    title: "Pre-Performance Ritual",
    subtitle: "Olympic Preparation",
    category: "presence",
    duration: "8 min",
    difficulty: "intermediate",
    origin: "Olympic Swimmer Protocol",
    storyHook: "Combines ancient visualization with modern sports psychology to create peak performance state before competition.",
    usedBy: "Olympic Swimmers, Performers",
    description: "Combines visualization with sports psychology for peak performance states",
    thumbnail: "/lovable-uploads/b8ffb35c-7a57-47ef-a879-1aff9c47603d.png",
    steps: 6
  },
  {
    id: "tonglen-breathing",
    type: "practice",
    title: "Tonglen Compassion Practice",
    subtitle: "Tibetan Buddhist Meditation",
    category: "presence",
    duration: "12 min",
    difficulty: "intermediate",
    origin: "Buddhist Meditation | Tibet, 9th Century",
    storyHook: "For 1200 years, Tibetan monks have practiced Tonglen to transform suffering into compassion by breathing in pain and breathing out relief.",
    usedBy: "Backed by Stanford neuroscience",
    description: "Ancient technique for developing compassion and emotional presence",
    thumbnail: "/lovable-uploads/909c474b-063c-47f3-aae1-2ef5c7098a8e.png",
    steps: 5
  },
  {
    id: "bhramari-pranayama",
    type: "practice",
    title: "Bhramari Pranayama",
    subtitle: "The Humming Bee Breath",
    category: "presence",
    duration: "12 min",
    difficulty: "beginner",
    origin: "Ancient Vedic Meditation | 5000 years",
    storyHook: "Ancient yogis discovered that humming like a bee creates profound mental stillness—modern science confirms it activates the vagus nerve for instant calm and focus.",
    usedBy: "Yogis, Meditators, Focus Seekers",
    description: "Vedic sound meditation for deep focus, mental clarity, and instant flow states",
    thumbnail: "/lovable-uploads/f0c69073-c184-4d25-baaa-c8e5d07cfbd9.png",
    steps: 6
  }
];

export const getContentByCategory = (category: 'pause' | 'power-up' | 'presence') => {
  return allContent.filter(item => item.category === category);
};

export const getSoundscapesByCategory = (category: 'pause' | 'power-up' | 'presence') => {
  return allContent.filter(item => item.category === category && item.type === 'soundscape');
};

export const getPracticesByCategory = (category: 'pause' | 'power-up' | 'presence') => {
  return allContent.filter(item => item.category === category && item.type === 'practice');
};