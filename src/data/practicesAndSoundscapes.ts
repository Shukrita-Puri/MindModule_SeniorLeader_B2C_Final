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
    id: "himalayan-monastery",
    type: "soundscape",
    title: "Himalayan Mountain Monastery",
    subtitle: "Monk Chant + Chimes",
    category: "pause",
    duration: "1 min 22 sec",
    origin: "Tibetan Buddhist Monasteries",
    storyHook: "High upon a snow-laden summit stands a monastery carved from volcanic stone—where sound becomes devotion.",
    creator: "Mystical monastic atmosphere composition",
    description: "Sacred confluence of monastic chant, ethereal chime, and resonant void for transcendental calm",
    thumbnail: "/lovable-uploads/909c474b-063c-47f3-aae1-2ef5c7098a8e.png"
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
  {
    id: "earth-resonance-power",
    type: "soundscape",
    title: "Earth Resonance",
    subtitle: "Didgeridoo & Singing Bowls",
    category: "power-up",
    duration: "2 min 25 sec",
    origin: "Ancient Sound Traditions",
    storyHook: "A fusion of ancient sound traditions designed to awaken focus and presence before high-energy moments—didgeridoo's primal frequency meets crystalline singing bowls.",
    creator: "Street performance meets sacred ritual",
    description: "Didgeridoo drones ignite grounding energy while singing bowls elevate awareness—transition from root activation to focused flow state",
    thumbnail: "/lovable-uploads/c72cc661-d2db-48b0-b39a-d5c4bb2253d3.png"
  },
  {
    id: "warrior-drums-power",
    type: "soundscape",
    title: "Ancestral Pulse",
    subtitle: "Viking Warrior Drums",
    category: "power-up",
    duration: "4 min",
    origin: "Ancient Warrior Traditions",
    storyHook: "The breath before impact—primal percussion invoking the warrior archetype for modern challenges. Pure drums, no melody, only courage and readiness.",
    creator: "Ritual of preparation and power",
    description: "Rhythmic invocation awakening courage and focus through elemental percussion—transforming fear into fuel before decisive moments",
    thumbnail: "/lovable-uploads/b8ffb35c-7a57-47ef-a879-1aff9c47603d.png"
  },
  
  // POWER-UP - Practices
  {
    id: "kapalabhati-pranayama",
    type: "practice",
    title: "Kapalabhati Pranayama",
    subtitle: "Skull Shining Breath",
    category: "power-up",
    duration: "6 min",
    difficulty: "intermediate",
    origin: "Ancient Yogic Practice | Hatha Yoga",
    storyHook: "For thousands of years, yogis have used this rapid-fire breathing to generate instant energy and mental clarity—ancient alternative to caffeine.",
    usedBy: "Yogis, Warriors, High Performers",
    description: "Ancient energizing breath technique for instant vitality, mental sharpness, and internal fire",
    thumbnail: "/lovable-uploads/c72cc661-d2db-48b0-b39a-d5c4bb2253d3.png",
    steps: 6
  },
  {
    id: "spartan-battle-breath",
    type: "practice",
    title: "The Spartan Battle Breath",
    subtitle: "Ancient Greek Warrior Activation",
    category: "power-up",
    duration: "7 min",
    difficulty: "intermediate",
    origin: "Ancient Spartan Warrior Protocol | 480 BCE",
    storyHook: "Before Thermopylae, 300 Spartans performed this ritual to enter 'menos'—divine battle-trance. Now access that fearless warrior state for any challenge.",
    usedBy: "Spartan Warriors, Athletes, Leaders",
    description: "Ancient Greek warrior breathing ritual for fearless courage, peak power, and commanding presence",
    thumbnail: "/lovable-uploads/b8ffb35c-7a57-47ef-a879-1aff9c47603d.png",
    steps: 6
  },
  
  // PRESENCE - Soundscapes
  {
    id: "cathedral-choir-flow",
    type: "soundscape",
    title: "Cathedral Choir Flow",
    subtitle: "Resonance for Healing & Focus",
    category: "presence",
    duration: "3 min 18 sec",
    origin: "Sacred Cathedral Resonance",
    storyHook: "Step into a grand cathedral, where sunlight spills across vaulted ceilings and every stone resonates with history. Within this vast space, sound takes on dimension: a choir of voices rises and falls, interwoven with bells, subtle percussion, and reverberant harmonics.",
    creator: "Sacred harmonic composition",
    description: "Layered harmonics and rhythmic pulses sharpen attention, foster mindful presence, and create energetic alignment through cathedral-inspired resonance",
    thumbnail: "/lovable-uploads/909c474b-063c-47f3-aae1-2ef5c7098a8e.png"
  },
  {
    id: "earth-resonance-presence",
    type: "soundscape",
    title: "Earth Resonance",
    subtitle: "Didgeridoo & Singing Bowls",
    category: "presence",
    duration: "2 min 25 sec",
    origin: "Ancient Sound Traditions",
    storyHook: "A fusion of ancient sound traditions designed to awaken focus and presence before high-energy moments—didgeridoo's primal frequency meets crystalline singing bowls.",
    creator: "Street performance meets sacred ritual",
    description: "Didgeridoo drones ignite grounding energy while singing bowls elevate awareness—transition from root activation to focused flow state",
    thumbnail: "/lovable-uploads/c72cc661-d2db-48b0-b39a-d5c4bb2253d3.png"
  },
  {
    id: "warrior-drums-presence",
    type: "soundscape",
    title: "Ancestral Pulse",
    subtitle: "Viking Warrior Drums",
    category: "presence",
    duration: "4 min",
    origin: "Ancient Warrior Traditions",
    storyHook: "The breath before impact—primal percussion invoking the warrior archetype for modern challenges. Pure drums, no melody, only courage and readiness.",
    creator: "Ritual of preparation and power",
    description: "Rhythmic invocation awakening courage and focus through elemental percussion—transforming fear into fuel before decisive moments",
    thumbnail: "/lovable-uploads/b8ffb35c-7a57-47ef-a879-1aff9c47603d.png"
  },
  {
    id: "ina-night-fields",
    type: "soundscape",
    title: "Ina Night Fields (Tsukiyomi)",
    subtitle: "Evening Crickets and Night Ambience",
    category: "presence",
    duration: "4 min 2 sec",
    origin: "Nagano Countryside, Japan",
    storyHook: "In the quiet heart of Nagano's countryside, where the land folds gently into mist and memory, night hums in perfect rhythm. Through the open window of a farmhouse in Ina, the living orchestra of the fields begins.",
    creator: "Natural field recording",
    description: "Authentic Japanese countryside soundscape for lucid stillness, textural awareness, and organic focus through cricket rhythms",
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
  },
  {
    id: "trataka-flame-gaze",
    type: "practice",
    title: "Trataka - The Steady Flame Gaze",
    subtitle: "Ancient Yogic Focus Meditation",
    category: "presence",
    duration: "8 min",
    difficulty: "beginner",
    origin: "Ancient Yogic Practice | Hatha Yoga Pradipika",
    storyHook: "For thousands of years, yogis have gazed at flames to develop superhuman focus—training the eyes trains the mind, leading to instant flow states.",
    usedBy: "Yogis, Meditators, High Performers",
    description: "Ancient one-pointed concentration technique for instant mental clarity and flow",
    thumbnail: "/lovable-uploads/c72cc661-d2db-48b0-b39a-d5c4bb2253d3.png",
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