// Updated structure with contentType and tags for recommendation system
import pauseVisual from "@/assets/soundscape-pause-visual.jpg";
import renewalVisual from "@/assets/soundscape-renewal-visual.jpg";
import flowVisual from "@/assets/soundscape-flow-visual.jpg";
import pauseMauve from "@/assets/mindset-pause-mauve.jpg";
import flowBlue from "@/assets/mindset-flow-blue.jpg";
import renewalColorful from "@/assets/mindset-renewal-colorful.jpg";
import flowMeditationColorful from "@/assets/flow-meditation-colorful.jpg";
import renewalStretchIllustration from "@/assets/renewal-stretch-illustration.jpg";

export type ContentType = 'soundbath' | 'guided-practice' | 'micro-practice';
export type Category = 'pause' | 'power-up' | 'presence';

export interface PracticeStep {
  title: string;
  instruction: string;
  duration: number;
  breathingPattern?: string;
  wisdomNote?: string;
}

export interface StructuredTags {
  pillar: 'pause' | 'flow' | 'renewal';
  masterySubtypes: string[]; // e.g., ['deep-calm', 'grounding', 'composure', 'activate', 'optimize', 'maintain-peak', 'recharge', 'restore', 'refresh']
  goalTags: string[]; // e.g., ['grounding', 'breathing_regulation', 'composure', 'focus', 'decision_readiness']
  physioTarget: string[]; // e.g., ['hrv_increase', 'hr_decrease', 'cortisol_reduce', 'alertness_increase']
  contextTags: string[]; // e.g., ['pre-meeting', 'post-meeting', 'between-meetings', 'morning_ritual', 'afternoon_slump', 'evening_winddown']
  environmentSuitability: string[]; // e.g., ['private', 'shared_space', 'public', 'on_the_go']
  equipment: string[]; // e.g., ['headphones', 'none', 'speaker', 'watch']
  cognitiveLoadHelp: string[]; // e.g., ['lowers_cognitive_load', 'supports_decision', 'improves_concentration']
  socialTag: 'solo' | 'pair' | 'group';
  intensityLevel: 'low' | 'medium' | 'high';
  energyDirection: string; // e.g., 'uplift', 'stabilize', 'downshift', 'clarify', 'motivate'
}

export interface SanctuaryContent {
  id: string;
  title: string;
  contentType: ContentType;
  category: Category;
  tags: string[]; // Legacy tags - kept for backward compatibility
  structuredTags?: StructuredTags; // NEW: Multi-dimensional tagging system (optional during migration)
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
  voice?: 'male' | 'female' | 'neutral' | 'none' | 'ai';
  language?: string;
  deliveryModality?: string[];
  
