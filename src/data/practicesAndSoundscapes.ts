// Updated structure with contentType and tags for recommendation system
// Pause category — new engraved illustrations (steel blue palette)
import pauseVisual from "@/assets/recalibrate/pause/soundscape-pause-visual.png";
import pauseMauve from "@/assets/recalibrate/pause/soundscape-pause-visual.png";
import pranayamaClarityHero from "@/assets/recalibrate/pause/pranayama-clarity.png";
import harmonicCalmBowl from "@/assets/recalibrate/pause/harmonic-calm.png";
import forestBathingVisual from "@/assets/recalibrate/pause/deep-calm-forest-bathing.png";
import releaseExhale from "@/assets/recalibrate/pause/release-exhale.png";
import stillnessGap from "@/assets/recalibrate/pause/stillness-gap.png";
import softnessRelease from "@/assets/recalibrate/pause/softness-release.png";
import somaticTouchGrounding from "@/assets/recalibrate/pause/somatic-touch-grounding.png";
import vagusWindDownHero from "@/assets/recalibrate/pause/vagus-wind-down.png";
import inaHero from "@/assets/recalibrate/power-up/ina-night-fields.png";

// Power-up category — new engraved illustrations (warm charcoal/ochre palette)
import renewalVisual from "@/assets/recalibrate/power-up/soundscape-renewal-visual.png";
import renewalColorful from "@/assets/recalibrate/power-up/soundscape-renewal-visual.png";
import didgeridooHero from "@/assets/recalibrate/power-up/energised-focus-didgeridoo-bowls.png";
import warriorDrumsHero from "@/assets/recalibrate/power-up/warrior-drums.png";
import basqueTxalapartaHero from "@/assets/recalibrate/power-up/basque-txalaparta.png";
import renewalStretchIllustration from "@/assets/recalibrate/power-up/soundscape-renewal-visual.png";
import phoenixResilienceHero from "@/assets/recalibrate/power-up/buddhist-phoenix.png";
import courageFutureHero from "@/assets/recalibrate/power-up/courage-future-self.png";
import confidenceEvidenceHero from "@/assets/recalibrate/power-up/confidence-through-evidence.png";
import energyReframeHero from "@/assets/recalibrate/power-up/energy-reframe.png";
import energyCompletionHero from "@/assets/recalibrate/power-up/energy-through-completion.png";
import braveActionHero from "@/assets/recalibrate/power-up/courage-arena.png";
// kapalabhati removed from content
import boxBreathingHero from "@/assets/recalibrate/pause/box-breathing.png";
import energyForgeHero from "@/assets/recalibrate/power-up/energy-forge-power.png";
import rhythmPulseHero from "@/assets/recalibrate/presence/rhythm-pulse.png";

