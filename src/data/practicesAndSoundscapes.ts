// Updated structure with contentType and tags for recommendation system
import pauseVisual from "@/assets/soundscape-pause-visual.jpg";
import renewalVisual from "@/assets/soundscape-renewal-visual.jpg";
import flowVisual from "@/assets/soundscape-flow-visual.jpg";

export type ContentType = 'soundbath' | 'guided-practice' | 'micro-practice';
export type Category = 'pause' | 'power-up' | 'presence';

export interface PracticeStep {
  title: string;
  instruction: string;
  duration: number;
  breathingPattern?: string;
  wisdomNote?: string;
}

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
  subType?: 'mindset' | 'tool'; // For micro-practices
  
  // Rich metadata for soundscapes
  fullStory?: string;
  technique?: string;
  benefits?: string[];
  completionQuote?: string;
  
  // Rich metadata for guided practices
  whatYouNeed?: string[];
  expectedOutcomes?: string[];
  practiceSteps?: PracticeStep[];
  
  // Rich metadata for mindset micro-practices
  essence?: string;
  parallel?: string;
  cue?: string;
  realExamples?: Array<{
    scenario: string;
    trigger: string;
    response: string;
  }>;
  whyThisWorks?: string;
}

export const sanctuaryContent: SanctuaryContent[] = [
  // ============= SOUNDBATHS =============
  
  // POWER-UP Soundbaths
  {
    id: "energised-focus-didgeridoo-bowls",
    title: "Energised Focus with Didgeridoo & Bowls",
    contentType: "soundbath",
    category: "power-up",
    tags: ['fire', 'focus', 'moderate', 'energy', 'activation'],
    duration: 2.5,
    creator: "Didgeridoo traditions and harmonic bowl practices",
    origin: "Didgeridoo traditions and harmonic bowl practices that channel energy into sustained attention",
    storyHook: "A two-phase soundscape designed to awaken the body's core and guide energy into focused mental flow. Low didgeridoo frequencies activate vitality, while crystalline bowls elevate awareness — turning primal momentum into calm, precise focus.",
    thumbnail: renewalVisual,
    audioSrc: "/soundscapes/didgeridoo-bowls.mp3",
    fullStory: "This soundscape bridges two ancient traditions: the Indigenous Australian didgeridoo, used for healing and ceremony for over 40,000 years, and Tibetan singing bowls, crafted for meditation and consciousness work. The didgeridoo's low-frequency drones—often below 100Hz—activate the body's primal energy centers, creating a sense of grounded vitality. The singing bowls then enter, their crystalline overtones elevating that raw energy into precise mental focus. It's a two-phase journey: first awakening the body's core power, then channeling that momentum into calm, sustained attention. Warriors used the didgeridoo before battle; monks use bowls for marathon meditation sessions. Together, they create a unique state: energized yet centered, powerful yet precise.",
    technique: "This is a two-phase practice. Phase 1 (Didgeridoo): Feel the low frequencies in your body—your chest, your belly, your legs. Don't just hear it; let it vibrate through you. This awakens your core energy and vitality. Phase 2 (Singing Bowls): As the bowls enter, feel the energy shift upward—into your heart, your throat, your head. The raw power becomes refined focus. Breathe deeply throughout. This isn't relaxation—it's energized presence. You're learning to transform primal momentum into laser-sharp attention.",
    benefits: [
      "Awakens core vitality and physical energy",
      "Channels raw energy into precise mental focus",
      "Sustains attention with energized presence",
      "Balances activation with calm clarity",
      "Builds capacity for high-intensity concentration"
    ],
    completionQuote: "True focus is not stillness—it is energy with direction. Power without presence is chaos; presence without power is passive."
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
    thumbnail: renewalVisual,
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
    origin: "Tibetan Buddhist singing bowl traditions",
    storyHook: "Used to reduce stress, restore emotional balance, and create a sense of grounded presence through harmonic resonance.",
    thumbnail: pauseVisual,
    audioSrc: "/soundscapes/harmonic-calm.mp3",
    fullStory: "For over a thousand years, Tibetan Buddhist monks have used singing bowls as sacred instruments for meditation and healing. These bronze bowls, traditionally crafted in the Himalayan regions, produce harmonic overtones that are believed to align the body's energy centers and quiet the restless mind. The practice was traditionally reserved for monastic meditation halls, where monks would strike and circle the bowls' rims to create cascading waves of sound that filled the space with resonance. Today, this ancient tradition offers a pathway to restore emotional balance and cultivate a sense of grounded presence amid modern life's turbulence.",
    technique: "Find a comfortable seated or lying position. Close your eyes and allow your body to settle. As the singing bowls begin, notice how the sound waves seem to move through your body rather than just your ears. Don't try to control your thoughts—simply let the harmonic frequencies wash over you like gentle waves. When your mind wanders, use the sound as an anchor to return to the present moment. Notice how different tones resonate in different parts of your body. This is not passive listening; it's active presence with sound as your guide.",
    benefits: [
      "Reduces stress and anxiety through harmonic resonance",
      "Restores emotional balance and inner stability",
      "Cultivates deep relaxation and nervous system regulation",
      "Anchors attention in present-moment awareness",
      "Promotes grounded presence and mental clarity"
    ],
    completionQuote: "In stillness, the mind finds its natural harmony. Like ripples on a pond, thoughts settle into peace."
  },
  {
    id: "deep-calm-forest-bathing",
    title: "Deep Calm Forest Bathing",
    contentType: "soundbath",
    category: "pause",
    tags: ['earth', 'nature', 'gentle', 'stress-relief', 'grounding'],
    duration: 2,
    creator: "Japanese Shinrin-yoku practices",
    origin: "Japanese Shinrin-yoku (forest bathing) practices",
    storyHook: "Used to cultivate deep calm, restore mental clarity, and anchor attention in the present through gentle rain and subtle village sounds.",
    thumbnail: pauseVisual,
    audioSrc: "/soundscapes/forest-bathing.mp3",
    fullStory: "In the 1980s, the Japanese government formally recognized Shinrin-yoku—'forest bathing'—as a cornerstone of preventive healthcare and healing. But the practice itself is ancient, rooted in Shinto beliefs about the sacred presence of nature. Japanese physicians discovered that simply being present in a forest environment significantly reduced stress hormones, lowered blood pressure, and improved immune function. The practice isn't about hiking or exercise—it's about opening your senses fully to the forest atmosphere: the rustle of leaves, the patter of rain, the distant sounds of village life. This soundscape captures that essence, transporting you to a rain-soaked forest where time moves slowly and the mind finds space to breathe.",
    technique: "Close your eyes and imagine yourself standing at the edge of an ancient forest after a gentle rain. Feel the cool air on your skin. As you listen, notice the layers: the soft rain, the rustling leaves, the distant village sounds. Don't try to identify every sound—instead, let the soundscape become a living environment around you. Breathe deeply and slowly, as if inhaling the forest air itself. When thoughts arise, acknowledge them gently and return your attention to the natural sounds. This is not an escape from life, but a return to your natural state of calm awareness.",
    benefits: [
      "Cultivates profound calm and nervous system rest",
      "Restores mental clarity and cognitive freshness",
      "Anchors attention in present-moment awareness",
      "Reduces rumination and mental overload",
      "Connects you to natural rhythms and grounding presence"
    ],
    completionQuote: "In nature's embrace, the mind remembers how to be still. The forest teaches what words cannot."
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
    origin: "Monastic chanting and harmonic rituals in Himalayan-style summit monasteries",
    storyHook: "Used to sharpen cognitive clarity, sustain deep focus, and expand awareness through layered chants, resonant gongs, and ethereal chimes.",
    thumbnail: flowVisual,
    audioSrc: "/soundscapes/monastic-resonance.mp3",
    fullStory: "High in the Himalayan mountains, Buddhist monks have practiced contemplative chanting for centuries as a method to sharpen awareness and sustain deep concentration. The resonant tones of their voices, combined with the deep reverberations of temple gongs and the crystalline clarity of meditation chimes, create an acoustic environment that naturally draws the mind into focused presence. These monasteries, often perched at altitudes where the air is thin and silence profound, became laboratories for understanding how sound can shape consciousness. The layered harmonics aren't merely beautiful—they're precisely calibrated to guide the mind from distraction into clear, sustained attention.",
    technique: "Sit with an upright but relaxed posture. As the chanting begins, let the low tones anchor your awareness like roots into the earth. Notice how the gongs add depth, and the chimes add clarity—three layers working together. Don't fight for focus; instead, let the sound environment create a container for your attention. When distractions arise, use the resonant chants as your anchor point. This is active listening: you're training your mind to sustain focus by riding the waves of harmonic sound. With practice, this becomes a gateway to hours of clear, effortless concentration.",
    benefits: [
      "Sharpens cognitive clarity and mental precision",
      "Sustains deep focus for extended periods",
      "Expands awareness while maintaining concentration",
      "Trains attention through harmonic resonance",
      "Reduces mental fatigue and cognitive drift"
    ],
    completionQuote: "Attention is not forced—it is cultivated. In the monastery of the mind, every sound is a teacher."
  },
  {
    id: "sustained-focus-choir-harmonic",
    title: "Sustained Focus with Choir Harmonic",
    contentType: "soundbath",
    category: "presence",
    tags: ['air', 'focus', 'moderate', 'sacred', 'resonance'],
    duration: 3.5,
    creator: "Sacred harmonic compositions",
    origin: "Sacred harmonic compositions in grand cathedrals",
    storyHook: "Used to enhance focus, cultivate mindful presence, and align energy through layered choirs, bells, and reverberant harmonics.",
    thumbnail: flowVisual,
    audioSrc: "/soundscapes/cathedral-choir-flow.mp3",
    fullStory: "The great cathedrals of Europe were designed not just as buildings but as instruments—acoustic spaces engineered to amplify the human voice into something transcendent. Gregorian chant and sacred polyphony weren't simply religious music; they were technologies for altering consciousness through harmonic resonance. The layered voices, the deep bells, the reverberant acoustics—all combined to create an environment where individual awareness could merge with something larger while maintaining crystalline focus. Modern neuroscience has confirmed what medieval monks knew intuitively: these harmonic patterns synchronize brainwaves, enhance coherence, and create optimal states for sustained mental clarity.",
    technique: "Find a comfortable position where you can remain alert yet relaxed. As the choir begins, imagine yourself standing in the center of a vast cathedral. The voices aren't coming from outside—they're surrounding you, creating a sonic architecture. Let the harmonics wash over you while keeping a thread of awareness on your breath. Notice how the bells punctuate moments of transition, how the reverb creates space. This isn't about passive listening—you're learning to hold sustained focus within a rich, complex environment. The choir becomes a mirror for your mind: multiple layers working in harmony toward a single purpose.",
    benefits: [
      "Enhances sustained focus and mental endurance",
      "Cultivates mindful presence in complex environments",
      "Aligns internal energy through harmonic resonance",
      "Reduces mental fragmentation and distraction",
      "Builds capacity for long-form concentration"
    ],
    completionQuote: "In the cathedral of consciousness, every voice matters. Focus is not singular—it is harmonious."
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
    thumbnail: flowVisual,
    audioSrc: "/soundscapes/ina-night-fields.mp3"
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
    creator: "The Humming Bee Breath",
    fullStory: "Bhramari Pranayama originates from ancient India, dating back at least 5,000 years to the Vedic period. The name comes from the Sanskrit word 'bhramari,' meaning 'bee,' as the practice mimics the gentle humming sound of a black Indian bee. Referenced in the Hatha Yoga Pradipika (15th century) and earlier tantric texts, this practice was used by yogis to achieve Pratyahara—the withdrawal of senses from external distractions and deep inward focus. The humming vibration was believed to activate the Ajna chakra (third eye) and still the fluctuations of the mind. Ancient practitioners discovered that the internal vibration creates a deeply meditative state where the mind naturally becomes absorbed in the sound, making it one of the most effective techniques for entering flow states. Vedic sages called this state 'one-pointed awareness' or Dharana—the precursor to meditation and eventual samadhi (transcendent consciousness). The practice was traditionally performed at dawn or dusk in quiet forest settings, where yogis would sync their humming with the natural sounds of bees pollinating flowers. Modern neuroscience confirms what ancient yogis knew: the vibration stimulates the vagus nerve, activating the parasympathetic nervous system while simultaneously focusing attention.",
    whatYouNeed: [
      "Essential: Quiet space where you can sit comfortably for 12 minutes",
      "Essential: Ability to hum without disturbing others (or practice during private time)",
      "Essential: Chair or cushion for upright seated position",
      "Optional: Earplugs or finger position to close ears (enhances internal sound)",
      "Optional: Aromatics—Sandalwood, lotus, or jasmine incense/oil",
      "Optional: Dim lighting or eye mask to reduce visual distraction",
      "Optional: Timer set to 12 minutes (or use the guided audio)",
      "Best Practiced: During mid-day energy dips when focus is needed",
      "Best Practiced: Before creative work or deep focus sessions",
      "Best Practiced: When feeling mentally scattered or anxious",
      "Best Practiced: As a transition ritual between different activities"
    ],
    expectedOutcomes: [
      "Immediate: Profound mental stillness and clarity",
      "Immediate: Sensation of pleasant vibration in the skull and face",
      "Immediate: Immediate reduction in mental chatter and anxiety",
      "Immediate: Feeling of being 'centered' and present",
      "Immediate: Mild euphoria or tingling sensations in the head",
      "Immediate: Instant access to focused attention state",
      "Regular Practice: Enhanced ability to drop into flow states quickly",
      "Regular Practice: Improved concentration and sustained attention",
      "Regular Practice: Reduced reactivity to stress and distractions",
      "Regular Practice: Better emotional regulation",
      "Regular Practice: Deeper meditation experiences",
      "Regular Practice: Relief from tension headaches",
      "Regular Practice: Improved quality of creative work",
      "Traditional Wisdom: Awakens dormant brain centers",
      "Traditional Wisdom: Balances both hemispheres of the brain",
      "Traditional Wisdom: Creates 'internal listening' that leads to Self-realization",
      "Traditional Wisdom: Purifies the nadis (energy channels)",
      "Traditional Wisdom: Prepares the mind for deeper meditation states"
    ],
    practiceSteps: [
      {
        title: "Sacred Arrival",
        instruction: "Settle into a comfortable seated position with your spine naturally upright. Close your eyes and begin to notice your breath without changing it. Feel the weight of your body grounding into the earth. Take three deep breaths to signal to your nervous system that it's time to turn inward.",
        duration: 1.5,
        wisdomNote: "This arrival phase is sacred. You're creating a boundary between your outer life and inner practice."
      },
      {
        title: "Pranayama Preparation",
        instruction: "Learn the ear closure technique: Place your index or middle fingers gently over your ear canals (not pressing hard, just creating a seal). Or, if you prefer, leave ears open for your first few practices. The ear closure enhances the internal sound of the hum, making it easier to absorb your attention in the vibration.",
        duration: 1.5,
        wisdomNote: "The hand position is not mandatory, but it amplifies the internal resonance. Experiment to find what works for you."
      },
      {
        title: "First Humming Cycle",
        instruction: "Take a deep breath in through your nose. On the exhale, close your mouth and make a soft humming sound—'mmmmm'—like a bee. Let the hum last the entire exhale. Notice how the sound vibrates in your face, head, and chest. Repeat this 3 times, learning the rhythm and sensation.",
        duration: 2,
        breathingPattern: "Inhale through nose → Exhale humming 'mmmmm'",
        wisdomNote: "Don't force the hum. Let it be gentle and natural. You're learning to ride the vibration like a wave."
      },
      {
        title: "Deep Immersion Rounds",
        instruction: "Now begin 12 continuous rounds of Bhramari. Inhale deeply through the nose, then exhale with the humming bee sound. With each round, let yourself go deeper into the vibration. Stop thinking about the technique—become the sound. Notice how the mind begins to quiet, how the hum absorbs your attention. If thoughts arise, let them pass and return to the hum.",
        duration: 5,
        breathingPattern: "12 rounds: Deep inhale → Long humming exhale",
        wisdomNote: "This is where the magic happens. The hum becomes an anchor, drawing your scattered attention into a single point. You're training Dharana—one-pointed focus."
      },
      {
        title: "Silent Absorption",
        instruction: "Release your hands from your ears (if they were closed). Sit in complete stillness. Don't move. Notice the resonance that remains in your body and mind. Observe the quality of silence—it's different now, deeper, more spacious. This is the state of Pratyahara, where external distractions have withdrawn and you're resting in pure awareness.",
        duration: 1.5,
        wisdomNote: "The practice doesn't end when the humming stops. This silence is the fruit. Let it soak in."
      },
      {
        title: "Return & Integration",
        instruction: "Slowly open your eyes. Take one final deep breath and bow your head gently, sealing the practice. Carry this clarity and stillness into whatever comes next. Notice how your mind feels—clear, calm, focused. This is the state of one-pointed awareness that ancient yogis cultivated.",
        duration: 0.5,
        wisdomNote: "You've just practiced a 5,000-year-old technique for entering flow states. With repetition, this becomes instant access to focused presence."
      }
    ]
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
    steps: 3,
    subType: "tool"
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
    subType: "tool"
  },
  {
    id: "space-between-stimulus-response",
    title: "Inspired from Viktor Frankl",
    contentType: "micro-practice",
    category: "pause",
    tags: ['earth', 'high-pressure', 'gentle', 'mastery', 'composure'],
    duration: 1,
    difficulty: "beginner",
    creator: "Viktor Frankl",
    origin: "\"Between stimulus and response there is a space. In that space is our power to choose our response. In our response lies our growth and our freedom.\" — Viktor Frankl",
    storyHook: "The space between stimulus and response",
    essence: "The gap between what happens and how you react is where mastery lives. Expand that space.",
    parallel: "Prefrontal cortex override of amygdala; response inhibition in neuroscience; the psychological \"pause button\"",
    cue: "\"Breathe. Space. Choose.\"",
    usedBy: "High-pressure negotiations, receiving criticism, moments of provocation, when anger or fear spike",
    thumbnail: "/lovable-uploads/06444f60-b3bd-4d38-a749-aea185d789e6.png",
    steps: 4,
    subType: "mindset",
    instructions: [
      "Catch the trigger moment (3 seconds): Notice the sensation: heart racing, jaw clenching, heat rising. Name it: \"I'm triggered.\"",
      "Create physical space (5 seconds): If standing, take one step back. If sitting, lean back in chair, uncross arms. Anywhere: Place your hand on your chest or belly.",
      "The triple breath (10 seconds): Breathe in for 4, hold for 4, out for 6. During the exhale, say internally: \"I choose my response.\"",
      "The bridging question (ongoing): \"What do I want to be true about me in 5 minutes when I look back at this moment?\""
    ],
    realExamples: [
      {
        scenario: "Someone insults your work in a meeting",
        trigger: "Your face flushes, you want to defend yourself immediately",
        response: "You pause, take one breath, then say: \"Help me understand what specifically concerns you.\" (You just bought 30 seconds to think, and shifted from defensive to curious)"
      },
      {
        scenario: "Your teenager slams a door",
        trigger: "Instant anger, you want to storm in yelling",
        response: "You stop at the door. Hand on doorknob. Three breaths. Ask yourself: \"Do I want them to remember me as someone who matches their chaos, or someone who stayed steady?\" Then knock gently."
      },
      {
        scenario: "You get a rejection email",
        trigger: "Stomach drops, immediate spiral into \"I'm not good enough\"",
        response: "Close laptop. Stand up. Walk to window. Feel your feet on ground. One minute of just breathing. Then choose: \"This is data, not destiny.\""
      }
    ],
    whyThisWorks: "The amygdala hijack happens in 0.2 seconds. Your prefrontal cortex needs 6-10 seconds to come back online. The breath physiologically activates your parasympathetic nervous system. You're not suppressing emotion—you're giving your wise brain time to catch up to your reactive brain."
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