  // Computed metrics (populated from database aggregations)
  metrics?: {
    popularityScore: number;
    avgCompletionRate: number;
    avgEffectivenessScore: number;
    totalUsageCount: number;
    lastUpdated: string;
  };
  
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
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['activate', 'optimize'],
      goalTags: ['energize', 'focus', 'mental_clarity', 'confidence'],
      physioTarget: ['alertness_increase', 'hrv_increase', 'sympathetic_modulation'],
      contextTags: ['morning_ritual', 'pre-meeting', 'pre-performance', 'afternoon_slump'],
      environmentSuitability: ['private', 'home'],
      equipment: ['headphones', 'speaker'],
      cognitiveLoadHelp: ['improves_concentration'],
      socialTag: 'solo',
      intensityLevel: 'medium',
      energyDirection: 'uplift'
    },
    voice: 'none',
    language: 'en',
    deliveryModality: ['headphones', 'speaker'],
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
    structuredTags: {
      pillar: 'renewal',
      masterySubtypes: ['recharge', 'restore'],
      goalTags: ['grounding', 'energize', 'confidence', 'decision_readiness'],
      physioTarget: ['hrv_increase', 'alertness_increase'],
      contextTags: ['morning_ritual', 'pre-performance', 'lunch_break'],
      environmentSuitability: ['private', 'home'],
      equipment: ['headphones', 'speaker'],
      cognitiveLoadHelp: ['supports_decision'],
      socialTag: 'solo',
      intensityLevel: 'medium',
      energyDirection: 'stabilize'
    },
    voice: 'none',
    language: 'en',
    deliveryModality: ['headphones', 'speaker'],
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
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['optimize', 'maintain-peak'],
      goalTags: ['centering', 'mental_clarity', 'focus', 'balancing'],
      physioTarget: ['hrv_increase', 'cortisol_reduce'],
      contextTags: ['pre-meeting', 'between-meetings', 'pre-performance'],
      environmentSuitability: ['private', 'home', 'office'],
      equipment: ['headphones', 'speaker'],
      cognitiveLoadHelp: ['improves_concentration', 'supports_decision'],
      socialTag: 'solo',
      intensityLevel: 'medium',
      energyDirection: 'clarify'
    },
    voice: 'none',
    language: 'en',
    deliveryModality: ['headphones', 'speaker'],
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
    structuredTags: {
      pillar: 'pause',
      masterySubtypes: ['deep-calm', 'grounding'],
      goalTags: ['grounding', 'deep_reset', 'stress_reduction', 'calming', 'release'],
      physioTarget: ['hrv_increase', 'hr_decrease', 'cortisol_reduce', 'parasympathetic_activation'],
      contextTags: ['evening_winddown', 'post-meeting', 'afternoon_slump', 'bedtime'],
      environmentSuitability: ['private', 'home'],
      equipment: ['headphones', 'speaker'],
      cognitiveLoadHelp: ['lowers_cognitive_load'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'downshift'
    },
    voice: 'none',
    language: 'en',
    deliveryModality: ['headphones', 'speaker'],
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
    structuredTags: {
      pillar: 'pause',
      masterySubtypes: ['deep-calm', 'composure'],
      goalTags: ['grounding', 'centering', 'composure', 'mental_clarity'],
      physioTarget: ['hrv_increase', 'hr_decrease', 'cortisol_reduce'],
      contextTags: ['pre-meeting', 'post-meeting', 'evening_winddown'],
      environmentSuitability: ['private', 'home'],
      equipment: ['headphones', 'speaker'],
      cognitiveLoadHelp: ['lowers_cognitive_load', 'supports_decision'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'stabilize'
    },
    voice: 'none',
    language: 'en',
    deliveryModality: ['headphones', 'speaker'],
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
    id: "kapalabhati-pranayama",
    title: "Energy Surge Through Kapalabhati Pranayama",
    contentType: "guided-practice",
    category: "power-up",
    tags: ['fire', 'energy-boost', 'intense', 'morning', 'breathwork'],
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['activate', 'optimize'],
      goalTags: ['energize', 'alertness', 'vitality', 'mental_clarity'],
      physioTarget: ['alertness_increase', 'sympathetic_activation', 'lung_capacity'],
      contextTags: ['morning_ritual', 'pre-workout', 'afternoon_slump', 'pre-presentation'],
      environmentSuitability: ['private', 'home'],
      equipment: ['none'],
      cognitiveLoadHelp: ['creative_thinking', 'supports_decision'],
      socialTag: 'solo',
      intensityLevel: 'high',
      energyDirection: 'upshift'
    },
    duration: 6,
    difficulty: "intermediate",
    origin: "Ancient Yogic Energizing Breath",
    storyHook: "Yogis used this rapid-fire breathing for thousands of years to generate instant vitality—nature's alternative to caffeine.",
    usedBy: "Yogis, Warriors, High Performers",
    thumbnail: renewalStretchIllustration,
    steps: 6,
    creator: "Ancient Yogic Energizing Breath",
    audioSrc: "/guided-practices/kapalabhati-pranayama.mp3",
    fullStory: "Kapalabhati, meaning 'skull shining' in Sanskrit, is an ancient yogic cleansing technique from the Hatha Yoga Pradipika. Yogis discovered that rapid, forceful exhalations generate immediate vitality and mental clarity. The vigorous diaphragmatic pumping creates an internal organ massage, stimulates the sympathetic nervous system, and floods the body with oxygen and energy.",
    whatYouNeed: [
      "⚠️ DO NOT PRACTICE IF: Pregnant, heart disease, high blood pressure, hernia, gastric ulcers, recent abdominal surgery, epilepsy/seizures, vertigo/migraine, severe asthma/COPD",
      "⚠️ PRACTICE WITH SUPERVISION: Diabetes, mild back/neck problems",
      "Essential: Empty stomach (at least 2 hours after eating)",
      "Essential: Comfortable seated position with straight spine",
      "Essential: Box of tissues nearby (practice clears sinuses)",
      "Essential: Water to drink afterward",
      "Best Practiced: First thing in the morning, before physical workouts, mid-afternoon energy slumps, before important presentations"
    ],
    expectedOutcomes: [
      "Immediate: Surge of energy and vitality",
      "Immediate: Complete mental clarity and alertness",
      "Immediate: Feeling of internal heat and activation",
      "Immediate: Tingling sensations throughout body",
      "Regular Practice: Significantly increased energy levels",
      "Regular Practice: Improved lung capacity and respiratory health",
      "Regular Practice: Stronger core muscles",
      "Regular Practice: Enhanced digestive fire and metabolism"
    ],
    practiceSteps: [
      { title: "Preparation & Technique", instruction: "Sit with a straight spine. Place one hand on your belly. Practice the breath: Sharp, forceful exhale through nose (belly contracts), passive inhale (belly relaxes). The exhale is active, the inhale is automatic.", duration: 1, wisdomNote: "This is the opposite of normal breathing. The exhale is the power stroke." },
      { title: "First Activation Round", instruction: "Begin 30 rapid breaths. Pump your belly—sharp exhale, passive inhale. Find your rhythm. At the end, inhale deeply, hold for 10 seconds, then exhale completely.", duration: 1, breathingPattern: "30 rapid breaths + hold" },
      { title: "Second Power Round", instruction: "Now 50 rapid breaths. Go faster, deeper. Feel the heat building. Finish with deep inhale, hold for 15 seconds, then controlled exhale.", duration: 1.5, breathingPattern: "50 rapid breaths + hold" },
      { title: "Peak Performance Round", instruction: "Final round: 70-100 rapid breaths. Maximum power. Your body is a furnace. Finish with deep inhale, hold as long as comfortable (20-30 seconds), then exhale slowly.", duration: 2, breathingPattern: "70-100 rapid breaths + extended hold", wisdomNote: "Warriors used this before battle. You've awakened your inner fire." },
      { title: "Integration Breath", instruction: "Return to normal breathing. Notice the surge of energy, the clarity, the tingling. This is pranic activation—life force coursing through you.", duration: 0.5 },
      { title: "Seal & Rise", instruction: "Take one final deep breath. Set your intention for the energized state you've created. Now rise and channel this power into your day.", duration: 0.5, wisdomNote: "Ancient yogis called this 'skull shining' because it illuminates the mind with vitality." }
    ]
  },
  {
    id: "spartan-battle-breath",
    title: "Warrior Courage Through Spartan Battle Breath",
    contentType: "guided-practice",
    category: "power-up",
    tags: ['fire', 'pre-meeting', 'intense', 'warrior', 'activation'],
    duration: 7,
    difficulty: "intermediate",
    origin: "Ancient Greek Warrior Activation",
    storyHook: "Before Thermopylae, Spartans performed this ritual to enter 'menos'—divine battle-trance. Access that fearless state for modern challenges.",
    usedBy: "Spartan Warriors, Athletes, Leaders",
    thumbnail: renewalStretchIllustration,
    steps: 6,
    creator: "Ancient Greek Warrior Activation",
    audioSrc: "/guided-practices/spartan-battle-breath.mp3",
    fullStory: "Before the Battle of Thermopylae (480 BCE), Spartan warriors performed breathing rituals combined with battle cries to enter 'menos'—divine fury. Historical sources describe how they used rhythmic breathing and synchronized movements to create unified energy and fearless presence. Controlled hyperventilation increases adrenaline, reduces fear response, and creates a transcendent state of courage.",
    whatYouNeed: [
      "⚠️ DO NOT PRACTICE IF: Heart conditions, high blood pressure, pregnant, recent injuries, prone to panic attacks",
      "Essential: Standing space where you can move and make noise",
      "Essential: Privacy (you will shout)",
      "Essential: Empty stomach",
      "Optional: Physical prop to grip (simulates spear/sword)",
      "Optional: Mirror to witness your transformation",
      "Best Practiced: Before athletic competitions, challenging confrontations, performances, high-stakes moments"
    ],
    expectedOutcomes: [
      "Immediate: Massive surge of adrenaline and energy",
      "Immediate: Feeling of invincibility and fearlessness",
      "Immediate: Complete mental focus and clarity",
      "Immediate: Heightened physical strength and pain tolerance",
      "Regular Practice: Significantly increased confidence and assertiveness",
      "Regular Practice: Improved ability to face difficult situations",
      "Regular Practice: Enhanced physical power and endurance",
      "Regular Practice: Leadership qualities and commanding presence"
    ],
    practiceSteps: [
      { title: "Warrior's Stance", instruction: "Stand with feet shoulder-width apart. Ground through your heels. Roll your shoulders back. Feel your spine lengthen. Close your eyes and visualize yourself as a warrior preparing for battle. Set your intention: What challenge are you facing?", duration: 1, wisdomNote: "The Spartans believed that physical posture shapes internal state. Stand like a warrior, become a warrior." },
      { title: "Shield Wall Breathing", instruction: "Begin slow, deep breathing—4-second inhale through nose, 6-second exhale through mouth. With each breath, expand your chest like you're wearing armor. Feel yourself becoming larger, more powerful. Do 5 cycles.", duration: 1.5, breathingPattern: "Slow, powerful breathing" },
      { title: "Battle March Activation", instruction: "Now march in place with forceful steps. Breathe with each step—inhale on two steps, exhale on two steps. Increase your pace. Feel your heartrate rising. Pump your arms. This is the approach to battle. Do 60 seconds.", duration: 2, breathingPattern: "Breathing synchronized with movement", wisdomNote: "Spartans marched as one. The collective rhythm created invincibility." },
      { title: "The Paean - War Cry", instruction: "Take the deepest breath you can. As you exhale, release a primal battle cry—'HA!' or 'AHOO!' Use your full voice. Feel the vibration in your chest. Repeat 3 times, each louder than the last.", duration: 1.5, wisdomNote: "The paean expelled fear and summoned divine courage. Your voice is a weapon." },
      { title: "Menos - Battle Trance", instruction: "Stand perfectly still. Eyes open. Breathe powerfully. You are the warrior, fully activated, absolutely fearless. Hold this state for 60 seconds. Feel the menos—divine fury channeled into calm, controlled power.", duration: 1, wisdomNote: "This is the state Spartans fought in: utterly calm, utterly lethal." },
      { title: "Return of the Victor", instruction: "Slowly return to normal breathing. Place hand on heart. Bow your head. You've honored the ancient tradition. Carry this warrior energy into your challenge.", duration: 0.5, wisdomNote: "The battle is won before it begins. You are ready." }
    ]
  },
  {
    id: "box-breathing",
    title: "Tactical Composure Through Box Breathing",
    contentType: "guided-practice",
    category: "power-up",
    tags: ['fire', 'pre-meeting', 'moderate', 'tactical'],
    structuredTags: {
      pillar: 'renewal',
      masterySubtypes: ['recharge', 'restore'],
      goalTags: ['energize', 'grounding', 'confidence', 'balancing'],
      physioTarget: ['hrv_increase', 'alertness_increase'],
      contextTags: ['morning_ritual', 'afternoon_slump', 'lunch_break'],
      environmentSuitability: ['private', 'home', 'office'],
      equipment: ['none'],
      cognitiveLoadHelp: ['supports_decision', 'creative_thinking'],
      socialTag: 'solo',
      intensityLevel: 'medium',
      energyDirection: 'stabilize'
    },
    voice: 'neutral',
    language: 'en',
    deliveryModality: ['none'],
    duration: 5,
    difficulty: "beginner",
    origin: "Navy SEAL Tactical Protocol",
    storyHook: "Navy SEALs use this 4-4-4-4 breathing pattern before high-stakes missions to regulate heart rate and sharpen decision-making under pressure.",
    usedBy: "Special Forces, Surgeons, First Responders, Athletes",
    thumbnail: renewalStretchIllustration,
    steps: 4,
    creator: "Navy SEAL Tactical Protocol",
    audioSrc: "/guided-practices/box-breathing.mp3",
    fullStory: "Navy SEALs developed box breathing for tactical composure before high-stakes missions. The 4-4-4-4 pattern (inhale-hold-exhale-hold) activates the parasympathetic nervous system, creating calm alertness. Used by elite operators, surgeons, and first responders to make sharp decisions under extreme pressure.",
    whatYouNeed: [
      "Essential: Quiet space for 5 minutes",
      "Essential: Comfortable seated position",
      "Best Practiced: Before high-stakes decisions, stressful meetings, performance moments, anytime composure is needed"
    ],
    expectedOutcomes: [
      "Immediate: Stress reduction within 60 seconds",
      "Immediate: Enhanced mental clarity and focus",
      "Immediate: Improved emotional control",
      "Immediate: Lowered heart rate and blood pressure",
      "Regular Practice: Greater ability to perform under pressure",
      "Regular Practice: Improved decision-making in stressful situations"
    ],
    practiceSteps: [
      { title: "Find Your Center", instruction: "Sit comfortably with spine straight but not rigid. Rest hands on lap. Close your eyes or soften your gaze. Take a few natural breaths to settle in.", duration: 0.5, wisdomNote: "SEALs begin every mission brief with this centering. Composure precedes action." },
      { title: "Learn the Box Pattern", instruction: "The box has 4 equal sides: Inhale (4 counts) → Hold (4 counts) → Exhale (4 counts) → Hold (4 counts). Practice 3 rounds slowly to establish the rhythm.", duration: 1.5, breathingPattern: "4-4-4-4 pattern", wisdomNote: "This pattern brings your nervous system into perfect balance." },
      { title: "Deep Practice Rounds", instruction: "Continue the box breathing for 8-10 complete rounds. Inhale through nose for 4, hold for 4, exhale through mouth for 4, hold empty for 4. Let the pattern become automatic. Your mind and body are now in sync.", duration: 2.5, breathingPattern: "Continuous 4-4-4-4 cycles", wisdomNote: "Three minutes of box breathing creates unshakeable composure." },
      { title: "Return with Readiness", instruction: "Take one final deep breath. Open your eyes slowly. Notice the calm clarity. You're now in tactical mode—relaxed but ready, calm but alert.", duration: 0.5, wisdomNote: "You've mastered the breath. You've mastered the moment." }
    ]
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
    id: "pranayama-clarity",
    title: "Pranayama Clarity Breath",
    contentType: "guided-practice",
    category: "pause",
    tags: ['earth', 'decision-making', 'gentle', 'mental-clarity', 'calm'],
    duration: 3,
    difficulty: "beginner",
    origin: "Ancient Yogic Pranayama | 3000+ years",
    storyHook: "For over 3,000 years, yogis have used alternate nostril breathing to clear mental fog and balance the nervous system before important decisions.",
    usedBy: "Yogis, Meditators, Decision Makers",
    thumbnail: pauseVisual,
    steps: 4,
    creator: "Nadi Shodhana (Channel Purification)",
    audioSrc: "/guided-practices/pranayama-clarity.mp3",
    whatYouNeed: [
      "Essential: Quiet space for 3-5 minutes",
      "Essential: Comfortable seated position",
      "Optional: Knowledge of which nostril feels more open",
      "Best Practiced: Before important decisions or meetings",
      "Best Practiced: When experiencing mental fog or indecision"
    ],
    expectedOutcomes: [
      "Immediate: Clearing of mental fog within 30-60 seconds",
      "Immediate: Balanced, calm nervous system activation",
      "Immediate: Enhanced clarity for decision-making",
      "Regular Practice: Improved focus and mental sharpness",
      "Regular Practice: Greater emotional regulation"
    ]
  },
  {
    id: "vipassana-body-scan",
    title: "Vipassana Body Scan",
    contentType: "guided-practice",
    category: "pause",
    tags: ['earth', 'grounding', 'moderate', 'awareness'],
    structuredTags: {
      pillar: 'pause',
      masterySubtypes: ['grounding', 'deep-calm'],
      goalTags: ['breathing_regulation', 'stress_reduction', 'grounding', 'release'],
      physioTarget: ['hr_decrease', 'cortisol_reduce', 'parasympathetic_activation'],
      contextTags: ['quick_reset', 'between-meetings', 'post-meeting'],
      environmentSuitability: ['office', 'shared_space', 'public', 'on_the_go'],
      equipment: ['none'],
      cognitiveLoadHelp: ['lowers_cognitive_load'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'downshift'
    },
    voice: 'neutral',
    language: 'en',
    deliveryModality: ['none'],
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
    id: "bhramari-pranayama",
    title: "Deep Focus Through Bhramari Pranayama",
    contentType: "guided-practice",
    category: "presence",
    tags: ['air', 'focus', 'gentle', 'meditation', 'flow'],
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['optimize', 'maintain-peak'],
      goalTags: ['focus', 'mental_clarity', 'meditation', 'flow'],
      physioTarget: ['parasympathetic_activation', 'vagal_tone', 'focus_enhancement'],
      contextTags: ['midday_reset', 'pre-creative-work', 'meditation', 'flow_work'],
      environmentSuitability: ['private', 'home', 'office'],
      equipment: ['none'],
      cognitiveLoadHelp: ['deep_focus', 'creative_thinking', 'lowers_cognitive_load'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'stabilize'
    },
    duration: 12,
    difficulty: "beginner",
    origin: "Ancient Vedic Meditation Sound",
    storyHook: "Ancient yogis discovered that humming like a bee creates profound mental stillness—modern science confirms it activates the vagus nerve for instant calm and focus.",
    usedBy: "Yogis, Meditators, Focus Seekers",
    thumbnail: flowMeditationColorful,
    steps: 6,
    creator: "Ancient Vedic Meditation Sound",
    audioSrc: "/guided-practices/bhramari-pranayama.mp3",
    fullStory: "Bhramari Pranayama originates from ancient India, dating back 5,000 years to the Vedic period. Named after the Sanskrit word 'bhramari' (bee), the practice mimics a bee's humming sound. Ancient yogis discovered that internal vibration creates deep meditative states where the mind naturally absorbs into sound—one of the most effective techniques for entering flow states. Modern neuroscience confirms the vibration stimulates the vagus nerve, activating the parasympathetic nervous system while focusing attention.",
    whatYouNeed: [
      "Essential: Quiet space where you can sit comfortably for 12 minutes",
      "Essential: Ability to hum without disturbing others",
      "Essential: Chair or cushion for upright seated position",
      "Optional: Earplugs or finger position to close ears (enhances internal sound)",
      "Optional: Aromatics—Sandalwood, lotus, or jasmine incense/oil",
      "Best Practiced: During mid-day energy dips, before creative work, when feeling mentally scattered, as transition rituals"
    ],
    expectedOutcomes: [
      "Immediate: Profound mental stillness and clarity",
      "Immediate: Pleasant vibration sensation in skull and face",
      "Immediate: Reduction in mental chatter and anxiety",
      "Immediate: Feeling centered and present",
      "Immediate: Instant access to focused attention state",
      "Regular Practice: Enhanced ability to drop into flow states quickly",
      "Regular Practice: Improved concentration and sustained attention",
      "Regular Practice: Better emotional regulation"
    ],
    practiceSteps: [
      { title: "Sacred Arrival", instruction: "Settle into a comfortable seated position with your spine naturally upright. Close your eyes and begin to notice your breath without changing it. Feel the weight of your body grounding into the earth. Take three deep breaths to signal to your nervous system that it's time to turn inward.", duration: 1.5, wisdomNote: "This arrival phase is sacred. You're creating a boundary between your outer life and inner practice." },
      { title: "Pranayama Preparation", instruction: "Learn the ear closure technique: Place your index or middle fingers gently over your ear canals (not pressing hard, just creating a seal). Or, if you prefer, leave ears open for your first few practices. The ear closure enhances the internal sound of the hum, making it easier to absorb your attention in the vibration.", duration: 1.5, wisdomNote: "The hand position is not mandatory, but it amplifies the internal resonance." },
      { title: "First Humming Cycle", instruction: "Take a deep breath in through your nose. On the exhale, close your mouth and make a soft humming sound—'mmmmm'—like a bee. Let the hum last the entire exhale. Notice how the sound vibrates in your face, head, and chest. Repeat this 3 times, learning the rhythm and sensation.", duration: 2, breathingPattern: "Inhale through nose → Exhale humming 'mmmmm'", wisdomNote: "Don't force the hum. Let it be gentle and natural." },
      { title: "Deep Immersion Rounds", instruction: "Now begin 12 continuous rounds of Bhramari. Inhale deeply through the nose, then exhale with the humming bee sound. With each round, let yourself go deeper into the vibration. Stop thinking about the technique—become the sound. Notice how the mind begins to quiet, how the hum absorbs your attention.", duration: 5, breathingPattern: "12 rounds: Deep inhale → Long humming exhale", wisdomNote: "The hum becomes an anchor, drawing scattered attention into a single point. You're training Dharana—one-pointed focus." },
      { title: "Silent Absorption", instruction: "Release your hands from your ears. Sit in complete stillness. Notice the resonance that remains in your body and mind. Observe the quality of silence—it's different now, deeper, more spacious. This is Pratyahara, where external distractions have withdrawn and you're resting in pure awareness.", duration: 1.5, wisdomNote: "The practice doesn't end when the humming stops. This silence is the fruit." },
      { title: "Return & Integration", instruction: "Slowly open your eyes. Take one final deep breath and bow your head gently, sealing the practice. Carry this clarity and stillness into whatever comes next. Notice how your mind feels—clear, calm, focused.", duration: 0.5, wisdomNote: "You've just practiced a 5,000-year-old technique for entering flow states." }
    ]
  },
  {
    id: "trataka-flame-gaze",
    title: "One-Pointed Focus Through Trataka",
    contentType: "guided-practice",
    category: "presence",
    tags: ['air', 'focus', 'moderate', 'meditation', 'clarity'],
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['optimize', 'maintain-peak'],
      goalTags: ['focus', 'concentration', 'mental_clarity', 'flow'],
      physioTarget: ['focus_enhancement', 'gamma_waves', 'visual_processing'],
      contextTags: ['morning_ritual', 'pre-deep-work', 'meditation', 'before_important_task'],
      environmentSuitability: ['private', 'home'],
      equipment: ['candle', 'matches'],
      cognitiveLoadHelp: ['deep_focus', 'creative_thinking', 'supports_decision'],
      socialTag: 'solo',
      intensityLevel: 'medium',
      energyDirection: 'stabilize'
    },
    duration: 8,
    difficulty: "beginner",
    origin: "Ancient Yogic Focus Meditation",
    storyHook: "Yogis gazed at flames for centuries to develop superhuman focus—training the eyes trains the mind, creating instant flow states.",
    usedBy: "Yogis, Meditators, High Performers",
    thumbnail: flowMeditationColorful,
    steps: 6,
    creator: "Ancient Yogic Focus Meditation",
    audioSrc: "/guided-practices/trataka-flame-gaze.mp3",
    fullStory: "Trataka is one of six purification practices from the Hatha Yoga Pradipika (15th century). The word means 'to gaze steadily.' Ancient yogis discovered that training the eyes to remain perfectly still naturally draws the mind into deep concentration. The flame was chosen because fire represents consciousness itself in Vedic philosophy. Modern research shows Trataka increases gamma brainwave activity associated with peak concentration and flow states.",
    whatYouNeed: [
      "Essential: One candle (any size, unscented works best)",
      "Essential: Matches or lighter",
      "Essential: Stable surface at eye level when seated",
      "Essential: Comfortable seated position 3-4 feet from candle",
      "Optional: Dim room with all other lights off",
      "Optional: Eye drops if your eyes are sensitive",
      "Best Practiced: Before deep work sessions, in the morning to set focused tone, before meditation, when feeling mentally scattered"
    ],
    expectedOutcomes: [
      "Immediate: Profound mental clarity and focus",
      "Immediate: Complete cessation of mental chatter",
      "Immediate: Sense of absorption where time disappears",
      "Immediate: Slight tingling or pressure at third eye center",
      "Immediate: Instant entry into flow state",
      "Regular Practice: Dramatically improved concentration span",
      "Regular Practice: Ability to enter flow states at will",
      "Regular Practice: Enhanced visualization abilities",
      "Regular Practice: Deeper meditation experiences"
    ],
    practiceSteps: [
      { title: "Sacred Setup", instruction: "Light the candle. Place it 3-4 feet away at eye level. Sit comfortably with spine upright. Set your intention: What requires your deepest focus today? Close your eyes briefly to center yourself.", duration: 1, wisdomNote: "The flame is not just an object—it's a doorway to one-pointed awareness." },
      { title: "Soft Gazing Preparation", instruction: "Open your eyes. Look at the flame gently—not staring hard, but resting your gaze on it. Notice its shape, color, movement. Relax your face, jaw, shoulders. Blink naturally when needed. This is soft gazing, not forcing.", duration: 1, wisdomNote: "Trataka is not about straining. It's about gentle, sustained attention." },
      { title: "First Gaze Cycle", instruction: "Gaze at the flame for 30 seconds without blinking. When you must blink or when eyes water, close them gently. Observe the afterimage behind your eyelids—the flame's impression on your inner vision. Rest for 30 seconds with eyes closed.", duration: 1.5, wisdomNote: "The afterimage stimulates the Ajna chakra, the third eye center of intuition and insight." },
      { title: "Deep Immersion Cycles", instruction: "Repeat three more rounds: 45 seconds gazing, 30 seconds closed; 60 seconds gazing, 30 seconds closed; 60 seconds gazing, 30 seconds closed. With each round, notice distractions falling away. You're becoming absorbed in the flame.", duration: 3.5, wisdomNote: "Absorption is not forced—it happens naturally when you surrender to the practice." },
      { title: "Final Extended Gaze", instruction: "One final gaze: Look at the flame for as long as comfortable without blinking. When you close your eyes, hold the afterimage as long as possible. This is concentration training at its purest—Dharana, one-pointed focus.", duration: 1, wisdomNote: "Ancient yogis believed this practice awakens inner vision and develops clairvoyant abilities." },
      { title: "Integration", instruction: "Slowly return. Take a deep breath. Bow your head slightly to the flame, honoring the practice. Notice the quality of your attention now—sharp, clear, focused. Carry this into your work.", duration: 0.5, wisdomNote: "You've trained the gateway to flow states. With practice, focus becomes effortless." }
    ]
  },
  {
    id: "stoic-reflection",
    title: "Stoic Evening Reflection",
    contentType: "guided-practice",
    category: "presence",
    tags: ['air', 'evening-ritual', 'gentle', 'clarity'],
    structuredTags: {
      pillar: 'pause',
      masterySubtypes: ['deep-calm', 'grounding'],
      goalTags: ['reflection', 'wisdom', 'self_awareness', 'grounding'],
      physioTarget: ['cortisol_reduce', 'parasympathetic_activation'],
      contextTags: ['evening_ritual', 'daily_review', 'before_sleep'],
      environmentSuitability: ['private', 'home'],
      equipment: ['journal', 'pen'],
      cognitiveLoadHelp: ['emotional_processing', 'meaning_making'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'downshift'
    },
    duration: 10,
    difficulty: "beginner",
    origin: "Ancient Rome | Marcus Aurelius",
    storyHook: "The Roman Emperor's daily practice of reviewing actions, thoughts, and alignment with virtue at day's end.",
    usedBy: "CEOs, Leaders, Philosophers",
    thumbnail: flowMeditationColorful,
    steps: 5,
    creator: "Stoic Philosophy"
  },

  // ============= MICRO PRACTICES =============

  // POWER-UP Micro Practices
  {
    id: "energy-shift",
    title: "Energy Revival Through Kinesthetic Movement",
    contentType: "micro-practice",
    category: "power-up",
    tags: ['energy', 'movement', 'fatigue', 'creativity'],
    structuredTags: {
      pillar: 'renewal',
      masterySubtypes: ['recharge', 'restore'],
      goalTags: ['energize', 'vitality', 'movement', 'creativity'],
      physioTarget: ['alertness_increase', 'circulation_increase', 'vagal_tone'],
      contextTags: ['afternoon_slump', 'midday_slump', 'creative_block', 'energy_dip'],
      environmentSuitability: ['private', 'office', 'home'],
      equipment: ['none'],
      cognitiveLoadHelp: ['restores_attention', 'creative_thinking'],
      socialTag: 'solo',
      intensityLevel: 'medium',
      energyDirection: 'upshift'
    },
    duration: 3,
    difficulty: "beginner",
    creator: "Somatic movement principles",
    origin: "Somatic movement principles — rooted in practices like Qigong, yoga, and modern somatic therapy",
    storyHook: "When energy stagnates in the mind, move it through the body. Motion creates emotion. Activation precedes motivation.",
    essence: "When energy stagnates in the mind, move it through the body. Motion creates emotion. Activation precedes motivation.",
    parallel: "Embodied cognition; vagus nerve regulation; psychophysiological state shifts",
    cue: "Move the body, shift the state.",
    usedBy: "Afternoon fatigue, mental fog, emotional heaviness, creative stagnation, when energy feels flat or stuck",
    thumbnail: renewalColorful,
    steps: 4,
    subType: "tool",
    instructions: [
      "Notice the energy level (30 seconds): Pause. Close your eyes. Ask: \"What's my energy signal right now—tense, drained, frozen, scattered?\" Notice where the stagnation lives in your body: shoulders slumped, jaw tight, breath shallow, spine collapsed. Don't fix—just feel.",
      "Activate through micro-movement (2 minutes): Start small: shake out your hands, roll your shoulders, tap your chest or thighs, rotate wrists and ankles. If you're sitting, stand. If you're standing, walk. Let movement be irregular, instinctive, almost childlike. You're thawing frozen energy, not doing a workout.",
      "Integrate breath and rhythm (1 minute): Inhale through the nose for 4 counts, exhale through the mouth with sound (a sigh, hum, or gentle \"ha\"). Match breath to movement—inhale rise, exhale release. Feel circulation return, attention widen.",
      "Re-enter with embodiment (ongoing): Return to your task but stay in your body. Keep a subtle rhythm—rolling your shoulders every few minutes, standing when thoughts get sticky, walking during calls. Energy maintenance is movement maintenance."
    ],
    realExamples: [
      {
        scenario: "Afternoon crash at your desk",
        trigger: "You reach for caffeine, still feel sluggish.",
        response: "You stand, stretch arms overhead, shake out hands for 60 seconds, breathe deeply. Heart rate lifts, focus returns. You bought another productive hour—naturally."
      },
      {
        scenario: "Creative block while writing or designing",
        trigger: "You're staring at the screen, looping.",
        response: "You put on one song, let your body move without choreography. By the second chorus, an idea surfaces. Movement unblocked cognition."
      },
      {
        scenario: "Emotional heaviness after tough feedback",
        trigger: "Chest tight, mind replaying words.",
        response: "You walk outside, swing your arms, shake out tension. The emotion metabolizes through motion instead of rumination."
      }
    ],
    whyThisWorks: "Your body is not separate from your mind—it is your mind in motion. Movement stimulates blood flow, activates proprioceptive and vestibular systems, and signals safety to the nervous system through the vagus nerve. Research in embodied cognition shows physical state shifts precede cognitive ones: when you move, you change brain chemistry and perception. Somatic movement interrupts mental rumination loops and re-engages vitality. You don't think your way out of low energy—you move your way out."
  },

  // PAUSE Micro Practices
  {
    id: "grounding-touch",
    title: "Instant Calm Through Somatic Touch",
    contentType: "micro-practice",
    category: "pause",
    tags: ['earth', 'anxiety-relief', 'gentle', 'nervous-system'],
    structuredTags: {
      pillar: 'pause',
      masterySubtypes: ['grounding', 'deep-calm'],
      goalTags: ['grounding', 'anxiety_relief', 'nervous_system_regulation', 'safety'],
      physioTarget: ['parasympathetic_activation', 'cortisol_reduce', 'vagal_tone', 'oxytocin_release'],
      contextTags: ['panic_relief', 'anxiety_management', 'overwhelm', 'emotional_flooding'],
      environmentSuitability: ['private', 'office', 'public', 'on_the_go'],
      equipment: ['none'],
      cognitiveLoadHelp: ['lowers_cognitive_load', 'present_moment_awareness'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'downshift'
    },
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
    title: "Composure Through Response Space",
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
    structuredTags: {
      pillar: 'pause',
      masterySubtypes: ['composure', 'grounding'],
      goalTags: ['composure', 'leadership', 'presence', 'emotional_regulation'],
      physioTarget: ['prefrontal_activation', 'amygdala_regulation', 'hr_stabilization'],
      contextTags: ['high_pressure', 'leadership_moment', 'crisis', 'difficult_conversation'],
      environmentSuitability: ['office', 'public', 'on_the_go'],
      equipment: ['none'],
      cognitiveLoadHelp: ['supports_decision', 'emotional_intelligence'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'stabilize'
    },
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
    title: "Clarity in Chaos Through The Eye",
    contentType: "micro-practice",
    category: "pause",
    tags: ['earth', 'overwhelm', 'information-overload', 'focus', 'mastery'],
    structuredTags: {
      pillar: 'pause',
      masterySubtypes: ['grounding', 'composure'],
      goalTags: ['mental_clarity', 'overwhelm_reduction', 'focus', 'perspective'],
      physioTarget: ['prefrontal_activation', 'cortisol_reduce'],
      contextTags: ['overwhelm', 'information_overload', 'crisis_mode', 'multitasking_chaos'],
      environmentSuitability: ['office', 'home', 'on_the_go'],
      equipment: ['none'],
      cognitiveLoadHelp: ['lowers_cognitive_load', 'supports_decision'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'stabilize'
    },
    duration: 1,
    difficulty: "beginner",
    creator: "Inspired from Sun Tzu, The Art of War",
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
    title: "Instant Reset Through Performance Ritual",
    contentType: "micro-practice",
    category: "pause",
    tags: ['earth', 'after-mistakes', 'performance', 'recovery', 'quick-reset'],
    structuredTags: {
      pillar: 'pause',
      masterySubtypes: ['grounding', 'composure'],
      goalTags: ['reset', 'recovery', 'composure', 'release'],
      physioTarget: ['hr_decrease', 'cortisol_reduce', 'prefrontal_activation'],
      contextTags: ['post-mistake', 'performance_recovery', 'quick_reset', 'between_tasks'],
      environmentSuitability: ['office', 'public', 'on_the_go', 'shared_space'],
      equipment: ['none'],
      cognitiveLoadHelp: ['emotional_processing', 'supports_decision'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'stabilize'
    },
    duration: 1,
    difficulty: "beginner",
    creator: "Inspired from Novak Djokovic's performance psychology principles",
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
    id: "wu-wei-flow",
    title: "Effortless Action Through Wu Wei",
    contentType: "micro-practice",
    category: "presence",
    tags: ['flow', 'effortless', 'creative-blocks', 'natural-rhythm'],
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['optimize', 'maintain-peak'],
      goalTags: ['flow', 'effortless_action', 'creativity', 'ease'],
      physioTarget: ['relaxation', 'optimal_arousal'],
      contextTags: ['creative_work', 'flow_work', 'micromanaging', 'overthinking'],
      environmentSuitability: ['office', 'home', 'on_the_go'],
      equipment: ['none'],
      cognitiveLoadHelp: ['creative_thinking', 'lowers_cognitive_load'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'stabilize'
    },
    duration: 2,
    difficulty: "beginner",
    creator: "Laozi's Tao Te Ching",
    origin: "無為 (Wu Wei) — Daoist principle, Laozi's Tao Te Ching",
    storyHook: "For micromanaging, overthinking technique, feeling stuck or effortful, creative blocks",
    essence: "Flow arises when you align effort with natural conditions, not against them. The river doesn't push water.",
    parallel: "Flow state (Csíkszentmihályi); optimal challenge-skill balance; reduced cognitive friction",
    cue: "Flow, don't force.",
    usedBy: "When micromanaging, overthinking technique, feeling stuck or effortful, creative blocks",
    subType: "tool",
    instructions: [
      "Notice where you're forcing (30 seconds): Scan your body: Where am I holding tension? Jaw? Shoulders? Typing too hard? Scan your mind: Am I overthinking this?",
      "Release 20% of effort (10 seconds): Intentionally reduce grip, soften muscles, slow down slightly. You're looking for the minimum effective dose of effort.",
      "Find the natural rhythm (1 minute): If writing: Stop trying to write perfectly. Just write next thought. If problem-solving: Stop forcing the solution. Ask: \"What wants to emerge here?\" If in conversation: Stop planning your next sentence. Just listen and respond naturally.",
      "The \"ease check\" (ongoing): Every 10 minutes ask: \"Am I swimming with the current or against it?\" Adjust accordingly."
    ],
    realExamples: [
      {
        scenario: "Writing a difficult email",
        trigger: "Rewriting first sentence 12 times, paralyzed by how it sounds",
        response: "You stop. Close eyes. Ask: \"If I were talking to them in person, what would I say?\" Type THAT. Then edit. The flow is speak-first, polish-second."
      },
      {
        scenario: "Stuck on a complex problem",
        trigger: "Staring at screen for 40 minutes, grinding mentally, getting nowhere",
        response: "You stand up. Go for 5-minute walk. Don't try to solve it. Just let your mind wander. The answer often arrives when you stop strangling it."
      },
      {
        scenario: "Learning a new skill",
        trigger: "Gripping the tool too hard, overthinking every micro-movement, progress is slow",
        response: "Your coach says \"Relax your hands.\" You do. Suddenly the motion is smoother. Mastery isn't more effort—it's precise effort with less tension."
      }
    ],
    whyThisWorks: "Cognitive load theory: your working memory has limited slots. Over-effort (physical tension, mental forcing) fills those slots with noise. When you release 20%, you free up bandwidth for pattern recognition and intuition. Flow states emerge when challenge matches skill AND effort is optimized, not maximized. \"Try less hard\" sounds wrong but is often right.",
    thumbnail: flowBlue,
    steps: 4
  },
  {
    id: "mushin-no-mind",
    title: "Fluid Performance Through Mushin",
    contentType: "micro-practice",
    category: "presence",
    tags: ['flow', 'performance', 'trust', 'automaticity'],
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['optimize', 'maintain-peak'],
      goalTags: ['flow', 'performance', 'trust', 'presence'],
      physioTarget: ['optimal_arousal', 'reduced_self_monitoring'],
      contextTags: ['performance', 'high_stakes', 'practiced_skills'],
      environmentSuitability: ['office', 'public', 'on_the_go'],
      equipment: ['none'],
      cognitiveLoadHelp: ['lowers_cognitive_load', 'supports_automaticity'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'stabilize'
    },
    duration: 1,
    difficulty: "intermediate",
    creator: "Zen Buddhism martial arts philosophy",
    origin: "無心 (Mushin) — Zen Buddhism, martial arts philosophy",
    storyHook: "For high-stakes performance, when self-doubt interferes, during practiced skills that don't need thinking",
    essence: "The mind that doesn't cling to thoughts performs fluidly. Think less, execute more.",
    parallel: "Automaticity in expert performance; reduced self-consciousness; procedural memory dominance",
    cue: "Empty mind, full action.",
    usedBy: "High-stakes performance, when self-doubt interferes, during practiced skills that don't need thinking",
    subType: "mindset",
    instructions: [
      "Pre-performance discharge (15 seconds): Before the event, do a \"thought dump\": write every worry, doubt, and \"what if\" on paper. Close the notebook. \"Those thoughts stay here. I'm going in empty.\"",
      "Shift from thinking to sensing (5 seconds): Stop rehearsing in your head. Instead, tune into physical sensations: What do I see? Hear? Feel in my body? Become the action, not the narrator.",
      "Trust the training (moment of action): When it's time to perform, don't think your way through it. Let your body do what it's practiced 100 times. If a thought arises (\"Am I doing this right?\"), notice it like a cloud passing and return to sensation.",
      "The redirect mantra (ongoing): When thoughts hook you mid-performance, say internally: \"Not now. Do.\""
    ],
    realExamples: [
      {
        scenario: "Free throw in basketball (high pressure)",
        trigger: "Thinking mind: \"Don't miss. Everyone's watching. I missed last time. Bend knees, elbow in...\"",
        response: "You've shot 10,000 free throws. You step to line. See the rim. Feel the ball. Shoot. Your body knows. Trust it."
      },
      {
        scenario: "Improvising in a meeting",
        trigger: "Thinking mind: \"What should I say? Does this sound smart? They're judging me.\"",
        response: "Someone asks you a question. You don't plan your answer. You open your mouth and trust what comes. It's more authentic and fluid than any rehearsed response."
      },
      {
        scenario: "Playing a piano piece you've mastered",
        trigger: "Thinking mind: \"Okay, this part is tricky, don't mess up the accidentals...\"",
        response: "Your fingers have memorized the geography. You close your eyes and feel the music through you, not think it through you. Mistakes only happen when you start thinking again."
      }
    ],
    whyThisWorks: "The conscious mind processes 40-50 bits of information per second. The unconscious processes 11 million. When you \"try to think\" during performance, you bottleneck a massive parallel processor through a tiny serial one. Experts perform best when they stop consciously monitoring. \"Choking\" is what happens when thinking interrupts doing. Mushin is getting out of your own way.",
    thumbnail: flowBlue,
    steps: 4
  },
  {
    id: "jobs-simplicity",
    title: "Ruthless Focus Through Simplicity",
    contentType: "micro-practice",
    category: "presence",
    tags: ['focus', 'priorities', 'essentialism', 'decision-making'],
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['optimize', 'activate'],
      goalTags: ['focus', 'priorities', 'decision_readiness', 'clarity'],
      physioTarget: ['prefrontal_activation', 'cognitive_clarity'],
      contextTags: ['overwhelm', 'decision_fatigue', 'morning_ritual', 'planning'],
      environmentSuitability: ['office', 'home', 'on_the_go'],
      equipment: ['journal', 'pen'],
      cognitiveLoadHelp: ['lowers_cognitive_load', 'supports_decision', 'deep_focus'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'clarify'
    },
    duration: 2,
    difficulty: "beginner",
    creator: "Inspired from Steve Jobs",
    origin: "\"Focus is about saying no.\" — Steve Jobs",
    storyHook: "For overwhelm by options, multitasking temptation, unclear priorities, decision fatigue",
    essence: "Mastery isn't adding complexity—it's ruthless elimination of everything that doesn't serve the mission.",
    parallel: "Selective attention; cognitive load management; essentialism (Greg McKeown)",
    cue: "One thing. Nothing else.",
    usedBy: "When overwhelmed by options, multitasking temptation, unclear priorities, decision fatigue",
    subType: "tool",
    instructions: [
      "The brutal prioritization question (2 minutes): Write down everything you think you need to do. Then ask: \"If I could only do ONE of these today, and the rest disappeared, which one actually moves the mission forward?\" Circle it. Cross out the rest (for now).",
      "Create environmental constraints (10 seconds): Close all browser tabs except the one for your priority task. Put phone in another room. Set a timer for 25 minutes of single-focus work. Tell yourself: \"For the next 25 minutes, this is the only thing that exists.\"",
      "The \"is this it?\" filter (ongoing): Every time you're tempted to switch tasks or add something, ask: \"Is this THE thing right now?\" If no, write it on a \"later\" list and return to your one thing.",
      "The simplicity review (end of day): \"Did I do my one thing? If not, why? What distracted me?\" Adjust tomorrow's environment accordingly."
    ],
    realExamples: [
      {
        scenario: "Building a new product",
        trigger: "47 features you could build, all seem important",
        response: "\"If we only ship ONE feature that makes people say 'holy shit,' what is it?\" Build that. Ignore the rest until that one sings."
      },
      {
        scenario: "Your morning is chaos",
        trigger: "Check email, Slack, news, social media, make coffee, start three tasks",
        response: "Before touching your phone, you do your ONE priority task for 60 minutes. Everything else can wait. This one thing defines whether today was a win."
      },
      {
        scenario: "Someone asks you to join another project",
        trigger: "FOMO, people-pleasing, \"maybe I can fit it in...\"",
        response: "\"I'm focused on X right now. If I say yes to this, I'm saying no to that. I choose X.\" You protect your one thing by saying no to everything else."
      }
    ],
    whyThisWorks: "Context-switching costs 20-40% of your productive time. Every additional priority fractures your attention. Jobs killed 70% of Apple's product line when he returned. The company became the most valuable in the world by doing LESS, better. Your brain can only hold one complex thing in working memory at a time. \"Do one thing\" isn't limiting—it's liberating. You're not avoiding work; you're avoiding waste.",
    thumbnail: flowBlue,
    steps: 4
  },
  {
    id: "ikigai-purpose",
    title: "Purpose-Driven Flow Through Ikigai",
    contentType: "micro-practice",
    category: "presence",
    tags: ['purpose', 'motivation', 'meaning', 'energy'],
    structuredTags: {
      pillar: 'renewal',
      masterySubtypes: ['restore', 'refresh'],
      goalTags: ['purpose', 'motivation', 'meaning', 'vitality'],
      physioTarget: ['dopamine_increase', 'intrinsic_motivation'],
      contextTags: ['motivation_dip', 'meaningless_work', 'morning_ritual', 'evening_reflection'],
      environmentSuitability: ['private', 'home', 'office'],
      equipment: ['journal', 'pen'],
      cognitiveLoadHelp: ['emotional_balance', 'motivation_boost'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'uplift'
    },
    duration: 3,
    difficulty: "intermediate",
    creator: "Japanese philosophy of purpose",
    origin: "生き甲斐 (Ikigai) — Japanese philosophy of purpose",
    storyHook: "For mundane work, motivation dips, when questioning the point, energy depletion from meaningless tasks",
    essence: "When your task sits at the intersection of what you love, what you're good at, what the world needs, and what you can be rewarded for—energy flows naturally.",
    parallel: "Intrinsic motivation; self-determination theory; purpose-driven performance",
    cue: "This is why I'm here.",
    usedBy: "Mundane work, motivation dips, when questioning the point, energy depletion from meaningless tasks",
    subType: "mindset",
    instructions: [
      "Connect task to larger meaning (2 minutes): Before starting work, answer: \"Who benefits if I do this well? How does this serve something bigger than me?\" Even mundane tasks have downstream impact.",
      "Reframe the task (30 seconds): You're not \"filling out reports\"—you're \"creating clarity for the team to make better decisions.\" You're not \"answering emails\"—you're \"unblocking people so they can move forward.\" Find the human impact hiding in the task.",
      "The energy check (ongoing): If a task consistently drains you with no sense of purpose, ask: \"Is this in my Ikigai zone? If not, can I delegate it, automate it, or say no to it?\" Protect your energy for work that lights you up.",
      "The Ikigai audit (weekly): Draw four overlapping circles (love, good at, world needs, paid for). Plot your tasks. If most are outside the center, something needs to change."
    ],
    realExamples: [
      {
        scenario: "Tedious data entry",
        trigger: "\"This is boring busywork. Why am I doing this?\"",
        response: "\"This data helps us identify which customers are struggling. If I do this right, we can reach them before they churn. I'm protecting relationships.\""
      },
      {
        scenario: "You're exhausted and questioning your career",
        trigger: "\"I'm just going through the motions. What's the point?\"",
        response: "You take a walk. Remember why you started. A specific moment when your work helped someone. You write that story down. Read it every morning for a week. The \"why\" reignites the \"how.\""
      },
      {
        scenario: "Entry-level work that feels beneath you",
        trigger: "\"I'm overqualified for this. This is a waste.\"",
        response: "\"Every master was once a beginner at the basics. I'm not just doing the task—I'm learning the system, building relationships, proving reliability. This is the foundation.\" Purpose isn't always immediate. Sometimes it's strategic patience."
      }
    ],
    whyThisWorks: "Intrinsic motivation (purpose, autonomy, mastery) outperforms extrinsic motivation (money, status) for complex cognitive work. When you connect your task to meaning, your prefrontal cortex releases dopamine—the fuel for sustained effort. People with strong Ikigai live longer and report higher life satisfaction. It's not woo-woo—it's how the reward system in your brain is designed. Meaning isn't found; it's created through framing.",
    thumbnail: flowBlue,
    steps: 4
  },
  {
    id: "amor-fati",
    title: "Growth Through Amor Fati",
    contentType: "micro-practice",
    category: "power-up",
    tags: ['resilience', 'setbacks', 'reframing', 'growth'],
    structuredTags: {
      pillar: 'renewal',
      masterySubtypes: ['restore', 'recharge'],
      goalTags: ['resilience', 'growth', 'reframing', 'acceptance'],
      physioTarget: ['cortisol_reduce', 'prefrontal_activation'],
      contextTags: ['post-setback', 'failure_recovery', 'emotional_processing'],
      environmentSuitability: ['private', 'home', 'office'],
      equipment: ['journal', 'pen'],
      cognitiveLoadHelp: ['emotional_processing', 'perspective_shift'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'stabilize'
    },
    duration: 3,
    difficulty: "intermediate",
    creator: "Stoicism (Marcus Aurelius, Epictetus), Nietzsche",
    origin: "\"Amor Fati\" — Stoicism (Marcus Aurelius, Epictetus), later Nietzsche",
    storyHook: "For setbacks, failures, rejections, unexpected obstacles, when victimhood thinking emerges",
    essence: "Don't just accept what happened—love it as the exact training you needed. Obstacles are curriculum.",
    parallel: "Post-traumatic growth; cognitive reappraisal; antifragility (Taleb)",
    cue: "This moment is my teacher.",
    usedBy: "After setbacks, failures, rejections, unexpected obstacles, when victimhood thinking emerges",
    subType: "mindset",
    instructions: [
      "Feel it first, reframe second (5 minutes): Don't bypass the emotion. Sit with disappointment, anger, or grief for a few minutes. Journal it: \"This hurts because...\" Let it be real.",
      "The sacred question (10 minutes): Once the initial wave passes, ask: \"What is this here to teach me? If I look back in 5 years, what will I say I learned from this exact moment?\" Write 3 possible lessons.",
      "Rewrite the story (ongoing): Instead of \"This happened TO me,\" shift to \"This happened FOR me.\" Not as toxic positivity, but as active meaning-making. Example: \"I didn't get the job\" → \"I got redirected toward something better aligned.\"",
      "The gratitude paradox (daily practice): Each night, write: \"Today's obstacle was _____. I'm grateful for it because _____.\" At first it feels forced. Over time, it becomes your default lens."
    ],
    realExamples: [
      {
        scenario: "You got rejected from your dream job",
        trigger: "\"I failed. I'm not good enough. My career is over.\"",
        response: "After crying, you ask: \"What did this rejection protect me from? Maybe that culture was toxic. Maybe I would've been miserable. What door just opened because this one closed?\" Six months later, you're in a better role and you think: \"Thank God I didn't get that job.\""
      },
      {
        scenario: "A relationship ends",
        trigger: "\"I wasted 3 years. I'll never find anyone.\"",
        response: "\"This relationship taught me what I need and what I won't tolerate. I'm now calibrated. The next relationship will be wiser because of this one.\" The pain had purpose—it refined you."
      },
      {
        scenario: "You got injured right before a major event",
        trigger: "\"Why me? This ruins everything.\"",
        response: "\"My body is telling me something. Maybe I was overtraining and this forced me to rest. Maybe I would've injured myself worse if I competed. What can I learn about recovery, patience, or listening to my body?\""
      }
    ],
    whyThisWorks: "Your brain is a meaning-making machine. It WILL create a story about what happened. You can let it default to victimhood (which keeps you stuck), or you can author a story of growth (which moves you forward). Post-traumatic growth research shows people who reframe adversity as transformative often end up STRONGER than before the trauma. Amor Fati isn't denying pain—it's refusing to let pain be meaningless.",
    thumbnail: renewalColorful,
    steps: 4
  },
  {
    id: "buddhist-phoenix",
    title: "Resilience Through the Buddhist Phoenix",
    contentType: "micro-practice",
    category: "power-up",
    tags: ['resilience', 'recovery', 'hardship', 'growth'],
    structuredTags: {
      pillar: 'renewal',
      masterySubtypes: ['restore', 'recharge'],
      goalTags: ['resilience', 'recovery', 'growth', 'transformation'],
      physioTarget: ['cortisol_reduce', 'emotional_processing'],
      contextTags: ['hardship', 'crisis', 'major_setback', 'grief'],
      environmentSuitability: ['private', 'home'],
      equipment: ['journal', 'pen'],
      cognitiveLoadHelp: ['emotional_processing', 'meaning_making'],
      socialTag: 'solo',
      intensityLevel: 'medium',
      energyDirection: 'stabilize'
    },
    duration: 2,
    difficulty: "intermediate",
    creator: "Thích Nhất Hạnh (Buddhist teaching)",
    origin: "\"No mud, no lotus.\" — Thích Nhất Hạnh (Buddhist teaching)",
    storyHook: "During hardship, when feeling broken, after intense stress, questioning whether you can recover",
    essence: "Beauty and enlightenment emerge from suffering. The lotus grows in muddy water, not pristine pools.",
    parallel: "Resilience building through adversity; stress inoculation; growth mindset",
    cue: "The mud feeds the flower.",
    usedBy: "During hardship, when feeling broken, after intense stress, questioning whether you can recover",
    subType: "mindset",
    instructions: [
      "Name the mud (when in crisis): \"I'm in the mud right now. This is the hard part. This is where growth happens, even if I can't see it yet.\" Naming it reduces the shock and shame.",
      "Micro-signs of growth (daily, during recovery): You won't see the lotus overnight. Look for tiny green shoots: \"Today I cried less. Today I got out of bed an hour earlier. Today I asked for help.\" Track these. They prove you're growing through the mud.",
      "Reframe suffering as composting (ongoing): The mud isn't punishment—it's FUEL. Every hard conversation, every failure, every moment of discomfort is decomposing into wisdom, strength, and depth. You're not just enduring; you're composting experience into character.",
      "Honor the mud (when you emerge): Don't erase the struggle from your story. When you bloom, remember: \"I grew BECAUSE of that mud, not in spite of it.\" Let your scars be part of your beauty."
    ],
    realExamples: [
      {
        scenario: "Going through a brutal work failure",
        trigger: "\"I'm humiliated. Everyone saw me fail. I don't know if I can come back from this.\"",
        response: "Weeks pass. You notice: you're less afraid of others' opinions now. You try bigger risks because you've already survived failure. One day you realize: \"That failure liberated me from perfectionism. I'm more creative now because I stopped playing it safe.\""
      },
      {
        scenario: "Recovering from burnout",
        trigger: "\"I can barely function. I'm broken.\"",
        response: "You rest. You learn boundaries. You realize which relationships and work drained you. Months later, you've rebuilt a life with spaciousness. \"I had to break to rebuild correctly. The person I am now is better than the person I was before burnout.\""
      },
      {
        scenario: "Loss of a loved one",
        trigger: "\"This grief is unbearable. I'll never be okay again.\"",
        response: "Slowly, you notice: you appreciate small moments more. You tell people you love them more often. You're kinder to strangers because you know everyone is carrying something. Your grief deepened your humanity. The lotus is compassion that only blooms in the mud of loss."
      }
    ],
    whyThisWorks: "Neuroplasticity research shows the brain rewires itself most dramatically during stress and recovery. You're literally building new neural pathways through adversity. Hormetic stress (the right dose of challenge) makes you antifragile—stronger than before. The lotus metaphor is ancient, but the science is modern: struggle, when metabolized intentionally, becomes strength. You're not waiting to get through the mud. You're using the mud.",
    thumbnail: renewalColorful,
    steps: 4
  },
  {
    id: "bezos-regret-framework",
    title: "Bold Action Through Regret Minimization",
    contentType: "micro-practice",
    category: "power-up",
    tags: ['decision-making', 'courage', 'risk', 'values'],
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['activate', 'optimize'],
      goalTags: ['decision_readiness', 'courage', 'clarity', 'values_alignment'],
      physioTarget: ['prefrontal_activation', 'amygdala_regulation'],
      contextTags: ['major_decision', 'risk_taking', 'career_choice', 'life_decision'],
      environmentSuitability: ['private', 'home', 'office'],
      equipment: ['journal', 'pen'],
      cognitiveLoadHelp: ['supports_decision', 'long_term_thinking'],
      socialTag: 'solo',
      intensityLevel: 'medium',
      energyDirection: 'clarify'
    },
    duration: 3,
    difficulty: "beginner",
    creator: "Inspired from Jeff Bezos",
    origin: "\"I knew that when I was 80, I would never regret trying this. I would only regret not trying.\" — Jeff Bezos",
    storyHook: "When afraid to act, stuck in comfort zone, procrastinating on meaningful risk, choosing safety over growth",
    essence: "View your life from the deathbed. What would you regret not doing? Let future-you guide present-you.",
    parallel: "Temporal self-continuity; mortality salience (Memento Mori); values clarification",
    cue: "Will I regret not doing this?",
    usedBy: "When afraid to act, stuck in comfort zone, procrastinating on meaningful risk, choosing safety over growth",
    subType: "tool",
    instructions: [
      "The deathbed projection (5 minutes): Close your eyes. You're 80 years old, looking back on your life. You're at the decision point you're facing today. Ask that older self: \"Did I regret playing it safe? Or did I regret trying and failing?\" Listen for the answer.",
      "Write the two futures (2 minutes): Future A: You don't take the risk. Where are you in 5 years? How do you feel? Future B: You take the risk (even if it fails). Where are you in 5 years? How do you feel? Which one has more aliveness, even if it's scarier?",
      "The regret litmus test (moment of decision): When paralyzed by fear, ask: \"If I don't do this, will I think about it with regret in 10 years?\" If yes, that's your answer. Do it.",
      "Bias toward action (ongoing): Regret of action fades. Regret of inaction haunts. When in doubt, choose the path with more courage, not more comfort."
    ],
    realExamples: [
      {
        scenario: "Leaving a stable job for a startup",
        trigger: "\"What if it fails? What if I can't get another job?\"",
        response: "You imagine yourself at 80. Which story do you want to tell? \"I played it safe and always wondered 'what if'?\" or \"I took a shot. It was terrifying. It didn't work out, but I'm proud I tried\"? You quit the job."
      },
      {
        scenario: "Asking someone out after years of friendship",
        trigger: "\"What if it ruins the friendship? What if they say no?\"",
        response: "\"If I never tell them, I'll spend years wondering. If I tell them and they say no, at least I'll know. I can live with rejection. I can't live with never trying.\" You ask."
      },
      {
        scenario: "Pursuing a creative dream",
        trigger: "\"I'm too old. I should be practical. People will judge me.\"",
        response: "\"When I'm dying, will I care that people judged me? Or will I regret never creating the thing that was alive in me?\" You start the project."
      }
    ],
    whyThisWorks: "Mortality salience research shows that awareness of death increases focus on intrinsic goals (meaning, relationships, growth) over extrinsic ones (money, status, safety). When you project to your deathbed, your brain bypasses short-term fear and accesses your deepest values. Studies on end-of-life regrets show people regret what they DIDN'T do far more than what they tried and failed at. The framework doesn't eliminate fear—it clarifies what's worth being afraid for.",
    thumbnail: renewalColorful,
    steps: 4
  },
  {
    id: "mandela-long-game",
    title: "Learning Through Win or Learn",
    contentType: "micro-practice",
    category: "power-up",
    tags: ['resilience', 'learning', 'failure', 'growth-mindset'],
    structuredTags: {
      pillar: 'renewal',
      masterySubtypes: ['restore', 'recharge'],
      goalTags: ['resilience', 'learning', 'growth_mindset', 'reframing'],
      physioTarget: ['cortisol_reduce', 'prefrontal_activation'],
      contextTags: ['post-failure', 'learning_moment', 'self_criticism', 'growth'],
      environmentSuitability: ['private', 'home', 'office'],
      equipment: ['journal', 'pen'],
      cognitiveLoadHelp: ['emotional_processing', 'learning_orientation'],
      socialTag: 'solo',
      intensityLevel: 'medium',
      energyDirection: 'stabilize'
    },
    duration: 5,
    difficulty: "beginner",
    creator: "Inspired from Nelson Mandela",
    origin: "\"I never lose. I either win or learn.\" — Nelson Mandela",
    storyHook: "After failures, when self-criticism spirals, building resilience, reframing setbacks as data",
    essence: "There's no such thing as wasted experience. Every outcome either validates your approach or teaches you something essential.",
    parallel: "Growth mindset (Dweck); learning orientation vs. performance orientation; psychological safety",
    cue: "Win or learn. Never lose.",
    usedBy: "After failures, when self-criticism spirals, building resilience, reframing setbacks as data",
    subType: "mindset",
    instructions: [
      "Separate outcome from identity (immediately after setback): Say out loud: \"I didn't fail. The approach failed. I am not the outcome.\" This creates psychological distance between you and the event.",
      "The learning extraction (within 24 hours): Get a blank page. Three questions: \"What worked that I should keep?\" \"What didn't work that I should change?\" \"What did I learn that I couldn't have learned any other way?\" Write at least 3 answers for each.",
      "Build the knowledge bank (ongoing): Keep a \"Lessons Learned\" document. Every setback gets an entry: Date, What happened, What I learned, What I'll do differently. Over time, you'll see patterns. You're building wisdom.",
      "Apply the learning (before next attempt): Before your next performance/attempt, review your lessons. You're not repeating the same approach—you're iterating. Each attempt is version 2.0, 3.0, 4.0."
    ],
    realExamples: [
      {
        scenario: "You bombed a presentation",
        trigger: "\"I'm terrible at public speaking. I embarrassed myself.\"",
        response: "Within 24 hours, you write: \"I learned I need to rehearse transitions out loud, not just in my head. I learned anxiety makes me rush—so I need physical anchors to slow down. I learned the content was solid but delivery needs work.\" Next presentation, you specifically practice those elements. It goes better. You didn't lose—you learned."
      },
      {
        scenario: "A business venture failed",
        trigger: "\"I wasted 2 years and all that money.\"",
        response: "\"I learned how to build a team. I learned what customers actually want vs. what I thought they wanted. I learned my tolerance for risk. I learned which relationships are real. My next venture will be 10x smarter because of this.\" Mandela spent 27 years in prison learning—then became president. Timeline is irrelevant. Learning is accumulating."
      },
      {
        scenario: "You got harsh feedback",
        trigger: "\"They think I'm incompetent. I should just quit.\"",
        response: "You sit with the sting, then you ask: \"What's the 10% of this feedback that's actually true?\" You find it: you DO miss deadlines sometimes. Okay. Now you know what to work on. The feedback wasn't an attack—it was data. You implement a new system. Deadlines improve. You just leveled up."
      }
    ],
    whyThisWorks: "Carol Dweck's research on growth vs. fixed mindset: people who believe abilities are learnable outperform those who believe abilities are innate. When you reframe failure as learning, you maintain psychological safety to keep trying. Your brain's prediction-error signal (dopamine system) is designed to learn from mismatches between expectation and reality—that's literally how neural networks optimize. \"Failure\" is your brain's update mechanism. Mandela didn't just survive prison—he studied law, led movements, emerged wiser. He metabolized suffering into strategy. You can do this with every setback, large or small.",
    thumbnail: renewalColorful,
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