// Presence category — new engraved illustrations (deep teal palette)
import flowVisual from "@/assets/recalibrate/presence/soundscape-flow-visual.png";
import flowBlue from "@/assets/recalibrate/presence/soundscape-flow-visual.png";
import flowMeditationColorful from "@/assets/recalibrate/presence/soundscape-flow-visual.png";
import sustainedFocusChoirHero from "@/assets/recalibrate/presence/sustained-focus-choir-harmonic.png";
import bhramariHero from "@/assets/recalibrate/presence/bhramari-pranayama.png";
import tratakaHero from "@/assets/recalibrate/presence/trataka-flame-gaze.png";
import monasticResonanceHero from "@/assets/recalibrate/presence/deep-focus-monastic-resonance.png";
import fudoshinImmovableMind from "@/assets/recalibrate/pause/fudoshin-immovable-mind.png";
import presenceGrounding from "@/assets/recalibrate/pause/grounding-touch.png";
import clarityEyeOfStorm from "@/assets/recalibrate/pause/eye-of-storm.png";
import detachmentObserver from "@/assets/recalibrate/pause/detachment-observer.png";
import singleThreadFocusHero from "@/assets/recalibrate/presence/single-thread-focus.png";
import firstMoveMomentumHero from "@/assets/recalibrate/presence/first-move-momentum.png";
import depthSubtractionHero from "@/assets/recalibrate/presence/jobs-simplicity.png";
import eternalNowPresenceHero from "@/assets/recalibrate/presence/soundscape-flow-visual.png";
import masteryConstraintHero from "@/assets/recalibrate/presence/mastery-constraint.png";
import wuWeiFlowHero from "@/assets/recalibrate/presence/wu-wei-flow.png";
import mushinFlowHero from "@/assets/recalibrate/presence/mushin-no-mind.png";
import jobsSimplicityHero from "@/assets/recalibrate/presence/jobs-simplicity.png";
import ikigaiPurposeHero from "@/assets/recalibrate/presence/ikigai-purpose.png";
import stoicReflectionHero from "@/assets/recalibrate/presence/stoic-reflection.png";

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
  introSummary?: string;
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
    title: "Bazaar Sound Journey with Didgeridoo & Bowls",
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
    duration: 2.47,
    creator: "Didgeridoo traditions and harmonic bowl practices",
    origin: "Feel the pulse of the crowd, the breath of the didgeridoo, and the shimmering bowls guiding your mind from raw energy to sharp clarity.",
    storyHook: "Ancient didgeridoo + Himalayan bowls: raw energy to re-energize and activate your core vitality.",
    thumbnail: didgeridooHero,
    audioSrc: "/soundscapes/didgeridoo-bowls.mp3",
    fullStory: "On ancient Australian plains, the didgeridoo's deep drone stirred courage, balance, and healing. In Himalayan monasteries, bowls were forged to refine the mind with clear, rising tones. True preparation isn't stillness or adrenaline–it is energy with direction. The didgeridoo gives the power; the bowls give the aim. Together, they move you from the body's ancient rhythms to the mind's highest clarity–not to relax you, but to prepare you.\n\nRitual of Use\n\nBefore the challenge – press play.\nClose your eyes.\nLet the rhythm seize you until hesitation dissolves.\nWhen it ends: act.",
    technique: "This is a two-phase practice. Phase 1 (Didgeridoo): Feel the low frequencies in your body–your chest, your belly, your legs. Don't just hear it; let it vibrate through you. This awakens your core energy and vitality. Phase 2 (Singing Bowls): As the bowls enter, feel the energy shift upward–into your heart, your throat, your head. The raw power becomes refined focus. Breathe deeply throughout. This isn't relaxation–it's energized presence. You're learning to transform primal momentum into laser-sharp attention.",
    benefits: [
      "Awakens core vitality and physical energy",
      "Channels raw energy into precise mental focus",
      "Sustains attention with energized presence",
      "Balances activation with calm clarity",
      "Builds capacity for high-intensity concentration"
    ],
    completionQuote: "True focus is not stillness–it is energy with direction. Power without presence is chaos; presence without power is passive."
  },
  {
    id: "warrior-drums",
    title: "Warrior Drums Activation – Primal Percussive Pulse for Power and Readiness",
    contentType: "soundbath",
    category: "power-up",
    tags: ['fire', 'pre-meeting', 'intense', 'power', 'courage', 'resilience', 'activation'],
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
      intensityLevel: 'high',
      energyDirection: 'activate'
    },
    voice: 'none',
    language: 'en',
    deliveryModality: ['headphones', 'speaker'],
    duration: 3.5,
    creator: "Ancient warrior drum traditions",
    origin: "The Warrior Drums Activation Ritual is a primal reset for high-stakes moments. Each thunderous strike of the drum is a call to rebuild energy, sharpen focus, and awaken resilience. This soundscape doesn't relax you–it recharges and mobilizes your mind and body, transforming fatigue, hesitation, or scattered attention into decisive, embodied readiness. Perfect for moments when stakes are high–before exams, performances, presentations, or critical decisions–Warrior Drums reinforce confidence, resilience, and momentum, so you step into any challenge fully prepared.",
    storyHook: "Primal drums from ancient battlefields–transform hesitation into decisive readiness.",
    thumbnail: warriorDrumsHero,
    audioSrc: "/soundscapes/warrior-drums.mp3",
    fullStory: "Warrior drums were never background music–they were the heartbeat before action. Across continents–from African battlefields to Japanese dojos, Mongolian steppes, and Māori war parties–drums signaled readiness and courage. The silence before the first strike is where fear lives; the first beat breaks hesitation. The rising rhythm synchronises heartbeat, breath, and movement. This is not music to relax to–it is a ritual of activation. Each strike trains the body and mind, transforming apprehension into decisiveness and chaos into rhythm.",
    technique: "Find a private space. Stand or sit tall. Press play.\n\nPhase 1 – Silence & Opening: Notice the tension in the quiet. Observe it without resisting.\n\nPhase 2 – First Drums: Feel the initial strikes anchor in your chest. Breathe in sync with the rhythm.\n\nPhase 3 – Building Intensity: Allow micro-movements–shoulders, chest, hands–to synchronize with the tempo. You are actively engaging, not just listening.\n\nPhase 4 – Peak: At the climax, focus sharpens, confidence rises, and hesitation fades. When the rhythm ends, act immediately. Do not pause or second-guess.",
    benefits: [
      "Restore focus and mental clarity in high-pressure moments",
      "Activate resilience and decisive action under stress",
      "Sharpen embodied confidence for any challenge",
      "Synchronise mind and body to carry readiness into action",
      "Supports pre-presentations, pre-power events, and overcoming hesitation"
    ],
    completionQuote: "Courage is not the absence of fear. It is the rhythm that carries you through it. The warrior does not wait until ready–the ritual makes them ready."
  },
  {
    id: "basque-txalaparta",
    title: "Basque Txalaparta – Raw Rhythm for Inner Grit and Resilience",
    contentType: "soundbath",
    category: "power-up",
    tags: ['fire', 'resilience', 'intense', 'grit', 'activation', 'rhythm'],
    structuredTags: {
      pillar: 'renewal',
      masterySubtypes: ['recharge', 'restore', 'activate'],
      goalTags: ['energize', 'resilience', 'focus', 'decision_readiness', 'confidence'],
      physioTarget: ['alertness_increase', 'hrv_increase', 'sympathetic_modulation'],
      contextTags: ['morning_ritual', 'pre-performance', 'afternoon_slump', 'pre-meeting'],
      environmentSuitability: ['private', 'home'],
      equipment: ['headphones', 'speaker'],
      cognitiveLoadHelp: ['improves_concentration', 'supports_decision'],
      socialTag: 'solo',
      intensityLevel: 'high',
      energyDirection: 'activate'
    },
    voice: 'none',
    language: 'en',
    deliveryModality: ['headphones', 'speaker'],
    duration: 5,
    creator: "Traditional Basque Txalaparta percussion traditions",
    origin: "This soundscape channels the raw power of Basque wooden percussion. Each strike is organic, rhythmic, and unmistakably physical–designed to awaken your body, sharpen your mind, and build resilience. Perfect for high-pressure moments, overcoming mental lulls, or recharging when you need to keep going. The rhythm doesn't wait until you feel ready–it makes you ready.",
    storyHook: "Raw Basque wooden percussion–awakens the body and builds resilience for action.",
    thumbnail: basqueTxalapartaHero,
    audioSrc: "/soundscapes/basque-txalaparta.mp3",
    fullStory: "The Txalaparta was born not in temples or armies, but in the fields and villages of the Basque mountains. After long harvest days, families crushed apples on wooden boards, which later became instruments. Two people struck wood against wood–not to perform, but to revive themselves after exhaustion. The sound is raw, rhythmic, and unmistakably physical. It doesn't promise calm–it offers readiness. Rhythm transforms tension into focus, repetition builds resilience, and every strike aligns body, breath, and mind. This is ancestral practicality: stress transformed into momentum.\n\nRitual of Use\n\nBefore the challenge – press play.\nClose your eyes.\nLet the rhythm seize you until hesitation dissolves.\nWhen it ends: act.",
    technique: "Find a quiet space. Sit or stand with your spine tall. Press play.\n\nPhase 1 – Silence & Opening: Let the quiet sharpen your nerves. Notice where tension lives.\n\nPhase 2 – First Wooden Strikes: Feel the strikes in your chest, shoulders, and arms. Breathe with the rhythm.\n\nPhase 3 – Evolving Patterns: The rhythm grows. Micro-movements arise naturally. Sync your body with the pulse.\n\nPhase 4 – Peak Resonance: Your focus narrows. You are no longer preparing–you are ready. When the sound ends, act immediately. Do not hesitate.",
    benefits: [
      "Transform fatigue or mental inertia into energy and clarity",
      "Anchor attention and align body, breath, and mind",
      "Boost confidence, focus, and readiness before challenging moments",
      "Support decision-making, performance, and social engagement",
      "Cultivate self-mastery meta-skills: emotional resilience, focus, perseverance, and stress management"
    ],
    completionQuote: "The rhythm doesn't wait until you feel ready–it makes you ready. Each strike is organic, rhythmic, and unmistakably physical."
  },

  // PAUSE Soundbaths
  {
    id: "harmonic-calm",
    title: "Nervous System Reset Through Tibetan Bowls",
    contentType: "soundbath",
    category: "pause",
    tags: ['earth', 'post-stress', 'gentle', 'healing', 'meditation'],
    structuredTags: {
      pillar: 'pause',
      masterySubtypes: ['deep-calm', 'grounding', 'composure'],
      goalTags: ['grounding', 'centering', 'deep_reset', 'stress_reduction', 'calming'],
      physioTarget: ['hrv_increase', 'cortisol_reduce', 'parasympathetic_activation'],
      contextTags: ['post-stress', 'evening_winddown', 'between-meetings', 'rest'],
      environmentSuitability: ['private', 'home', 'office'],
      equipment: ['headphones', 'speaker'],
      cognitiveLoadHelp: ['lowers_cognitive_load', 'supports_decision'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'downshift'
    },
    voice: 'none',
    language: 'en',
    deliveryModality: ['headphones', 'speaker'],
    duration: 3,
    creator: "Tibetan Buddhist singing bowl traditions",
    origin: "Tibetan Buddhist singing bowl traditions",
    storyHook: "Ancient Tibetan singing bowls create harmonic resonance for deep rest, nervous system regulation, and grounded presence.",
    thumbnail: harmonicCalmBowl,
    audioSrc: "/soundscapes/harmonic-calm.mp3",
    fullStory: "For over a thousand years, Tibetan Buddhist monks have used singing bowls as sacred instruments for meditation and healing. These bronze bowls, traditionally crafted in the Himalayan regions, produce harmonic overtones that are believed to align the body's energy centers and quiet the restless mind. The practice was traditionally reserved for monastic meditation halls, where monks would strike and circle the bowls' rims to create cascading waves of sound that filled the space with resonance. Today, this ancient tradition offers a pathway to restore emotional balance and cultivate a sense of grounded presence amid modern life's turbulence.",
    technique: "Find a comfortable seated or lying position. Close your eyes and allow your body to settle. As the singing bowls begin, notice how the sound waves seem to move through your body rather than just your ears. Don't try to control your thoughts–simply let the harmonic frequencies wash over you like gentle waves. When your mind wanders, use the sound as an anchor to return to the present moment. Notice how different tones resonate in different parts of your body. This is not passive listening; it's active presence with sound as your guide.",
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
    thumbnail: forestBathingVisual,
    audioSrc: "/soundscapes/forest-bathing.mp3",
    fullStory: "In the 1980s, the Japanese government formally recognized Shinrin-yoku–'forest bathing'–as a cornerstone of preventive healthcare and healing. But the practice itself is ancient, rooted in Shinto beliefs about the sacred presence of nature. Japanese physicians discovered that simply being present in a forest environment significantly reduced stress hormones, lowered blood pressure, and improved immune function. The practice isn't about hiking or exercise–it's about opening your senses fully to the forest atmosphere: the rustle of leaves, the patter of rain, the distant sounds of village life. This soundscape captures that essence, transporting you to a rain-soaked forest where time moves slowly and the mind finds space to breathe.",
    technique: "Close your eyes and imagine yourself standing at the edge of an ancient forest after a gentle rain. Feel the cool air on your skin. As you listen, notice the layers: the soft rain, the rustling leaves, the distant village sounds. Don't try to identify every sound–instead, let the soundscape become a living environment around you. Breathe deeply and slowly, as if inhaling the forest air itself. When thoughts arise, acknowledge them gently and return your attention to the natural sounds. This is not an escape from life, but a return to your natural state of calm awareness.",
    benefits: [
      "Cultivates profound calm and nervous system rest",
      "Restores mental clarity and cognitive freshness",
      "Anchors attention in present-moment awareness",
      "Reduces rumination and mental overload",
      "Connects you to natural rhythms and grounding presence"
    ],
    completionQuote: "In nature's embrace, the mind remembers how to be still. The forest teaches what words cannot."
  },
  {
    id: "vagus-wind-down",
    title: "The Vagus Wind-Down",
    contentType: "soundbath",
    category: "pause",
    tags: ['water', 'evening', 'gentle', 'nervous-system', 'sleep-prep', 'calm'],
    structuredTags: {
      pillar: 'pause',
      masterySubtypes: ['deep-calm', 'grounding', 'composure'],
      goalTags: ['grounding', 'calming', 'deep_reset', 'stress_reduction', 'sleep_preparation'],
      physioTarget: ['vagus_activation', 'parasympathetic_activation', 'hr_decrease', 'cortisol_reduce'],
      contextTags: ['evening_winddown', 'bedtime', 'post-stress', 'post-performance'],
      environmentSuitability: ['private', 'home'],
      equipment: ['none', 'headphones'],
      cognitiveLoadHelp: ['lowers_cognitive_load'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'downshift'
    },
    voice: 'female',
    language: 'en',
    deliveryModality: ['headphones', 'speaker'],
    duration: 5,
    creator: "Taoist monks and elite combat athletes",
    origin: "Ancient tuning meets modern neuroscience",
    storyHook: "Calm the throat, settle the breath, and signal your nervous system to rest – as taught by Taoist monks and elite combat athletes.",
    thumbnail: vagusWindDownHero,
    audioSrc: "/soundscapes/vagus-wind-down.mp3",
    fullStory: "The Vagus Wind-Down comes from the intersection of ancient tuning and modern neuroscience. For thousands of years, meditative traditions have used touch and breath to signal safety to the body. In Buddhist and yogic practices, gentle neck and chest touches were used to 'invite the heart to soften,' a way to drop tension held in the throat and jaw – the places most activated by fear, speech, and effort.\n\nModern science later revealed why those practices worked. Running from the brainstem down through the neck to the heart, lungs, and gut is the vagus nerve – the superhighway of calm. When activated, it slows the heart, lowers blood pressure, and tells the body: 'The danger is gone. You can rest.'\n\nElite military sleep protocols, trauma-informed therapy, and Olympic recovery routines use this principle: Stimulate the vagus nerve gently → the nervous system downshifts. The Vagus Wind-Down adapts these teachings into a simple ritual. A slow downward stroke – from jaw to collarbone – tells your system the hunt is over.",
    technique: "1. Place the thumb under your ear.\nRight or left side – the soft place beneath the jawline.\n\n2. Glide downward to the collarbone.\nNot pressing. Not pushing.\nJust moving the skin in one smooth line.\n\n3. Breathe with the stroke.\nInhale through the nose…\nExhale longer through the mouth.\n\nAlternate sides.\nRight → down.\nLeft → down.\nJust like drawing rain down a window.\n\nThe nervous system understands this pattern.\nSlow downward motion + extended exhale = safety signal.",
    benefits: [
      "Signals safety to the nervous system through vagus nerve stimulation",
      "Releases tension held in the throat, jaw, and shoulders",
      "Downshifts from 'ON' mode to deep rest",
      "Prepares body and mind for quality sleep",
      "Calms racing thoughts and restlessness",
      "Perfect after intense performance, stress, or competition"
    ],
    completionQuote: "You're not trying to 'force sleep.' You're giving the body a signal it understands: It's safe now. You can let go.",
    introSummary: "A guided vagus nerve activation practice that uses gentle touch and extended exhales to signal safety and rest to your nervous system. Perfect for when your body is stuck in 'ON' mode.",
    usedBy: "Elite military sleep protocols, trauma-informed therapy, and Olympic recovery routines"
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
    thumbnail: monasticResonanceHero,
    audioSrc: "/soundscapes/monastic-resonance.mp3",
    fullStory: "High in the Himalayan mountains, Buddhist monks have practiced contemplative chanting for centuries as a method to sharpen awareness and sustain deep concentration. The resonant tones of their voices, combined with the deep reverberations of temple gongs and the crystalline clarity of meditation chimes, create an acoustic environment that naturally draws the mind into focused presence. These monasteries, often perched at altitudes where the air is thin and silence profound, became laboratories for understanding how sound can shape consciousness. The layered harmonics aren't merely beautiful–they're precisely calibrated to guide the mind from distraction into clear, sustained attention.",
    technique: "Sit with an upright but relaxed posture. As the chanting begins, let the low tones anchor your awareness like roots into the earth. Notice how the gongs add depth, and the chimes add clarity–three layers working together. Don't fight for focus; instead, let the sound environment create a container for your attention. When distractions arise, use the resonant chants as your anchor point. This is active listening: you're training your mind to sustain focus by riding the waves of harmonic sound. With practice, this becomes a gateway to hours of clear, effortless concentration.",
    benefits: [
      "Sharpens cognitive clarity and mental precision",
      "Sustains deep focus for extended periods",
      "Expands awareness while maintaining concentration",
      "Trains attention through harmonic resonance",
      "Reduces mental fatigue and cognitive drift"
    ],
    completionQuote: "Attention is not forced–it is cultivated. In the monastery of the mind, every sound is a teacher."
  },
  {
    id: "sustained-focus-choir-harmonic",
    title: "Sustained Focus with Choir Harmonic",
    contentType: "soundbath",
    category: "presence",
    tags: ['air', 'focus', 'moderate', 'sacred', 'resonance'],
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['optimize', 'maintain-peak'],
      goalTags: ['focus', 'mental_clarity', 'meditation', 'sustained_attention'],
      physioTarget: ['focus_enhancement', 'coherence'],
      contextTags: ['deep_work', 'creative_work', 'study'],
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
    duration: 3.5,
    creator: "Sacred harmonic compositions",
    origin: "Sacred harmonic compositions in grand cathedrals",
    storyHook: "Used to enhance focus, cultivate mindful presence, and align energy through layered choirs, bells, and reverberant harmonics.",
    thumbnail: sustainedFocusChoirHero,
    audioSrc: "/soundscapes/cathedral-choir-flow.mp3",
    fullStory: "The great cathedrals of Europe were designed not just as buildings but as instruments–acoustic spaces engineered to amplify the human voice into something transcendent. Gregorian chant and sacred polyphony weren't simply religious music; they were technologies for altering consciousness through harmonic resonance. The layered voices, the deep bells, the reverberant acoustics–all combined to create an environment where individual awareness could merge with something larger while maintaining crystalline focus. Modern neuroscience has confirmed what medieval monks knew intuitively: these harmonic patterns synchronize brainwaves, enhance coherence, and create optimal states for sustained mental clarity.",
    technique: "Find a comfortable position where you can remain alert yet relaxed. As the choir begins, imagine yourself standing in the center of a vast cathedral. The voices aren't coming from outside–they're surrounding you, creating a sonic architecture. Let the harmonics wash over you while keeping a thread of awareness on your breath. Notice how the bells punctuate moments of transition, how the reverb creates space. This isn't about passive listening–you're learning to hold sustained focus within a rich, complex environment. The choir becomes a mirror for your mind: multiple layers working in harmony toward a single purpose.",
    benefits: [
      "Enhances sustained focus and mental endurance",
      "Cultivates mindful presence in complex environments",
      "Aligns internal energy through harmonic resonance",
      "Reduces mental fragmentation and distraction",
      "Builds capacity for long-form concentration"
    ],
    completionQuote: "In the cathedral of consciousness, every voice matters. Focus is not singular–it is harmonious."
  },
  {
    id: "ina-night-fields",
    title: "Ina Night Fields (Tsukiyomi)",
    contentType: "soundbath",
    category: "presence",
    tags: ['water', 'nature', 'gentle', 'evening', 'ambient'],
    structuredTags: {
      pillar: 'pause',
      masterySubtypes: ['deep-calm', 'grounding'],
      goalTags: ['grounding', 'calming', 'deep_reset'],
      physioTarget: ['hrv_increase', 'parasympathetic_activation'],
      contextTags: ['evening_winddown', 'bedtime', 'rest'],
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
    duration: 5,
    creator: "Natural field recording",
    origin: "Nagano Countryside, Japan",
    storyHook: "In the quiet heart of Nagano's countryside, where the land folds gently into mist and memory, night hums in perfect rhythm. Through the open window of a farmhouse in Ina, the living orchestra of the fields begins.",
    thumbnail: inaHero,
    audioSrc: "/soundscapes/ina-night-fields.mp3",
    fullStory: "In Japanese mythology, Tsukiyomi is the moon deity–born from the right eye of Izanagi, ruler of the night sky. In the rice-growing valleys of Nagano, night is not silence but a living symphony. The Ina Night Fields recording captures the soundscape of rural Japan after dark–frogs calling across flooded paddies, insects weaving their rhythmic chorus, distant water flowing through ancient irrigation channels, wind whispering through rice stalks. This is Shinrin-yoku (forest bathing) extended into the night–an immersion in the sounds that have accompanied human sleep for millennia. The Japanese concept of 'Ma' (間)–the sacred pause between sounds–is everywhere in this recording. Each gap between frog calls, each breath between cricket songs, creates space for your nervous system to release the day's accumulated tension.",
    technique: "No technique required. This is a passive immersion soundscape. Find a comfortable position–lying down is ideal. Close your eyes and let the sounds of the Japanese countryside wash over you. Don't try to identify individual sounds or analyze the recording. Simply rest in the sonic environment as if you were lying in a farmhouse with the window open to the night fields. The natural rhythms of night–frogs, insects, distant water–will guide your nervous system into rest without any effort on your part.",
    benefits: [
      "Deep nervous system rest through natural sound immersion",
      "Transition from active to restful state",
      "Connection to natural circadian rhythms",
      "Reduction of mental chatter through ambient focus"
    ]
  },

  // ============= GUIDED PRACTICES =============

  // POWER-UP Practices
  {
    id: "spartan-battle-breath",
    title: "Warrior Courage Through Spartan Battle Breath",
    contentType: "guided-practice",
    category: "power-up",
    tags: ['fire', 'pre-meeting', 'intense', 'warrior', 'activation'],
    duration: 7,
    difficulty: "intermediate",
    origin: "Ancient Greek Warrior Activation",
    storyHook: "Before Thermopylae, Spartans performed this ritual to enter 'menos'–divine battle-trance. Access that fearless state for modern challenges.",
    usedBy: "Spartan Warriors, Athletes, Leaders",
    thumbnail: renewalStretchIllustration,
    steps: 6,
    creator: "Ancient Greek Warrior Activation",
    // TODO: Re-upload spartan-battle-breath.mp3 to public/guided-practices/ to restore audio
    // audioSrc: "/guided-practices/spartan-battle-breath.mp3",
    fullStory: "Before the Battle of Thermopylae (480 BCE), Spartan warriors performed breathing rituals combined with battle cries to enter 'menos'–divine fury. Historical sources describe how they used rhythmic breathing and synchronized movements to create unified energy and fearless presence. Controlled hyperventilation increases adrenaline, reduces fear response, and creates a transcendent state of courage.",
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
      { title: "Shield Wall Breathing", instruction: "Begin slow, deep breathing–4-second inhale through nose, 6-second exhale through mouth. With each breath, expand your chest like you're wearing armor. Feel yourself becoming larger, more powerful. Do 5 cycles.", duration: 1.5, breathingPattern: "Slow, powerful breathing" },
      { title: "Battle March Activation", instruction: "Now march in place with forceful steps. Breathe with each step–inhale on two steps, exhale on two steps. Increase your pace. Feel your heartrate rising. Pump your arms. This is the approach to battle. Do 60 seconds.", duration: 2, breathingPattern: "Breathing synchronized with movement", wisdomNote: "Spartans marched as one. The collective rhythm created invincibility." },
      { title: "The Paean - War Cry", instruction: "Take the deepest breath you can. As you exhale, release a primal battle cry–'HA!' or 'AHOO!' Use your full voice. Feel the vibration in your chest. Repeat 3 times, each louder than the last.", duration: 1.5, wisdomNote: "The paean expelled fear and summoned divine courage. Your voice is a weapon." },
      { title: "Menos - Battle Trance", instruction: "Stand perfectly still. Eyes open. Breathe powerfully. You are the warrior, fully activated, absolutely fearless. Hold this state for 60 seconds. Feel the menos–divine fury channeled into calm, controlled power.", duration: 1, wisdomNote: "This is the state Spartans fought in: utterly calm, utterly lethal." },
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
    storyHook: "Navy SEAL 4-4-4-4 pattern–calm alertness for high-stakes moments.",
    usedBy: "Special Forces, Surgeons, First Responders, Athletes",
    thumbnail: boxBreathingHero,
    steps: 4,
    creator: "Navy SEAL Tactical Protocol",
    audioSrc: "/soundscapes/box-breathing.mp3",
    fullStory: "Navy SEALs didn't invent box breathing–they perfected it for the battlefield. In the chaos of combat, where milliseconds determine outcomes, operators needed a tool to control their physiology instantly. The 4-4-4-4 pattern emerged from understanding that the breath-hold phases activate the vagus nerve, creating a parasympathetic response that counteracts adrenaline without dulling alertness. Special operations teams now train this technique as rigorously as marksmanship. Surgeons use it before entering the operating room. First responders practice it en route to emergencies. The pattern has been validated by modern neuroscience–just 90 seconds of box breathing measurably reduces cortisol and improves cognitive performance under stress.\n\nRitual of Use\n\nBefore the high-stakes moment – press play.\nClose your eyes.\nLet the rhythm anchor you until composure becomes automatic.\nWhen it ends: you're ready.",
    technique: "Find a quiet space. Sit with spine tall, shoulders relaxed. Press play.\n\nPhase 1 – Settle: Take 2-3 natural breaths. Notice where tension lives in your body.\n\nPhase 2 – Inhale (4 counts): Draw breath slowly through your nose, filling your lungs completely.\n\nPhase 3 – Hold Full (4 counts): Retain the breath without tension. This is where the vagus nerve activates.\n\nPhase 4 – Exhale (4 counts): Release slowly through your mouth, emptying completely.\n\nPhase 5 – Hold Empty (4 counts): Pause at the bottom. This completes the parasympathetic circuit.\n\nRepeat for 8-10 cycles. Your heart rate will slow, your mind will clear, and composure will become automatic.",
    benefits: [
      "Activates parasympathetic nervous system within 60 seconds",
      "Reduces cortisol and stress hormones measurably",
      "Sharpens decision-making under pressure",
      "Creates calm alertness–relaxed but ready",
      "Builds tactical composure for high-stakes moments"
    ],
    completionQuote: "Control the breath, control the moment. The warrior's power lies not in strength, but in stillness.",
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
      { title: "Return with Readiness", instruction: "Take one final deep breath. Open your eyes slowly. Notice the calm clarity. You're now in tactical mode–relaxed but ready, calm but alert.", duration: 0.5, wisdomNote: "You've mastered the breath. You've mastered the moment." }
    ]
  },

  // PAUSE Practices
  {
    id: "pranayama-clarity",
    title: "Pranayama Clarity Breath",
    contentType: "soundbath",
    category: "pause",
    tags: ['earth', 'decision-making', 'gentle', 'mental-clarity', 'calm'],
    duration: 3,
    difficulty: "beginner",
    origin: "Ancient Yogic Pranayama | 3000+ years",
    storyHook: "For over 3,000 years, yogis have used alternate nostril breathing to clear mental fog and balance the nervous system before important decisions.",
    usedBy: "Yogis, Meditators, Decision Makers",
    thumbnail: pranayamaClarityHero,
    steps: 4,
    creator: "Nadi Shodhana (Channel Purification)",
    // Intentionally empty – no audio file for this practice
    // audioSrc: "/guided-practices/pranayama-clarity.mp3",
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
    voice: 'male',
    language: 'en',
    deliveryModality: ['headphones', 'speaker'],
    duration: 4,
    difficulty: "beginner",
    origin: "Ancient Vedic Meditation Sound",
    storyHook: "Ancient yogis discovered that humming like a bee creates profound mental stillness–modern science confirms it activates the vagus nerve for instant calm and focus.",
    usedBy: "Yogis, Meditators, Focus Seekers",
    thumbnail: bhramariHero,
    steps: 6,
    creator: "Ancient Vedic Meditation Sound",
    audioSrc: "/soundscapes/bhramari-pranayama.mp3",
    fullStory: "Bhramari Pranayama originates from ancient India, dating back 5,000 years to the Vedic period. Named after the Sanskrit word 'bhramari' (bee), the practice mimics a bee's humming sound. Ancient yogis discovered that internal vibration creates deep meditative states where the mind naturally absorbs into sound–one of the most effective techniques for entering flow states.\n\nModern neuroscience confirms the vibration stimulates the vagus nerve, activating the parasympathetic nervous system while focusing attention. Research shows the practice increases alpha and theta brainwave activity associated with meditative states and reduces beta waves linked to anxiety and mental chatter.\n\nThe technique is deceptively simple but profoundly effective. The continuous humming creates a feedback loop where the sound becomes an anchor for attention. As the mind locks onto the vibration, thoughts naturally dissolve. This is Dharana–one-pointed concentration–the gateway to all flow states.",
    technique: "This is a six-phase guided breathwork meditation combining ancient Vedic pranayama with modern nervous system science.\n\nPhase 1 – Sacred Arrival (90 sec): Settle into a comfortable seated position with spine naturally upright. Close eyes and notice your natural breath. Feel your body grounding. Take three deep breaths to signal your nervous system it's time to turn inward.\n\nPhase 2 – Pranayama Preparation (90 sec): Learn the optional ear closure technique: Place index or middle fingers gently over ear canals (not pressing hard, just sealing). This amplifies internal sound. Or leave ears open for your first practices.\n\nPhase 3 – First Humming Cycle (2 min): Inhale deeply through nose. On exhale, close mouth and hum softly–'mmmmm'–like a bee. Let the hum last the entire exhale. Notice vibration in face, head, chest. Repeat 3 times, learning the rhythm.\n\nPhase 4 – Deep Immersion Rounds (5 min): Begin 12 continuous rounds of Bhramari. Deep inhale through nose, then exhale with humming bee sound. With each round, go deeper into the vibration. Stop thinking about technique–become the sound. Notice how the mind quiets, how the hum absorbs your attention.\n\nPhase 5 – Silent Absorption (90 sec): Release hands from ears. Sit in complete stillness. Notice the resonance remaining in body and mind. Observe the quality of silence–deeper, more spacious. This is Pratyahara, where external distractions withdraw.\n\nPhase 6 – Return & Integration (30 sec): Slowly open eyes. Take one final deep breath and bow head gently, sealing the practice. Carry this clarity and stillness into whatever comes next.",
    benefits: [
      "Immediate: Profound mental stillness and clarity",
      "Immediate: Pleasant vibration sensation in skull and face",
      "Immediate: Reduction in mental chatter and anxiety",
      "Immediate: Feeling centered and present",
      "Immediate: Instant access to focused attention state",
      "Regular Practice: Enhanced ability to drop into flow states quickly",
      "Regular Practice: Improved concentration and sustained attention",
      "Regular Practice: Better emotional regulation and stress resilience",
      "Stimulates vagus nerve for parasympathetic activation",
      "Increases alpha and theta brainwave activity (meditative states)"
    ],
    completionQuote: "The mind follows sound. When sound becomes vibration, vibration becomes focus, and focus becomes flow. You've practiced a 5,000-year-old gateway to presence.",
    whatYouNeed: [
      "⚠️ DO NOT PRACTICE IF: Severe ear infections, active eye conditions (glaucoma, detached retina), epilepsy or seizure disorders, recent ear/nose/throat surgery",
      "⚠️ PRACTICE WITH CAUTION: High blood pressure (use gentle humming only), pregnancy (keep practice gentle and short)",
      "Essential: Quiet space where you can sit comfortably",
      "Essential: Ability to hum without disturbing others",
      "Essential: Chair or cushion for upright seated position",
      "Optional: Earplugs or finger position to close ears (enhances internal sound)",
      "Optional: Aromatics–Sandalwood, lotus, or jasmine incense/oil",
      "For maximum benefit, practice 3-4 rounds of the full cycle. Traditional teaching (Art of Living, Bihar School of Yoga) recommends at least 3 complete rounds for the nervous system to fully shift.",
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
      { title: "First Humming Cycle", instruction: "Take a deep breath in through your nose. On the exhale, close your mouth and make a soft humming sound–'mmmmm'–like a bee. Let the hum last the entire exhale. Notice how the sound vibrates in your face, head, and chest. Repeat this 3 times, learning the rhythm and sensation.", duration: 2, breathingPattern: "Inhale through nose → Exhale humming 'mmmmm'", wisdomNote: "Don't force the hum. Let it be gentle and natural." },
      { title: "Deep Immersion Rounds", instruction: "Now begin 12 continuous rounds of Bhramari. Inhale deeply through the nose, then exhale with the humming bee sound. With each round, let yourself go deeper into the vibration. Stop thinking about the technique–become the sound. Notice how the mind begins to quiet, how the hum absorbs your attention.", duration: 5, breathingPattern: "12 rounds: Deep inhale → Long humming exhale", wisdomNote: "The hum becomes an anchor, drawing scattered attention into a single point. You're training Dharana–one-pointed focus." },
      { title: "Silent Absorption", instruction: "Release your hands from your ears. Sit in complete stillness. Notice the resonance that remains in your body and mind. Observe the quality of silence–it's different now, deeper, more spacious. This is Pratyahara, where external distractions have withdrawn and you're resting in pure awareness.", duration: 1.5, wisdomNote: "The practice doesn't end when the humming stops. This silence is the fruit." },
      { title: "Return & Integration", instruction: "Slowly open your eyes. Take one final deep breath and bow your head gently, sealing the practice. Carry this clarity and stillness into whatever comes next. Notice how your mind feels–clear, calm, focused.", duration: 0.5, wisdomNote: "You've just practiced a 5,000-year-old technique for entering flow states." }
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
      equipment: ['none'],
      cognitiveLoadHelp: ['deep_focus', 'creative_thinking', 'supports_decision'],
      socialTag: 'solo',
      intensityLevel: 'medium',
      energyDirection: 'stabilize'
    },
    voice: 'male',
    language: 'en',
    deliveryModality: ['headphones', 'speaker'],
    duration: 8,
    difficulty: "beginner",
    origin: "Ancient Yogic Focus Meditation",
    storyHook: "Yogis gazed at flames for centuries to develop superhuman focus–training the eyes trains the mind, creating instant flow states.",
    usedBy: "Yogis, Meditators, High Performers",
    thumbnail: tratakaHero,
    steps: 6,
    creator: "Ancient Yogic Focus Meditation",
    audioSrc: "/soundscapes/trataka-single-focus.mp3",
    fullStory: "Trataka is one of six purification practices (Shatkarma) from the Hatha Yoga Pradipika (15th century). The word means 'to gaze steadily.' Ancient yogis discovered that training the eyes to remain perfectly still naturally draws the mind into deep concentration. The flame was chosen because fire represents consciousness itself in Vedic philosophy–pure, unchanging awareness.\n\nModern research shows Trataka increases gamma brainwave activity (40-100 Hz) associated with peak concentration, heightened awareness, and flow states. The practice also enhances visual processing in the occipital cortex and activates the prefrontal cortex–the brain's executive attention network.\n\nThis is not meditation in the traditional sense. It's concentration training at its purest. By anchoring visual attention to a single point, the mind stops wandering. Distractions dissolve. You enter Dharana–one-pointed focus–which is the gateway to Dhyana (meditation) and Samadhi (absorption). Elite performers across domains use variations of this technique to enter flow states on demand.",
    technique: "This is a six-phase guided concentration practice combining ancient Trataka technique with modern neuroscience.\n\nPhase 1 – Sacred Setup (60 sec): Light the candle. Place it 3-4 feet away at eye level. Sit comfortably with spine upright. Set your intention: What requires your deepest focus today? Close eyes briefly to center.\n\nPhase 2 – Soft Gazing Preparation (60 sec): Open eyes. Look at the flame gently–not staring hard, but resting your gaze on it. Notice its shape, color, movement. Relax face, jaw, shoulders. Blink naturally when needed. This is soft gazing, not forcing.\n\nPhase 3 – First Gaze Cycle (90 sec): Gaze at flame for 30 seconds without blinking. When you must blink or eyes water, close them gently. Observe the afterimage behind eyelids–the flame's impression on your inner vision. Rest for 30 seconds with eyes closed.\n\nPhase 4 – Deep Immersion Cycles (210 sec): Repeat three more rounds: 45 sec gazing / 30 sec closed; 60 sec gazing / 30 sec closed; 60 sec gazing / 30 sec closed. With each round, notice distractions falling away. You're becoming absorbed in the flame.\n\nPhase 5 – Final Extended Gaze (60 sec): One final gaze: Look at flame for as long as comfortable without blinking. When you close eyes, hold the afterimage as long as possible. This is concentration training at its purest–Dharana, one-pointed focus.\n\nPhase 6 – Integration (30 sec): Slowly return. Take a deep breath. Bow head slightly to the flame, honoring the practice. Notice the quality of your attention now–sharp, clear, focused. Carry this into your work.",
    benefits: [
      "Immediate: Profound mental clarity and focus",
      "Immediate: Complete cessation of mental chatter",
      "Immediate: Sense of absorption where time disappears",
      "Immediate: Slight tingling or pressure at third eye center",
      "Immediate: Instant entry into flow state",
      "Regular Practice: Dramatically improved concentration span",
      "Regular Practice: Ability to enter flow states at will",
      "Regular Practice: Enhanced visualization abilities",
      "Regular Practice: Deeper meditation experiences",
      "Increases gamma brainwave activity (peak concentration)",
      "Activates prefrontal cortex (executive attention network)",
      "Develops the meta-skill of voluntary attention control"
    ],
    completionQuote: "Where the gaze goes, the mind follows. Where the mind goes, energy flows. You've trained the ancient art of one-pointed awareness–the foundation of all mastery.",
    whatYouNeed: [
      "Essential: A single focus point – candle flame (traditional), OR a small dot drawn on paper, a still object on your desk, or a digital flame on screen",
      "A candle is ideal but not required – any small, still focal point works. This practice can be done in an office or public space using non-flame alternatives.",
      "Essential: Comfortable seated position 3-4 feet from focus point",
      "Optional: Dim room with all other lights off (for candle practice)",
      "Optional: Eye drops if your eyes are sensitive",
      "Beginners should start with 15-30 seconds of continuous gazing per round and build up gradually. The guided audio is approximately 4 minutes – follow the cues and close your eyes whenever needed.",
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
      { title: "Sacred Setup", instruction: "Light the candle. Place it 3-4 feet away at eye level. Sit comfortably with spine upright. Set your intention: What requires your deepest focus today? Close your eyes briefly to center yourself.", duration: 1, wisdomNote: "The flame is not just an object–it's a doorway to one-pointed awareness." },
      { title: "Soft Gazing Preparation", instruction: "Open your eyes. Look at the flame gently–not staring hard, but resting your gaze on it. Notice its shape, color, movement. Relax your face, jaw, shoulders. Blink naturally when needed. This is soft gazing, not forcing.", duration: 1, wisdomNote: "Trataka is not about straining. It's about gentle, sustained attention." },
      { title: "First Gaze Cycle", instruction: "Gaze at the flame for 30 seconds without blinking. When you must blink or when eyes water, close them gently. Observe the afterimage behind your eyelids–the flame's impression on your inner vision. Rest for 30 seconds with eyes closed.", duration: 1.5, wisdomNote: "The afterimage stimulates the Ajna chakra, the third eye center of intuition and insight." },
      { title: "Deep Immersion Cycles", instruction: "Repeat three more rounds: 45 seconds gazing, 30 seconds closed; 60 seconds gazing, 30 seconds closed; 60 seconds gazing, 30 seconds closed. With each round, notice distractions falling away. You're becoming absorbed in the flame.", duration: 3.5, wisdomNote: "Absorption is not forced–it happens naturally when you surrender to the practice." },
      { title: "Final Extended Gaze", instruction: "One final gaze: Look at the flame for as long as comfortable without blinking. When you close your eyes, hold the afterimage as long as possible. This is concentration training at its purest–Dharana, one-pointed focus.", duration: 1, wisdomNote: "Ancient yogis believed this practice awakens inner vision and develops clairvoyant abilities." },
      { title: "Integration", instruction: "Slowly return. Take a deep breath. Bow your head slightly to the flame, honoring the practice. Notice the quality of your attention now–sharp, clear, focused. Carry this into your work.", duration: 0.5, wisdomNote: "You've trained the gateway to flow states. With practice, focus becomes effortless." }
    ]
  },
  {
    id: "stoic-reflection",
    title: "Stoic Evening Reflection",
    contentType: "micro-practice",
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
    thumbnail: stoicReflectionHero,
    steps: 5,
    creator: "Stoic Philosophy",
    subType: "mindset"
  },

  // ============= MICRO PRACTICES =============

  // POWER-UP Guided Practices (Audio-based Somatic Protocols)
  {
    id: "energy-forge",
    title: "Energy Through The Forge",
    contentType: "guided-practice",
    category: "power-up",
    tags: ['energy', 'activation', 'somatic', 'movement', 'state-shift'],
    structuredTags: {
      pillar: 'renewal',
      masterySubtypes: ['recharge', 'activate'],
      goalTags: ['energize', 'vitality', 'alertness', 'readiness'],
      physioTarget: ['alertness_increase', 'circulation_increase', 'catecholamine_release', 'sympathetic_activation'],
      contextTags: ['afternoon_slump', 'pre-performance', 'fatigue', 'mental_fog', 'energy_dip'],
      environmentSuitability: ['private', 'office', 'home'],
      equipment: ['none'],
      cognitiveLoadHelp: ['restores_attention', 'supports_decision'],
      socialTag: 'solo',
      intensityLevel: 'high',
      energyDirection: 'uplift'
    },
    duration: 1.5,
    difficulty: "beginner",
    creator: "Physiological state-shifting techniques from athletes, performers and Special Forces",
    origin: "Physiological state-shifting techniques observed in athletes, performers and Special Forces pre-mission protocols + Polyvagal Theory (Porges)",
    storyHook: "Rapid activation when energy runs low–when rest isn't an option but energy is required now.",
    thumbnail: energyForgeHero,
    audioSrc: "/soundscapes/energy-forge.mp3",
    fullStory: "When fatigue hits and rest isn't an option, the body has built-in systems for rapid energy recovery. Elite athletes know this instinctively–the cold water splash before competition, the explosive movement to prime the nervous system, the verbal command that shifts mental state. Special Forces operators use these same principles during extended operations when alertness is non-negotiable. This isn't about caffeine or willpower–it's about leveraging your physiology.\n\nThe science is clear: movement increases oxygen to the brain and triggers catecholamine release (adrenaline, dopamine). Novel sensory input activates the reticular activating system–your brain's 'wake up' switch. And verbal declarations engage the prefrontal cortex, creating cognitive commitment to action.\n\nThis 90-second protocol combines all three mechanisms into a rapid state-shift you can deploy anywhere, anytime energy flags but performance must continue.",
    technique: "This is a three-phase somatic activation protocol.\n\nPhase 1 – Move with Intensity (30 sec): Pick one high-intensity movement: 10 push-ups, 20 squats, 30-second wall sit, or 1-minute fast walk. Push hard enough to breathe differently. Your body creates energy through demand, not rest.\n\nPhase 2 – Disrupt Your Senses (30 sec): Choose one sharp sensory input: cold water on face/wrists, strong scent (peppermint, citrus), bright light (step outside, face window), or loud sound (clap 3 times). Shock equals reset. Novel sensory input activates your brain's wake-up switch.\n\nPhase 3 – Declare Readiness (30 sec): Stand tall. Say aloud with force: \"I am awake. I am capable. I begin now.\" Verbal declaration creates cognitive commitment and primes the mind for action.",
    benefits: [
      "Rapid energy restoration when rest isn't available",
      "Activates catecholamine release for immediate alertness",
      "Engages reticular activating system through sensory disruption",
      "Creates cognitive commitment through verbal declaration",
      "Ideal for afternoon dips, pre-performance, or mental fog"
    ],
    completionQuote: "Energy isn't found–it's created. Your body responds to demand, not rest, when performance calls."
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
    origin: "\"Your body is the ground of your being. It holds the key to safety, presence, and peace.\" – Adapted from Thomas Hanna, founder of Somatics",
    storyHook: "For moments of anxiety, overwhelm, panic, emotional flooding, or after receiving hard news",
    essence: "The body can calm the mind faster than thoughts can. When you touch with awareness, you signal safety directly to your nervous system.",
    parallel: "Polyvagal theory; vagus nerve activation through self-touch; interoceptive awareness; embodied safety",
    cue: "\"Touch. Feel. Soften.\"",
    usedBy: "Moments of anxiety, overwhelm, panic, emotional flooding, or after receiving hard news",
    thumbnail: somaticTouchGrounding,
    steps: 4,
    subType: "tool",
    instructions: [
      "Notice the body alarm (3 seconds): You feel the rush: heart pounding, throat tight, chest heavy, shoulders rising. Name it: \"My body is on alert.\" (Simply naming the state engages the prefrontal cortex and begins to downshift arousal.)",
      "Make contact – the anchor touch (5 seconds): Choose one: Hand on heart → activates warmth, trust, and oxytocin release | Hand on belly → deepens diaphragmatic breathing | One palm on chest, one on belly → synchronizes upper and lower body regulation | Or place both hands on your thighs → grounding through physical support. As you place your hands, apply light pressure. Feel your own weight and warmth.",
      "The settling breath (10 seconds): Inhale gently through nose for 4 seconds, hold for 2 seconds, exhale slowly through mouth for 6 seconds. (Lengthening the exhale activates the parasympathetic branch of the vagus nerve.) With each exhale, silently say: \"It's safe to soften.\"",
      "Soothing through micro-movement (ongoing): After 15–20 seconds, notice what your body wants next – maybe a sigh, a yawn, or a shoulder drop. Let it happen. Don't manage it. That's your nervous system self-correcting. Ask yourself: \"What does my body need to feel 5% safer right now?\" Then do that – maybe more pressure, slower breath, or loosening your jaw."
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
    whyThisWorks: "Your skin is a direct access point to your autonomic nervous system. Gentle, intentional touch releases oxytocin and endorphins, lowers cortisol, and slows the heart rate. According to polyvagal theory (Stephen Porges), warm, steady contact activates the vagal brake – a physiological mechanism that signals safety to the brain. When you self-touch with presence, you're not \"comforting yourself like a child.\" You're sending a biological message: \"The threat has passed. You are safe enough to relax.\" The body leads; the mind follows."
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
    duration: 1.5,
    difficulty: "beginner",
    creator: "不動心 (Fudōshin) – Samurai principle, Miyamoto Musashi's teachings",
    origin: "Fudōshin (不動心) – The Immovable Mind principle from Samurai warrior philosophy",
    storyHook: "For critical performances, leadership under crisis, public speaking, and confrontation",
    essence: "Your center remains still even when the world around you moves violently. Calm presence in chaos.",
    parallel: "Psychological composure under stress; \"calm is contagious\" (Navy SEAL principle); emotional steadiness",
    cue: "\"Still center, moving world.\"",
    usedBy: "Before critical performances, leadership under crisis, public speaking, confrontation",
    thumbnail: fudoshinImmovableMind,
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
        response: "In bathroom beforehand–stance wide, hand on belly, 10 slow breaths while repeating \"Still center, moving world.\" When you walk to the stage, you move like you own the ground beneath you."
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
    whyThisWorks: "Your body and mind are bidirectional. When you create physical stability (grounded stance, steady breath), your nervous system interprets: \"We must be safe–we're not running or collapsing.\" Your composure literally regulates others' nervous systems through mirror neurons. Leadership is a felt state, not just words."
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
    duration: 2,
    difficulty: "beginner",
    creator: "Inspired from Sun Tzu, The Art of War",
    origin: "\"In the midst of chaos, there is also opportunity.\" – Sun Tzu, The Art of War",
    storyHook: "For overwhelming situations, information overload, when multiple demands hit simultaneously",
    essence: "The hurricane's center is silent. Position yourself there mentally, not in the violent outer winds.",
    parallel: "Attentional control; metacognitive awareness; the \"observer self\" in mindfulness",
    cue: "\"Find the eye.\"",
    usedBy: "Overwhelming situations, information overload, when multiple demands hit simultaneously",
    thumbnail: clarityEyeOfStorm,
    steps: 4,
    subType: "mindset",
    instructions: [
      "Name what's swirling around you (5 seconds): \"Okay–three deadlines, two angry emails, one meeting in 10 minutes, and my head is spinning.\"",
      "Physical anchor (3 seconds): Press your feet into the ground. Feel the chair beneath you. Touch your thumb to each finger slowly.",
      "The question that creates the eye (10 seconds): \"What's the one thing I can control in the next 60 seconds?\" Not everything. Just one thing. Maybe it's: Close Slack so the pings stop, Reply to one email with \"Got it, will respond by 3pm\", or Write down the swirling tasks so they're out of your head.",
      "Repeat the cue as a mantra (ongoing): While doing that one thing, whisper: \"Find the eye. Find the eye.\" It keeps you anchored."
    ],
    realExamples: [
      {
        scenario: "You're in a heated meeting",
        trigger: "Three people talking over each other, your idea just got attacked, you feel defensive",
        response: "Instead of reacting, you take one slow breath and say, \"Hold on–let me make sure I understand what you're saying.\" (Buying yourself 10 seconds to get to your center)"
      },
      {
        scenario: "Your inbox exploded",
        trigger: "47 unread emails, 5 marked urgent, you're paralyzed",
        response: "Close email. Open a blank doc. Write: \"What matters today?\" Pick ONE. Do that first. The storm still exists, but you're not in it."
      },
      {
        scenario: "A personal crisis hits mid-workday",
        trigger: "Bad news from home, emotions flooding, but you have a presentation in 20 minutes",
        response: "Tell someone you trust: \"I just got hard news. I need 5 minutes.\" Go to bathroom. Splash face. Three deep breaths. Tell yourself: \"For the next 20 minutes, I will do this one thing. After, I can fall apart if I need to.\" (Compartmentalization isn't suppression–it's strategic timing)"
      }
    ],
    whyThisWorks: "Your nervous system can't tell the difference between 20 threats and 1 threat–it just goes into overload. By consciously choosing ONE thing to control, you signal: \"We're not drowning. We're taking one stroke at a time.\" The eye of the storm isn't calm because the storm stopped. It's calm because you stopped trying to fight all of it at once."
  },
  {
    id: "presence-grounding-new",
    title: "Presence Through Grounding",
    contentType: "micro-practice",
    category: "pause",
    tags: ['earth', 'rumination', 'anxiety', 'presence', 'mindfulness'],
    duration: 1.5,
    difficulty: "beginner",
    creator: "Buddhist mindfulness + Eckhart Tolle",
    origin: "Buddhist mindfulness practice (sati) + Eckhart Tolle's The Power of Now",
    storyHook: "Return to now when mind spirals elsewhere–ruminating on past mistakes, anxious about future outcomes, mental time-traveling during stress.",
    essence: "The present moment is the only moment that actually exists. Past and future are thoughts happening now.",
    cue: "Here. Now.",
    usedBy: "When your body is here but your mind is elsewhere–replaying arguments, rehearsing disasters, or lost in worry",
    thumbnail: presenceGrounding,
    steps: 3,
    subType: "mindset",
    instructions: [
      "Notice where you went (30 sec): Pause. Ask yourself: 'Where was my mind just now?' Past? Future? Judging myself? Name it without shame: 'I was catastrophizing about tomorrow' or 'I was replaying that conversation.'",
      "Anchor in three sensations (30 sec): Bring your attention to RIGHT NOW through your senses. Name one thing you see, one thing you hear, one thing you feel right now. Sensation only exists in the present moment.",
      "Speak your location (30 sec): Say aloud or silently: 'I am here. I am now. This moment is enough.' Take one full breath. Feel yourself arrive."
    ]
  },
  {
    id: "release-exhale-new",
    title: "Release Through The Exhale",
    contentType: "micro-practice",
    category: "pause",
    tags: ['earth', 'breath', 'tension-release', 'nervous-system', 'stress'],
    duration: 1.5,
    difficulty: "beginner",
    creator: "Ancient Pranayama + Navy SEAL protocols",
    origin: "Ancient Pranayama (yogic breath control) + Polyvagal Theory + Navy SEAL combat breathing",
    storyHook: "Discharge intensity through controlled breath–when physical tension, shallow breathing, fight-or-flight activation, wired energy needs release.",
    essence: "Each long exhale is a message to your nervous system: threat is over, reset to baseline.",
    cue: "Exhale is release.",
    usedBy: "When intensity is stored in your body–anxiety manifesting as chest tightness, post-stress tension, too much energy at end of day",
    thumbnail: releaseExhale,
    steps: 3,
    subType: "tool",
    instructions: [
      "Locate the intensity (30 sec): Scan your body from head to feet. Where is tension or excess energy held? Jaw clenched? Shoulders tight? Chest constricted? Name the location without trying to change it yet.",
      "Elongate the exhale (40 sec): Breathe in through nose for 4 counts, out through nose or mouth for 8 counts (twice as long). Repeat this pattern 3 times. Each long exhale activates parasympathetic rest-and-digest mode.",
      "Discharge physically (20 sec): After your third long exhale, shake your hands vigorously for 10 seconds. Or shiver your whole body like shaking off water. Let sound escape if it wants to–sigh, groan, exhale sharply."
    ]
  },
  {
    id: "stillness-gap-new",
    title: "Stillness Through The Gap",
    contentType: "micro-practice",
    category: "pause",
    tags: ['air', 'mental-noise', 'intuition', 'clarity', 'meditation'],
    duration: 2,
    difficulty: "intermediate",
    creator: "Zen ma + Vipassana meditation",
    origin: "Zen ma (間 – the space between) + Vipassana meditation + Elite sniper breath pause training",
    storyHook: "Find the quiet between thoughts–when mental noise, thoughts colliding, feeling trapped in your own head, need to access intuition.",
    essence: "The gap between thoughts is where stillness lives. Intuition whispers in gaps.",
    cue: "Find the gap.",
    usedBy: "Before important decisions when you need to hear your own wisdom, when thoughts are too loud to think clearly",
    thumbnail: stillnessGap,
    steps: 3,
    subType: "mindset",
    instructions: [
      "Notice the stream (40 sec): Close your eyes or soften your gaze. Notice thoughts moving through your mind like cars on a highway. Don't grab onto any thought. Just observe: 'Thought about work. Worry thought. Planning thought.' You are not the cars. You are the road.",
      "Find the gap (60 sec): Between each thought, there is a tiny space of silence. Notice the gap. Even if it's only a fraction of a second. Thought arises → Gap → Next thought arises. Rest your attention in that gap.",
      "Expand the silence (20 sec): After finding a few gaps, ask one question into the silence: 'What do I actually need right now?' Don't answer it. Just ask it into the gap and listen. The answer will arrive in the next gap–sudden, clear, quiet."
    ]
  },
  {
    id: "detachment-observer-new",
    title: "Detachment Through The Observer",
    contentType: "micro-practice",
    category: "pause",
    tags: ['earth', 'defensiveness', 'perspective', 'objectivity', 'emotional-regulation'],
    duration: 2,
    difficulty: "intermediate",
    creator: "Stoic prosoche + Buddhist sakshi",
    origin: "Stoic prosoche (attention discipline) + Buddhist sakshi (witness consciousness) + Psychological distancing research",
    storyHook: "Step outside yourself to see clearly–when taking things too personally, reactive defensiveness, feeling attacked by feedback, emotions cloud judgment.",
    essence: "You are not your thoughts. You are the awareness that notices them. You are the sky, not the weather.",
    cue: "I notice I'm having the thought that...",
    usedBy: "After harsh feedback, when criticism feels like identity assault, during conflicts where you're losing perspective",
    thumbnail: detachmentObserver,
    steps: 3,
    subType: "mindset",
    instructions: [
      "Shift to third-person narration (40 sec): Describe what's happening as if you're a narrator watching someone else. Don't say: 'I'm furious.' Say: 'They are feeling anger' or 'They received feedback that triggered defensiveness.' Use your name or 'they' instead of 'I.'",
      "Name the story, not the fact (40 sec): Ask: 'What story am I telling about what happened?' Fact: 'They disagreed with my idea.' Story: 'They think I'm incompetent.' Speak this: 'The fact is [X]. The story I'm telling is [Y].'",
      "Return as witness (40 sec): Say to yourself: 'I notice I'm having the thought that [story]. That's a thought, not a truth.' You don't have to believe every thought your mind produces. Sit in that awareness for three breaths."
    ]
  },
  {
    id: "softness-release-new",
    title: "Softness Through Release",
    contentType: "micro-practice",
    category: "pause",
    tags: ['water', 'acceptance', 'surrender', 'control', 'letting-go'],
    duration: 2,
    difficulty: "beginner",
    creator: "Taoist Wu Wei + ACT therapy",
    origin: "Taoist Wu Wei (effortless action) + Serenity Prayer tradition + Acceptance and Commitment Therapy",
    storyHook: "Let go of what you cannot control–when trying to control the uncontrollable, white-knuckling outcomes, exhaustion from forcing, resistance creating more suffering.",
    essence: "Water doesn't fight the rock–it flows around. You're learning to flow.",
    cue: "I release. I allow. I accept what is.",
    usedBy: "When fighting reality, when effort creates more tension, when you need to accept what is before you can act",
    thumbnail: softnessRelease,
    steps: 3,
    subType: "mindset",
    instructions: [
      "Name what you're gripping (40 sec): Ask: 'What am I trying to control right now?' Be specific: 'I'm trying to control what they think of me' or 'I'm trying to control the outcome of this interview.' Naming reveals the grip.",
      "Separate what's yours to hold (40 sec): For what you named, ask: 'Can I directly influence this outcome?' and 'Is my effort creating the result I want?' If both answers are NO, speak this: 'I cannot control [X]. I release my grip on [X].'",
      "Open your hands (40 sec): Physically make tight fists. Squeeze hard for 5 seconds. Then open your hands completely. Palms up. Fingers relaxed. Say: 'I release. I allow. I accept what is.' Take three breaths with open hands."
    ]
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
    origin: "無為 (Wu Wei) – Daoist principle, Laozi's Tao Te Ching",
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
        response: "Your coach says \"Relax your hands.\" You do. Suddenly the motion is smoother. Mastery isn't more effort–it's precise effort with less tension."
      }
    ],
    whyThisWorks: "Cognitive load theory: your working memory has limited slots. Over-effort (physical tension, mental forcing) fills those slots with noise. When you release 20%, you free up bandwidth for pattern recognition and intuition. Flow states emerge when challenge matches skill AND effort is optimized, not maximized. \"Try less hard\" sounds wrong but is often right.",
    thumbnail: wuWeiFlowHero,
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
    origin: "無心 (Mushin) – Zen Buddhism, martial arts philosophy",
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
    thumbnail: mushinFlowHero,
    steps: 4
  },
  {
    id: "jobs-simplicity",
    title: "Clarity Through Elimination",
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
    origin: "\"Focus is about saying no.\" – Steve Jobs",
    storyHook: "For overwhelm by options, multitasking temptation, unclear priorities, decision fatigue",
    essence: "Mastery isn't adding complexity–it's ruthless elimination of everything that doesn't serve the mission.",
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
    whyThisWorks: "Context-switching costs 20-40% of your productive time. Every additional priority fractures your attention. Jobs killed 70% of Apple's product line when he returned. The company became the most valuable in the world by doing LESS, better. Your brain can only hold one complex thing in working memory at a time. \"Do one thing\" isn't limiting–it's liberating. You're not avoiding work; you're avoiding waste.",
    thumbnail: jobsSimplicityHero,
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
    origin: "生き甲斐 (Ikigai) – Japanese philosophy of purpose",
    storyHook: "For mundane work, motivation dips, when questioning the point, energy depletion from meaningless tasks",
    essence: "When your task sits at the intersection of what you love, what you're good at, what the world needs, and what you can be rewarded for–energy flows naturally.",
    parallel: "Intrinsic motivation; self-determination theory; purpose-driven performance",
    cue: "This is why I'm here.",
    usedBy: "Mundane work, motivation dips, when questioning the point, energy depletion from meaningless tasks",
    subType: "mindset",
    instructions: [
      "Connect task to larger meaning (2 minutes): Before starting work, answer: \"Who benefits if I do this well? How does this serve something bigger than me?\" Even mundane tasks have downstream impact.",
      "Reframe the task (30 seconds): You're not \"filling out reports\"–you're \"creating clarity for the team to make better decisions.\" You're not \"answering emails\"–you're \"unblocking people so they can move forward.\" Find the human impact hiding in the task.",
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
        response: "\"Every master was once a beginner at the basics. I'm not just doing the task–I'm learning the system, building relationships, proving reliability. This is the foundation.\" Purpose isn't always immediate. Sometimes it's strategic patience."
      }
    ],
    whyThisWorks: "Intrinsic motivation (purpose, autonomy, mastery) outperforms extrinsic motivation (money, status) for complex cognitive work. When you connect your task to meaning, your prefrontal cortex releases dopamine–the fuel for sustained effort. People with strong Ikigai live longer and report higher life satisfaction. It's not woo-woo–it's how the reward system in your brain is designed. Meaning isn't found; it's created through framing.",
    thumbnail: ikigaiPurposeHero,
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
    duration: 3,
    difficulty: "intermediate",
    creator: "Thích Nhất Hạnh (Buddhist teaching)",
    origin: "\"No mud, no lotus.\" – Thích Nhất Hạnh (Buddhist teaching)",
    storyHook: "During hardship, when feeling broken, after intense stress, questioning whether you can recover",
    essence: "Beauty and enlightenment emerge from suffering. The lotus grows in muddy water, not pristine pools.",
    parallel: "Resilience building through adversity; stress inoculation; growth mindset",
    cue: "The mud feeds the flower.",
    usedBy: "During hardship, when feeling broken, after intense stress, questioning whether you can recover",
    subType: "mindset",
    instructions: [
      "Name the mud (when in crisis): \"I'm in the mud right now. This is the hard part. This is where growth happens, even if I can't see it yet.\" Naming it reduces the shock and shame.",
      "Micro-signs of growth (daily, during recovery): You won't see the lotus overnight. Look for tiny green shoots: \"Today I cried less. Today I got out of bed an hour earlier. Today I asked for help.\" Track these. They prove you're growing through the mud.",
      "Reframe suffering as composting (ongoing): The mud isn't punishment–it's FUEL. Every hard conversation, every failure, every moment of discomfort is decomposing into wisdom, strength, and depth. You're not just enduring; you're composting experience into character.",
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
    whyThisWorks: "Neuroplasticity research shows the brain rewires itself most dramatically during stress and recovery. You're literally building new neural pathways through adversity. Hormetic stress (the right dose of challenge) makes you antifragile–stronger than before. The lotus metaphor is ancient, but the science is modern: struggle, when metabolized intentionally, becomes strength. You're not waiting to get through the mud. You're using the mud.",
    thumbnail: phoenixResilienceHero,
    steps: 4
  },
  {
    id: "energy-through-reframe",
    title: "Energy Through The Shift",
    contentType: "micro-practice",
    category: "power-up",
    tags: ['energy', 'reframe', 'motivation', 'fatigue'],
    structuredTags: {
      pillar: 'renewal',
      masterySubtypes: ['recharge', 'restore'],
      goalTags: ['energize', 'motivation', 'focus', 'autonomy'],
      physioTarget: ['alertness_increase', 'cortisol_regulate'],
      contextTags: ['afternoon_slump', 'low_energy', 'pre-meeting', 'resistance'],
      environmentSuitability: ['private', 'office', 'home'],
      equipment: ['none'],
      cognitiveLoadHelp: ['improves_concentration', 'supports_decision'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'uplift'
    },
    duration: 1.5,
    difficulty: "beginner",
    creator: "Cognitive reappraisal + Yerkes-Dodson arousal curve + Polyvagal Theory (Porges)",
    origin: "Physiological state-shifting techniques observed in athletes, performers and special forces for pre-mission",
    storyHook: "Rapid activation when energy runs low",
    usedBy: "Mental fatigue, low motivation, feeling 'too tired'",
    subType: "mindset",
    thumbnail: energyReframeHero,
    steps: 3
  },
  {
    id: "courage-future-self",
    title: "Courage Through The Future Self",
    contentType: "micro-practice",
    category: "power-up",
    tags: ['courage', 'fear', 'decision', 'growth', 'regret-minimization'],
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['activate', 'optimize'],
      goalTags: ['courage', 'decision_readiness', 'clarity', 'values_alignment'],
      physioTarget: ['prefrontal_activation', 'amygdala_regulation'],
      contextTags: ['major_decision', 'risk_taking', 'career_choice', 'standing_up'],
      environmentSuitability: ['private', 'office', 'home'],
      equipment: ['none'],
      cognitiveLoadHelp: ['supports_decision', 'long_term_thinking'],
      socialTag: 'solo',
      intensityLevel: 'medium',
      energyDirection: 'clarify'
    },
    duration: 3,
    difficulty: "beginner",
    creator: "Stoic philosophy + Regret Minimization Framework + Fear-Setting",
    origin: "Perspective-taking across time horizons – Memento Mori, Bezos, Ferriss",
    storyHook: "Act with courage to choose growth over comfort in key moments that matter",
    usedBy: "Afraid to act, stuck in comfort zone, procrastinating on meaningful risk",
    subType: "mindset",
    thumbnail: courageFutureHero,
    steps: 5
  },
  {
    id: "confidence-through-evidence",
    title: "Confidence & Readiness Through Evidence",
    contentType: "micro-practice",
    category: "power-up",
    tags: ['confidence', 'self-belief', 'performance', 'evidence', 'readiness'],
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['activate', 'optimize'],
      goalTags: ['confidence', 'self_belief', 'decision_readiness', 'performance'],
      physioTarget: ['prefrontal_activation', 'cortisol_reduce'],
      contextTags: ['pre-meeting', 'pre-performance', 'interview', 'presentation'],
      environmentSuitability: ['private', 'office', 'home'],
      equipment: ['none'],
      cognitiveLoadHelp: ['supports_decision', 'improves_concentration'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'clarify'
    },
    duration: 2,
    difficulty: "beginner",
    creator: "CBT (Beck) + Athlete Mental Training + Satya Nadella's \"Learn-It-All\" mindset",
    origin: "Cognitive Behavioral Therapy, sports psychology, growth mindset research",
    storyHook: "Rebuild self-belief with your own proof",
    usedBy: "Self-doubt, imposter feelings, pre-performance anxiety, comparing yourself to others",
    subType: "mindset",
    thumbnail: confidenceEvidenceHero,
    steps: 3
  },
  {
    id: "energy-through-completion",
    title: "Restore Energy Through Completion",
    contentType: "micro-practice",
    category: "power-up",
    tags: ['energy', 'completion', 'focus', 'clarity', 'open-loops'],
    structuredTags: {
      pillar: 'renewal',
      masterySubtypes: ['restore', 'recharge'],
      goalTags: ['clarity', 'focus', 'cognitive_bandwidth', 'stress_reduction'],
      physioTarget: ['cortisol_reduce', 'prefrontal_activation'],
      contextTags: ['overwhelm', 'scattered', 'decision_fatigue', 'mental_exhaustion'],
      environmentSuitability: ['private', 'office', 'home'],
      equipment: ['none'],
      cognitiveLoadHelp: ['lowers_cognitive_load', 'improves_concentration'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'clarify'
    },
    duration: 2,
    difficulty: "beginner",
    creator: "Zeigarnik Effect + GTD (David Allen) + Hemingway technique",
    origin: "Psychology research, productivity methodology, creative process",
    storyHook: "Close open loops, reclaim mental bandwidth and regain energy.",
    usedBy: "Open loops, unfinished tasks, feeling scattered, decision fatigue, mental exhaustion",
    subType: "mindset",
    thumbnail: energyCompletionHero,
    steps: 3
  },
  {
    id: "courage-arena",
    title: "Courage Through The Arena",
    contentType: "micro-practice",
    category: "power-up",
    tags: ['courage', 'fear', 'vulnerability', 'bravery', 'social-risk'],
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['activate', 'optimize'],
      goalTags: ['courage', 'authenticity', 'self_expression', 'vulnerability'],
      physioTarget: ['prefrontal_activation', 'amygdala_regulation'],
      contextTags: ['social_anxiety', 'public_speaking', 'tryouts', 'standing_up'],
      environmentSuitability: ['private', 'office', 'home'],
      equipment: ['none'],
      cognitiveLoadHelp: ['supports_decision', 'emotional_processing'],
      socialTag: 'solo',
      intensityLevel: 'medium',
      energyDirection: 'clarify'
    },
    duration: 2,
    difficulty: "beginner",
    creator: "Brené Brown's \"Daring Greatly\" + Athlete pre-game rituals + Marcus Aurelius",
    origin: "Vulnerability research, sports psychology, Stoic philosophy",
    storyHook: "Step into visibility knowing you might fail – and choose to show up anyway",
    usedBy: "Afraid to speak up, try out, take social risk, be seen, choose authenticity over fitting in",
    subType: "mindset",
    thumbnail: braveActionHero,
    steps: 3
  },
  
  // === NEW: Flow Mastery Mindset Protocols ===
  {
    id: "single-thread-focus",
    title: "Entry Through The Single Thread",
    contentType: "micro-practice",
    category: "presence",
    tags: ['focus', 'attention', 'deep-work', 'concentration', 'single-tasking'],
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['activate', 'optimize'],
      goalTags: ['focus', 'concentration', 'attention', 'deep_work'],
      physioTarget: ['prefrontal_activation'],
      contextTags: ['pre-work', 'scattered_focus', 'task_switching', 'deep_work_session'],
      environmentSuitability: ['private', 'office', 'home'],
      equipment: ['none'],
      cognitiveLoadHelp: ['improves_concentration', 'lowers_cognitive_load'],
      socialTag: 'solo',
      intensityLevel: 'medium',
      energyDirection: 'clarify'
    },
    duration: 2,
    difficulty: "beginner",
    creator: "Zen monk single-pointed concentration (zazen) + Flow research (Csikszentmihalyi) + Cal Newport's \"Deep Work\"",
    origin: "Zen meditation + Flow research + Deep Work methodology",
    storyHook: "Lock attention by choosing one anchor",
    usedBy: "Before entering deep work, when attention keeps fragmenting, starting sessions with scattered focus, task-switching exhaustion",
    subType: "mindset",
    thumbnail: singleThreadFocusHero,
    steps: 4
  },
  {
    id: "first-move-momentum",
    title: "Momentum Through The First Move",
    contentType: "micro-practice",
    category: "presence",
    tags: ['procrastination', 'inertia', 'starting', 'momentum', 'action'],
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['activate'],
      goalTags: ['momentum', 'overcome_inertia', 'starting', 'action'],
      physioTarget: ['prefrontal_activation', 'dopamine_boost'],
      contextTags: ['procrastination', 'task_paralysis', 'perfectionism', 'overwhelm'],
      environmentSuitability: ['any'],
      equipment: ['none'],
      cognitiveLoadHelp: ['lowers_cognitive_load', 'supports_starting'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'uplift'
    },
    duration: 1.5,
    difficulty: "beginner",
    creator: "Newton's First Law (physics) + Atomic Habits (James Clear) + Hemingway's \"one true sentence\"",
    origin: "Physics + Habit formation + Creative process",
    storyHook: "Overcome inertia with the smallest possible start",
    usedBy: "Procrastination, task paralysis, perfectionism preventing start, feeling overwhelmed by scope, resistance to beginning",
    subType: "mindset",
    thumbnail: firstMoveMomentumHero,
    steps: 3
  },
  {
    id: "depth-subtraction",
    title: "Depth Through Subtraction",
    contentType: "micro-practice",
    category: "presence",
    tags: ['essentialism', 'priorities', 'subtraction', 'clarity', 'focus'],
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['optimize'],
      goalTags: ['clarity', 'focus', 'essentialism', 'priorities'],
      physioTarget: ['prefrontal_activation', 'cortisol_reduce'],
      contextTags: ['overwhelm', 'decision_fatigue', 'multitasking', 'unclear_priorities'],
      environmentSuitability: ['private', 'office'],
      equipment: ['none'],
      cognitiveLoadHelp: ['lowers_cognitive_load', 'supports_decision'],
      socialTag: 'solo',
      intensityLevel: 'medium',
      energyDirection: 'clarify'
    },
    duration: 2,
    difficulty: "beginner",
    creator: "Michelangelo's \"sculpture inside the marble\" + Essentialism (Greg McKeown) + Dieter Rams's design principle",
    origin: "Renaissance art + Minimalism + Design philosophy",
    storyHook: "Achieve clarity by removing, not adding",
    usedBy: "Overwhelmed by options, multitasking temptation, unclear priorities, decision fatigue, doing many things poorly",
    subType: "mindset",
    thumbnail: depthSubtractionHero,
    steps: 4
  },
  {
    id: "eternal-now-presence",
    title: "Presence Through The Eternal Now",
    contentType: "micro-practice",
    category: "presence",
    tags: ['mindfulness', 'present-moment', 'awareness', 'attention', 'grounding'],
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['maintain-peak'],
      goalTags: ['presence', 'mindfulness', 'awareness', 'grounding'],
      physioTarget: ['amygdala_regulation', 'default_mode_deactivation'],
      contextTags: ['mind_wandering', 'distraction', 'rumination', 'anxiety'],
      environmentSuitability: ['any'],
      equipment: ['none'],
      cognitiveLoadHelp: ['improves_concentration', 'emotional_regulation'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'stabilize'
    },
    duration: 1.5,
    difficulty: "beginner",
    creator: "Buddhist mindfulness + Eckhart Tolle's \"The Power of Now\" + Flow state research",
    origin: "Buddhist meditation + Contemporary mindfulness + Flow research",
    storyHook: "Anchor in this moment, the only one that exists",
    usedBy: "Mental time-traveling (ruminating on past, anxious about future), distracted during work, mind wandering, feeling disconnected from task",
    subType: "mindset",
    thumbnail: eternalNowPresenceHero,
    steps: 3
  },
  {
    id: "rhythm-pulse",
    title: "Rhythm Through The Pulse",
    contentType: "micro-practice",
    category: "presence",
    tags: ['recovery', 'ultradian-rhythm', 'breaks', 'sustainability', 'energy-management'],
    structuredTags: {
      pillar: 'renewal',
      masterySubtypes: ['restore', 'optimize'],
      goalTags: ['energy_management', 'sustainability', 'recovery', 'performance'],
      physioTarget: ['glucose_replenishment', 'cortisol_regulate'],
      contextTags: ['energy_crash', 'diminishing_returns', 'long_session', 'exhaustion'],
      environmentSuitability: ['any'],
      equipment: ['none'],
      cognitiveLoadHelp: ['supports_recovery', 'sustainable_performance'],
      socialTag: 'solo',
      intensityLevel: 'low',
      energyDirection: 'stabilize'
    },
    duration: 2,
    difficulty: "beginner",
    creator: "Ultradian rhythms (biology) + Pomodoro Technique + Tony Schwartz's \"The Way We're Working Isn't Working\"",
    origin: "Biological science + Time management + Performance psychology",
    storyHook: "Sustain performance through strategic oscillation",
    usedBy: "Energy crash mid-session, diminishing returns despite more hours, forcing focus past exhaustion, guilt about taking breaks",
    subType: "mindset",
    thumbnail: rhythmPulseHero,
    steps: 4
  },
  {
    id: "mastery-constraint",
    title: "Mastery Through Constraint",
    contentType: "micro-practice",
    category: "presence",
    tags: ['deliberate-practice', 'skill-building', 'constraint', 'mastery', 'learning'],
    structuredTags: {
      pillar: 'flow',
      masterySubtypes: ['optimize'],
      goalTags: ['skill_mastery', 'learning', 'deliberate_practice', 'improvement'],
      physioTarget: ['neuroplasticity', 'myelin_building'],
      contextTags: ['skill_plateau', 'scattered_practice', 'slow_progress', 'training'],
      environmentSuitability: ['private', 'training_space'],
      equipment: ['none'],
      cognitiveLoadHelp: ['focused_learning', 'skill_acquisition'],
      socialTag: 'solo',
      intensityLevel: 'high',
      energyDirection: 'clarify'
    },
    duration: 2.5,
    difficulty: "intermediate",
    creator: "Theory of Constraints (Goldratt) + Deliberate Practice (Ericsson) + Haiku poetry structure",
    origin: "Systems thinking + Performance psychology + Japanese aesthetics",
    storyHook: "Accelerate learning by limiting options",
    usedBy: "Skill plateau, learning feels scattered, overwhelmed by what to practice, slow progress despite effort, trying to improve everything at once",
    subType: "mindset",
    thumbnail: masteryConstraintHero,
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
  // First check main content, then quick interventions
  const mainContent = sanctuaryContent.find(c => c.id === id);
  if (mainContent) return mainContent;
  
  // Import quick interventions dynamically to avoid circular deps
  try {
    const { quickInterventions } = require('./quickInterventions');
    return quickInterventions.find((c: SanctuaryContent) => c.id === id);
  } catch {
    return undefined;
  }
};
