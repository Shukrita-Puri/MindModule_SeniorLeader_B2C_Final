// Updated structure with contentType and tags for recommendation system
import pauseVisual from "@/assets/soundscape-pause-visual.jpg";
import renewalVisual from "@/assets/soundscape-renewal-visual.jpg";
import flowVisual from "@/assets/soundscape-flow-visual.jpg";
import pauseMauve from "@/assets/mindset-pause-mauve.jpg";
import flowBlue from "@/assets/mindset-flow-blue.jpg";
import renewalColorful from "@/assets/mindset-renewal-colorful.jpg";

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
    title: "Confidence Through Cuddy's Power Posture",
    contentType: "micro-practice",
    category: "power-up",
    tags: ['fire', 'pre-meeting', 'moderate', 'confidence'],
    duration: 2,
    difficulty: "beginner",
    creator: "Amy Cuddy's body language research",
    storyHook: "Harvard research shows 2 minutes in expansive posture increases confidence hormones by 20%.",
    thumbnail: renewalColorful,
    steps: 2
  },
  {
    id: "energy-shift",
    title: "Energy Revival Through Kinesthetic Movement",
    contentType: "micro-practice",
    category: "power-up",
    tags: ['fire', 'afternoon-slump', 'moderate', 'energy-boost'],
    duration: 3,
    difficulty: "beginner",
    creator: "Kinesthetic energy technique",
    storyHook: "Movement-based practice to shift stagnant energy — athletes use this between training sets.",
    thumbnail: renewalColorful,
    steps: 3
  },

  // PAUSE Micro Practices
  {
    id: "grounding-touch",
    title: "Instant Calm Through Somatic Touch",
    contentType: "micro-practice",
    category: "pause",
    tags: ['earth', 'anxiety-relief', 'gentle', 'nervous-system'],
    duration: 2,
    difficulty: "beginner",
    creator: "Thomas Hanna, founder of Somatics",
    origin: "\"Your body is the ground of your being. It holds the key to safety, presence, and peace.\" — Adapted from Thomas Hanna, founder of Somatics",
    storyHook: "For moments of anxiety, overwhelm, panic, emotional flooding, or after receiving hard news",
    essence: "The body can calm the mind faster than thoughts can. When you touch with awareness, you signal safety directly to your nervous system.",
    parallel: "Polyvagal theory; vagus nerve activation through self-touch; interoceptive awareness; embodied safety",
    cue: "\"Touch. Feel. Soften.\"",
    usedBy: "Moments of anxiety, overwhelm, panic, emotional flooding, or after receiving hard news",
    thumbnail: pauseMauve,
    steps: 4,
    subType: "tool",
    instructions: [
      "Notice the body alarm (3 seconds): You feel the rush: heart pounding, throat tight, chest heavy, shoulders rising. Name it: \"My body is on alert.\" (Simply naming the state engages the prefrontal cortex and begins to downshift arousal.)",
      "Make contact — the anchor touch (5 seconds): Choose one: Hand on heart → activates warmth, trust, and oxytocin release | Hand on belly → deepens diaphragmatic breathing | One palm on chest, one on belly → synchronizes upper and lower body regulation | Or place both hands on your thighs → grounding through physical support. As you place your hands, apply light pressure. Feel your own weight and warmth.",
      "The settling breath (10 seconds): Inhale gently through nose for 4 seconds, hold for 2 seconds, exhale slowly through mouth for 6 seconds. (Lengthening the exhale activates the parasympathetic branch of the vagus nerve.) With each exhale, silently say: \"It's safe to soften.\"",
      "Soothing through micro-movement (ongoing): After 15–20 seconds, notice what your body wants next — maybe a sigh, a yawn, or a shoulder drop. Let it happen. Don't manage it. That's your nervous system self-correcting. Ask yourself: \"What does my body need to feel 5% safer right now?\" Then do that — maybe more pressure, slower breath, or loosening your jaw."
    ],
    realExamples: [
      {
        scenario: "Before a difficult conversation",
        trigger: "You feel a knot in your stomach, voice tightening.",
        response: "One hand on belly, one on chest. Breathe slowly. Whisper: \"I can stay open.\" Now when you speak, your tone carries steadiness instead of tension."
      },
      {
        scenario: "After reading distressing news or an emotional text",
        trigger: "You feel shaky, flooded, disconnected.",
        response: "Cross arms over your chest and tap each shoulder alternately (Butterfly Hug). After 20 seconds, your breath steadies, your eyes refocus. You've re-entered your body."
      },
      {
        scenario: "In a moment of panic or overwhelm at work",
        trigger: "You feel dizzy, everything feels \"too much.\"",
        response: "Press both feet firmly into the floor, palms flat on your thighs. Feel the ground holding you. Say quietly: \"Here. Now. Supported.\""
      }
    ],
    whyThisWorks: "Your skin is a direct access point to your autonomic nervous system. Gentle, intentional touch releases oxytocin and endorphins, lowers cortisol, and slows the heart rate. According to polyvagal theory (Stephen Porges), warm, steady contact activates the vagal brake — a physiological mechanism that signals safety to the brain. When you self-touch with presence, you're not \"comforting yourself like a child.\" You're sending a biological message: \"The threat has passed. You are safe enough to relax.\" The body leads; the mind follows."
  },
  {
    id: "space-between-stimulus-response",
    title: "Composure Through Frankl's Response Space",
    contentType: "micro-practice",
    category: "pause",
    tags: ['earth', 'high-pressure', 'gentle', 'mastery', 'composure'],
    duration: 1,
    difficulty: "beginner",
    creator: "Inspired from Viktor Frankl's choice of response",
    origin: "\"Between stimulus and response there is a space. In that space is our power to choose our response. In our response lies our growth and our freedom.\" — Viktor Frankl",
    storyHook: "For high-pressure moments, provocations, and receiving criticism with composure",
    essence: "The gap between what happens and how you react is where mastery lives. Expand that space.",
    parallel: "Prefrontal cortex override of amygdala; response inhibition in neuroscience; the psychological \"pause button\"",
    cue: "\"Breathe. Space. Choose.\"",
    usedBy: "High-pressure negotiations, receiving criticism, moments of provocation, when anger or fear spike",
    thumbnail: pauseMauve,
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
  {
    id: "fudoshin-immovable-mind",
    title: "Calm in Chaos Through Fudōshin",
    contentType: "micro-practice",
    category: "pause",
    tags: ['earth', 'high-pressure', 'leadership', 'performance', 'composure'],
    duration: 1,
    difficulty: "beginner",
    creator: "不動心 (Fudōshin) — Samurai principle, Miyamoto Musashi's teachings",
    origin: "Fudōshin (不動心) — The Immovable Mind principle from Samurai warrior philosophy",
    storyHook: "For critical performances, leadership under crisis, public speaking, and confrontation",
    essence: "Your center remains still even when the world around you moves violently. Calm presence in chaos.",
    parallel: "Psychological composure under stress; \"calm is contagious\" (Navy SEAL principle); emotional steadiness",
    cue: "\"Still center, moving world.\"",
    usedBy: "Before critical performances, leadership under crisis, public speaking, confrontation",
    thumbnail: pauseMauve,
    steps: 4,
    subType: "tool",
    instructions: [
      "Root yourself physically (10 seconds): Feet shoulder-width apart. Feel weight drop through your heels. Soften your knees slightly. Imagine roots growing from your feet into the ground.",
      "Find your gravity center (5 seconds): Place hand two inches below your navel (your hara or center of gravity in martial arts). Breathe into that spot. Imagine a dense, heavy ball of iron there.",
      "The mountain meditation (15 seconds): Eyes open or closed. Visualize yourself as a mountain: storms pass over you, wind howls, but the mountain doesn't flinch. You are the mountain. Say internally: \"Still center, moving world.\"",
      "Micro-adjustments during action (ongoing): Every 2-3 minutes during high pressure, check: Am I still breathing? Is my jaw relaxed? Weight in my heels?"
    ],
    realExamples: [
      {
        scenario: "About to give a major presentation",
        trigger: "Sweaty palms, racing thoughts, audience filing in",
        response: "In bathroom beforehand—stance wide, hand on belly, 10 slow breaths while repeating \"Still center, moving world.\" When you walk to the stage, you move like you own the ground beneath you."
      },
      {
        scenario: "Leading a crisis meeting",
        trigger: "Team is panicking, everyone talking at once, looking to you",
        response: "You don't speak immediately. You stand, feet planted, take one visible breath, then speak slowly: \"Okay. Let's take this one piece at a time.\" Your calm becomes their calm."
      },
      {
        scenario: "Confronting someone about broken trust",
        trigger: "Your voice wants to shake, emotions bubbling",
        response: "Before the conversation, you sit for 2 minutes. Feet flat on floor. Hand on belly. You rehearse your first sentence until you can say it with a steady voice. When you speak, you sound like someone who cannot be moved."
      }
    ],
    whyThisWorks: "Your body and mind are bidirectional. When you create physical stability (grounded stance, steady breath), your nervous system interprets: \"We must be safe—we're not running or collapsing.\" Your composure literally regulates others' nervous systems through mirror neurons. Leadership is a felt state, not just words."
  },
  {
    id: "eye-of-storm",
    title: "Clarity in Chaos Through Sun Tzu's Eye",
    contentType: "micro-practice",
    category: "pause",
    tags: ['earth', 'overwhelm', 'information-overload', 'focus', 'mastery'],
    duration: 1,
    difficulty: "beginner",
    creator: "Sun Tzu, The Art of War",
    origin: "\"In the midst of chaos, there is also opportunity.\" — Sun Tzu, The Art of War",
    storyHook: "For overwhelming situations, information overload, when multiple demands hit simultaneously",
    essence: "The hurricane's center is silent. Position yourself there mentally, not in the violent outer winds.",
    parallel: "Attentional control; metacognitive awareness; the \"observer self\" in mindfulness",
    cue: "\"Find the eye.\"",
    usedBy: "Overwhelming situations, information overload, when multiple demands hit simultaneously",
    thumbnail: pauseMauve,
    steps: 4,
    subType: "mindset",
    instructions: [
      "Name what's swirling around you (5 seconds): \"Okay—three deadlines, two angry emails, one meeting in 10 minutes, and my head is spinning.\"",
      "Physical anchor (3 seconds): Press your feet into the ground. Feel the chair beneath you. Touch your thumb to each finger slowly.",
      "The question that creates the eye (10 seconds): \"What's the one thing I can control in the next 60 seconds?\" Not everything. Just one thing. Maybe it's: Close Slack so the pings stop, Reply to one email with \"Got it, will respond by 3pm\", or Write down the swirling tasks so they're out of your head.",
      "Repeat the cue as a mantra (ongoing): While doing that one thing, whisper: \"Find the eye. Find the eye.\" It keeps you anchored."
    ],
    realExamples: [
      {
        scenario: "You're in a heated meeting",
        trigger: "Three people talking over each other, your idea just got attacked, you feel defensive",
        response: "Instead of reacting, you take one slow breath and say, \"Hold on—let me make sure I understand what you're saying.\" (Buying yourself 10 seconds to get to your center)"
      },
      {
        scenario: "Your inbox exploded",
        trigger: "47 unread emails, 5 marked urgent, you're paralyzed",
        response: "Close email. Open a blank doc. Write: \"What matters today?\" Pick ONE. Do that first. The storm still exists, but you're not in it."
      },
      {
        scenario: "A personal crisis hits mid-workday",
        trigger: "Bad news from home, emotions flooding, but you have a presentation in 20 minutes",
        response: "Tell someone you trust: \"I just got hard news. I need 5 minutes.\" Go to bathroom. Splash face. Three deep breaths. Tell yourself: \"For the next 20 minutes, I will do this one thing. After, I can fall apart if I need to.\" (Compartmentalization isn't suppression—it's strategic timing)"
      }
    ],
    whyThisWorks: "Your nervous system can't tell the difference between 20 threats and 1 threat—it just goes into overload. By consciously choosing ONE thing to control, you signal: \"We're not drowning. We're taking one stroke at a time.\" The eye of the storm isn't calm because the storm stopped. It's calm because you stopped trying to fight all of it at once."
  },
  {
    id: "djokovic-reset",
    title: "Instant Reset Through Djokovic's Ritual",
    contentType: "micro-practice",
    category: "pause",
    tags: ['earth', 'after-mistakes', 'performance', 'recovery', 'quick-reset'],
    duration: 1,
    difficulty: "beginner",
    creator: "Drawn from Novak Djokovic's performance psychology principles",
    origin: "\"The most important point is the next point.\" — Novak Djokovic",
    storyHook: "For moments after mistakes, during performance slumps, when past failures cloud present execution",
    essence: "The last point is dead. The future doesn't exist. Only this breath, this shot, this moment can be controlled.",
    parallel: "Present-moment awareness; resetting attentional focus; letting go of rumination",
    cue: "\"This point only.\"",
    usedBy: "After mistakes, during performance slumps, when past failures cloud present execution",
    thumbnail: pauseMauve,
    steps: 4,
    subType: "tool",
    instructions: [
      "Physical break from the past (2 seconds): Do something that marks a boundary: turn away, shake out your hands, touch something (desk, doorframe, your leg).",
      "The release breath (5 seconds): Big inhale through nose, forceful exhale through mouth (like blowing out birthday candles). Imagine the last moment leaving your body with that breath.",
      "State the present moment (3 seconds): Say aloud or internally: \"That point is over. This point starts now.\" Or simply: \"Next.\"",
      "Narrow your attention to immediate task (ongoing): What is the literal next action? Not the next 10 things. Just the one thing in front of you right now."
    ],
    realExamples: [
      {
        scenario: "You bombed a question in an interview",
        trigger: "\"I blew it. They think I'm an idiot. This interview is over.\"",
        response: "Pause. Look down. Touch your notebook. Release breath. Look back up. \"Okay, next question.\" You re-engage with this moment, not the last one."
      },
      {
        scenario: "You just lost a major client",
        trigger: "Replaying the conversation, blaming yourself, catastrophizing",
        response: "Set a timer for 5 minutes. Let yourself feel it fully. When timer goes off, stand up, shake out your body, say \"Next point.\" Open your calendar. \"What's the next call I can win?\""
      },
      {
        scenario: "Mistake in a live presentation",
        trigger: "Face goes red, you stumble on next three sentences thinking about the error",
        response: "You pause. Take a sip of water (physical break). Smile slightly. \"Let me refocus that...\" (You just gave yourself permission to start fresh mid-sentence)"
      }
    ],
    whyThisWorks: "Your brain wants to ruminate because it thinks replaying the past will prevent future pain. But when performing, rumination is cognitive load you can't afford. The physical ritual (shake, breath, touch) acts as a pattern interrupt. Djokovic does this between EVERY point—not because he's always failing, but because he's always resetting. Champions don't have fewer setbacks; they have faster resets."
  },

  // PRESENCE Micro Practices
  {
    id: "clarity-breath",
    title: "Mental Clarity Through Pranayama Breath",
    contentType: "micro-practice",
    category: "presence",
    tags: ['air', 'decision-making', 'gentle', 'mental-clarity'],
    duration: 3,
    difficulty: "beginner",
    creator: "Pranayama breathing technique",
    storyHook: "Ancient yogic breath that clears mental fog — used before important decisions for 3,000 years.",
    thumbnail: flowBlue,
    steps: 4
  },
  {
    id: "decision-pause",
    title: "Intuitive Decisions Through Executive Pause",
    contentType: "micro-practice",
    category: "presence",
    tags: ['air', 'before-decision', 'moderate', 'clarity'],
    duration: 3,
    difficulty: "beginner",
    creator: "Executive decision protocol",
    storyHook: "Top executives use this 3-minute pause before major decisions to check intuition vs. reactivity.",
    thumbnail: flowBlue,
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
