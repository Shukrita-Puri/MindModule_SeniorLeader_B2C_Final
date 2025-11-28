// Get Storage URL base
const STORAGE_BASE = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/content-assets`;

// Comprehensive content library with full tagging
export const seedContent = [
  // ============= SOUNDBATHS =============
  
  // POWER-UP Soundbaths
  {
    id: "energised-focus-didgeridoo-bowls",
    title: "Bazaar Sound Journey with Didgeridoo & Bowls",
    contentType: "soundbath",
    category: "power-up",
    duration: 2.47,
    protocol_type: "audio",
    creator: "Didgeridoo traditions and harmonic bowl practices",
    origin: "Feel the pulse of the crowd, the breath of the didgeridoo, and the shimmering bowls guiding your mind from raw energy to sharp clarity.",
    storyHook: "Ancient didgeridoo + Himalayan bowls: raw energy refined into laser-sharp focus.",
    voice: "none",
    language: "en",
    thumbnail: `${STORAGE_BASE}/images/67bda649-edbb-4f39-8290-175122fe99bf.png`,
    audioSrc: `${STORAGE_BASE}/audio/didgeridoo-bowls.mp3`,
    tags: ['fire', 'focus', 'moderate', 'energy', 'activation'],
    steps: 0,
    fullStory: "On ancient Australian plains, the didgeridoo's deep drone stirred courage, balance, and healing. In Himalayan monasteries, bowls were forged to refine the mind with clear, rising tones. True preparation isn't stillness or adrenaline—it is energy with direction. The didgeridoo gives the power; the bowls give the aim. Together, they move you from the body's ancient rhythms to the mind's highest clarity—not to relax you, but to prepare you.\n\nRitual of Use\n\nBefore the challenge — press play.\nClose your eyes.\nLet the rhythm seize you until hesitation dissolves.\nWhen it ends: act.",
    technique: "This is a two-phase practice. Phase 1 (Didgeridoo): Feel the low frequencies in your body—your chest, your belly, your legs. Don't just hear it; let it vibrate through you. This awakens your core energy and vitality. Phase 2 (Singing Bowls): As the bowls enter, feel the energy shift upward—into your heart, your throat, your head. The raw power becomes refined focus. Breathe deeply throughout. This isn't relaxation—it's energized presence. You're learning to transform primal momentum into laser-sharp attention.",
    benefits: [
      "Awakens core vitality and physical energy",
      "Channels raw energy into precise mental focus",
      "Sustains attention with energized presence",
      "Balances activation with calm clarity",
      "Builds capacity for high-intensity concentration"
    ],
    completionQuote: "True focus is not stillness—it is energy with direction. Power without presence is chaos; presence without power is passive.",
    
    // Enhanced tagging
    structuredTags: {
      meta_skills: { primary: ["focus_attention"], secondary: ["energy_regulation"] },
      sub_skills: { primary: ["sustained_attention"], secondary: ["activation_control"] },
      soft_skills: ["concentration", "presence"],
      usage_occasions: ["pre_meeting", "pre_presentation", "before_deep_work"],
      checkin_tags: { primary: ["sluggish", "scattered"], secondary: ["restless"] },
      mastery_category: { primary: "presence", secondary: ["power_up"] }
    }
  },
  {
    id: "warrior-drums",
    title: "Warrior Drums Activation",
    contentType: "soundbath",
    category: "power-up",
    duration: 3.5,
    protocol_type: "audio",
    creator: "Ancient warrior drum traditions",
    origin: "Primal drums from ancient battlefields",
    storyHook: "Primal drums from ancient battlefields—transform hesitation into decisive readiness.",
    voice: "none",
    language: "en",
    thumbnail: `${STORAGE_BASE}/images/warrior-drums-hero.jpg`,
    audioSrc: `${STORAGE_BASE}/audio/warrior-drums.mp3`,
    tags: ['fire', 'pre-meeting', 'intense', 'power', 'courage'],
    steps: 0,
    
    structuredTags: {
      meta_skills: { primary: ["energy_regulation"], secondary: ["emotional_regulation"] },
      sub_skills: { primary: ["activation_control"], secondary: ["courage_building"] },
      soft_skills: ["decisiveness", "courage", "leadership"],
      usage_occasions: ["pre_presentation", "pre_negotiation", "pre_difficult_conversation"],
      checkin_tags: { primary: ["hesitant", "doubtful"], secondary: ["fearful"] },
      mastery_category: { primary: "power_up", secondary: ["presence"] }
    }
  },
  {
    id: "basque-txalaparta",
    title: "Basque Txalaparta — Ancient Wooden Pulse for Presence",
    contentType: "soundbath",
    category: "power-up",
    duration: 4.25,
    protocol_type: "audio",
    creator: "Basque Txalaparta tradition",
    storyHook: "Ancient Basque wooden percussion—transform chaos into grounded presence.",
    voice: "none",
    language: "en",
    thumbnail: `${STORAGE_BASE}/images/basque-txalaparta-hero.jpg`,
    audioSrc: `${STORAGE_BASE}/audio/basque-txalaparta.mp3`,
    tags: ['wood', 'grounding', 'presence'],
    steps: 0,
    
    structuredTags: {
      meta_skills: { primary: ["focus_attention"], secondary: ["emotional_regulation"] },
      sub_skills: { primary: ["grounding"], secondary: ["present_moment_awareness"] },
      soft_skills: ["presence", "composure"],
      usage_occasions: ["amid_chaos", "before_deep_work", "pre_meeting"],
      checkin_tags: { primary: ["chaotic", "scattered"], secondary: ["restless"] },
      mastery_category: { primary: "presence", secondary: ["power_up"] }
    }
  },
  
  // PAUSE Soundbaths
  {
    id: "harmonic-calm",
    title: "Deep Rest & Grounding with Harmonic Calm",
    contentType: "soundbath",
    category: "pause",
    duration: 3,
    protocol_type: "audio",
    creator: "Tibetan Buddhist singing bowl traditions",
    origin: "Tibetan Buddhist singing bowl traditions",
    storyHook: "Ancient Tibetan singing bowls create harmonic resonance for deep rest, nervous system regulation, and grounded presence.",
    voice: "none",
    language: "en",
    thumbnail: `${STORAGE_BASE}/images/c72cc661-d2db-48b0-b39a-d5c4bb2253d3.png`,
    audioSrc: `${STORAGE_BASE}/audio/harmonic-calm.mp3`,
    tags: ['earth', 'post-stress', 'gentle', 'healing', 'meditation'],
    steps: 0,
    fullStory: "For over a thousand years, Tibetan Buddhist monks have used singing bowls as sacred instruments for meditation and healing. These bronze bowls, traditionally crafted in the Himalayan regions, produce harmonic overtones that are believed to align the body's energy centers and quiet the restless mind.",
    technique: "Find a comfortable seated or lying position. Close your eyes and allow your body to settle. As the singing bowls begin, notice how the sound waves seem to move through your body rather than just your ears. Don't try to control your thoughts—simply let the harmonic frequencies wash over you like gentle waves.",
    benefits: [
      "Reduces stress and anxiety through harmonic resonance",
      "Restores emotional balance and inner stability",
      "Cultivates deep relaxation and nervous system regulation",
      "Anchors attention in present-moment awareness",
      "Promotes grounded presence and mental clarity"
    ],
    completionQuote: "In stillness, the mind finds its natural harmony. Like ripples on a pond, thoughts settle into peace.",
    
    structuredTags: {
      meta_skills: { primary: ["emotional_regulation"], secondary: ["self_awareness"] },
      sub_skills: { primary: ["stress_recovery"], secondary: ["nervous_system_regulation"] },
      soft_skills: ["calm", "presence", "patience"],
      usage_occasions: ["post_conflict", "post_stress", "evening_wind_down"],
      checkin_tags: { primary: ["anxious", "overwhelmed"], secondary: ["stressed"] },
      mastery_category: { primary: "pause", secondary: [] }
    }
  },
  {
    id: "deep-calm-forest-bathing",
    title: "Deep Calm Forest Bathing",
    contentType: "soundbath",
    category: "pause",
    duration: 2,
    protocol_type: "audio",
    creator: "Japanese Shinrin-yoku practices",
    origin: "Japanese Shinrin-yoku (forest bathing) practices",
    storyHook: "Used to cultivate deep calm, restore mental clarity, and anchor attention in the present through gentle rain and subtle village sounds.",
    voice: "none",
    language: "en",
    thumbnail: `${STORAGE_BASE}/images/f0c69073-c184-4d25-baaa-c8e5d07cfbd9.png`,
    audioSrc: `${STORAGE_BASE}/audio/forest-bathing.mp3`,
    tags: ['earth', 'nature', 'gentle', 'stress-relief', 'grounding'],
    steps: 0,
    
    structuredTags: {
      meta_skills: { primary: ["emotional_regulation"], secondary: ["self_awareness"] },
      sub_skills: { primary: ["stress_recovery"], secondary: ["grounding"] },
      soft_skills: ["calm", "presence", "receptivity"],
      usage_occasions: ["post_stress", "evening_wind_down", "reset_break"],
      checkin_tags: { primary: ["anxious", "tense"], secondary: ["overwhelmed"] },
      mastery_category: { primary: "pause", secondary: [] }
    }
  },
  {
    id: "monastic-resonance",
    title: "Monastic Resonance — Sacred Bells for Deep Pause",
    contentType: "soundbath",
    category: "pause",
    duration: 5.0,
    protocol_type: "audio",
    creator: "Monastic bell traditions",
    storyHook: "Sacred monastery bells—signal the mind to pause and reset.",
    voice: "none",
    language: "en",
    thumbnail: `${STORAGE_BASE}/images/monastic-resonance-hero.jpg`,
    audioSrc: `${STORAGE_BASE}/audio/monastic-resonance.mp3`,
    tags: ['metal', 'meditation', 'pause'],
    steps: 0,
    
    structuredTags: {
      meta_skills: { primary: ["self_awareness"], secondary: ["emotional_regulation"] },
      sub_skills: { primary: ["mindfulness"], secondary: ["stress_recovery"] },
      soft_skills: ["presence", "patience", "receptivity"],
      usage_occasions: ["reset_break", "meditation_practice", "evening_wind_down"],
      checkin_tags: { primary: ["scattered", "restless"], secondary: ["overwhelmed"] },
      mastery_category: { primary: "pause", secondary: ["presence"] }
    }
  },
  {
    id: "tibetan-bowls",
    title: "Tibetan Singing Bowls — Pure Harmonic Resonance",
    contentType: "soundbath",
    category: "pause",
    duration: 5.5,
    protocol_type: "audio",
    creator: "Traditional Tibetan bowl masters",
    origin: "Ancient Himalayan healing traditions",
    storyHook: "Pure crystal-clear tones that calm the nervous system and restore balance.",
    voice: "none",
    language: "en",
    thumbnail: `${STORAGE_BASE}/images/06444f60-b3bd-4d38-a749-aea185d789e6.png`,
    audioSrc: `${STORAGE_BASE}/audio/tibetan-bowls.mp3`,
    tags: ['metal', 'meditation', 'healing', 'calm'],
    steps: 0,
    
    structuredTags: {
      meta_skills: { primary: ["emotional_regulation"], secondary: ["self_awareness"] },
      sub_skills: { primary: ["nervous_system_regulation"], secondary: ["stress_recovery"] },
      soft_skills: ["calm", "presence", "patience"],
      usage_occasions: ["post_stress", "meditation_practice", "evening_wind_down"],
      checkin_tags: { primary: ["anxious", "tense"], secondary: ["overwhelmed"] },
      mastery_category: { primary: "pause", secondary: [] }
    }
  },
  
  // PRESENCE Soundbaths
  {
    id: "deep-focus-monastic-resonance-alt",
    title: "Deep Focus with Monastic Resonance",
    contentType: "soundbath",
    category: "presence",
    duration: 1.5,
    protocol_type: "audio",
    creator: "Monastic chanting and harmonic rituals",
    origin: "Monastic chanting and harmonic rituals in Himalayan-style summit monasteries",
    storyHook: "Used to sharpen cognitive clarity, sustain deep focus, and expand awareness through layered chants, resonant gongs, and ethereal chimes.",
    voice: "none",
    language: "en",
    thumbnail: `${STORAGE_BASE}/images/monastic-resonance-hero.jpg`,
    audioSrc: `${STORAGE_BASE}/audio/monastic-resonance.mp3`,
    tags: ['air', 'focus', 'moderate', 'meditation', 'clarity'],
    steps: 0,
    
    structuredTags: {
      meta_skills: { primary: ["focus_attention"], secondary: ["self_awareness"] },
      sub_skills: { primary: ["sustained_attention"], secondary: ["mindfulness"] },
      soft_skills: ["concentration", "presence", "clarity"],
      usage_occasions: ["before_deep_work", "focus_session", "creative_work"],
      checkin_tags: { primary: ["scattered", "distracted"], secondary: ["restless"] },
      mastery_category: { primary: "presence", secondary: [] }
    }
  },
  {
    id: "sustained-focus-choir-harmonic",
    title: "Sustained Focus with Choir Harmonic",
    contentType: "soundbath",
    category: "presence",
    duration: 3.5,
    protocol_type: "audio",
    creator: "Sacred harmonic compositions",
    origin: "Sacred harmonic compositions in grand cathedrals",
    storyHook: "Used to enhance focus, cultivate mindful presence, and align energy through layered choirs, bells, and reverberant harmonics.",
    voice: "none",
    language: "en",
    thumbnail: `${STORAGE_BASE}/images/afddfc0a-07c8-4659-bfb5-560d510b12c3.png`,
    audioSrc: `${STORAGE_BASE}/audio/cathedral-choir-flow.mp3`,
    tags: ['air', 'focus', 'moderate', 'sacred', 'resonance'],
    steps: 0,
    
    structuredTags: {
      meta_skills: { primary: ["focus_attention"], secondary: ["self_awareness"] },
      sub_skills: { primary: ["sustained_attention"], secondary: ["flow_state"] },
      soft_skills: ["concentration", "presence", "discipline"],
      usage_occasions: ["before_deep_work", "focus_session", "creative_work"],
      checkin_tags: { primary: ["scattered", "distracted"], secondary: ["sluggish"] },
      mastery_category: { primary: "presence", secondary: [] }
    }
  },
  {
    id: "ina-night-fields",
    title: "Ina Night Fields (Tsukiyomi)",
    contentType: "soundbath",
    category: "presence",
    duration: 42,
    protocol_type: "audio",
    creator: "Natural field recording",
    origin: "Nagano Countryside, Japan",
    storyHook: "In the quiet heart of Nagano's countryside, where the land folds gently into mist and memory, night hums in perfect rhythm.",
    voice: "none",
    language: "en",
    thumbnail: `${STORAGE_BASE}/images/aa4d150b-e5fe-48d7-aa74-9f082d21ffaa.png`,
    audioSrc: `${STORAGE_BASE}/audio/ina-night-fields.mp3`,
    tags: ['water', 'nature', 'gentle', 'evening', 'ambient'],
    steps: 0,
    
    structuredTags: {
      meta_skills: { primary: ["self_awareness"], secondary: ["emotional_regulation"] },
      sub_skills: { primary: ["mindfulness"], secondary: ["present_moment_awareness"] },
      soft_skills: ["presence", "receptivity", "patience"],
      usage_occasions: ["evening_wind_down", "meditation_practice", "sleep_preparation"],
      checkin_tags: { primary: ["restless", "scattered"], secondary: ["anxious"] },
      mastery_category: { primary: "presence", secondary: ["pause"] }
    }
  },
  {
    id: "earth-resonance",
    title: "Earth Resonance — Deep Grounding Frequencies",
    contentType: "soundbath",
    category: "presence",
    duration: 4.5,
    protocol_type: "audio",
    creator: "Schumann resonance-inspired soundscape",
    origin: "Earth's natural electromagnetic frequencies",
    storyHook: "Align with the Earth's natural pulse for deep grounding and centered presence.",
    voice: "none",
    language: "en",
    thumbnail: `${STORAGE_BASE}/images/4ed33e6d-77b9-47f9-9981-bab218507307.png`,
    audioSrc: `${STORAGE_BASE}/audio/earth-resonance.mp3`,
    tags: ['earth', 'grounding', 'resonance', 'nature'],
    steps: 0,
    
    structuredTags: {
      meta_skills: { primary: ["self_awareness"], secondary: ["emotional_regulation"] },
      sub_skills: { primary: ["grounding"], secondary: ["present_moment_awareness"] },
      soft_skills: ["presence", "stability", "calm"],
      usage_occasions: ["amid_chaos", "reset_break", "grounding_practice"],
      checkin_tags: { primary: ["scattered", "ungrounded"], secondary: ["restless"] },
      mastery_category: { primary: "presence", secondary: [] }
    }
  },
  
  // ============= GUIDED PRACTICES =============
  
  // POWER-UP Practices
  {
    id: "kapalabhati-pranayama",
    title: "Energy Surge Through Kapalabhati Pranayama",
    contentType: "guided-practice",
    category: "power-up",
    duration: 6,
    protocol_type: "somatic",
    difficulty: "intermediate",
    origin: "Ancient Yogic Energizing Breath",
    storyHook: "Ancient yogic 'skull shining' breath—instant vitality and mental clarity.",
    usedBy: "Yogis, Warriors, High Performers",
    thumbnail: `${STORAGE_BASE}/images/7a5dd5f2-96fb-485c-a58f-0280491740c1.png`,
    audioSrc: `${STORAGE_BASE}/audio/kapalabhati-pranayama.mp3`,
    creator: "Ancient Yogic Energizing Breath",
    voice: "female",
    language: "en",
    tags: ['fire', 'energy-boost', 'intense', 'morning', 'breathwork'],
    steps: 6,
    fullStory: "Kapalabhati, meaning 'skull shining' in Sanskrit, is an ancient yogic cleansing technique from the Hatha Yoga Pradipika. Yogis discovered that rapid, forceful exhalations generate immediate vitality and mental clarity.",
    technique: "Sharp, forceful exhales through the nose while the belly contracts. The inhale is passive and automatic. Start with 30 breaths, build to 100. End each round with a breath hold.",
    benefits: [
      "Immediate surge of energy and vitality",
      "Complete mental clarity and alertness",
      "Feeling of internal heat and activation",
      "Increased lung capacity and respiratory health",
      "Stronger core muscles",
      "Enhanced metabolic rate"
    ],
    completionQuote: "Your skull is shining. Your fire is lit. You are fully activated.",
    whatYouNeed: [
      "⚠️ DO NOT PRACTICE IF: Pregnant, heart disease, high blood pressure",
      "Essential: Empty stomach (at least 2 hours after eating)",
      "Essential: Comfortable seated position with straight spine"
    ],
    expectedOutcomes: [
      "Immediate: Surge of energy and vitality",
      "Regular Practice: Significantly increased energy levels"
    ],
    
    practiceSteps: [
      { title: "Setup", instruction: "Sit comfortably with spine straight. Empty stomach required.", duration: 30 },
      { title: "Breathing Pattern", instruction: "Sharp exhales through nose, passive inhales. Belly pumps forcefully.", duration: 60 },
      { title: "Round 1", instruction: "30 rapid breaths, then breath hold for 15 seconds.", duration: 90 },
      { title: "Round 2", instruction: "50 rapid breaths, then breath hold for 20 seconds.", duration: 90 },
      { title: "Round 3", instruction: "100 rapid breaths, then breath hold for 30 seconds.", duration: 120 },
      { title: "Integration", instruction: "Return to normal breathing. Notice the energy surge.", duration: 60 }
    ],
    
    structuredTags: {
      meta_skills: { primary: ["energy_regulation"], secondary: ["focus_attention"] },
      sub_skills: { primary: ["activation_control"], secondary: ["breath_control"] },
      soft_skills: ["vitality", "discipline", "resilience"],
      usage_occasions: ["morning_activation", "pre_workout", "midday_energy_dip"],
      checkin_tags: { primary: ["sluggish", "fatigued"], secondary: ["foggy"] },
      mastery_category: { primary: "power_up", secondary: [] }
    }
  },
  {
    id: "energy-forge",
    title: "Energy Through The Forge",
    contentType: "guided-practice",
    category: "power-up",
    duration: 1.5,
    protocol_type: "somatic",
    difficulty: "beginner",
    creator: "Physiological state-shifting techniques",
    origin: "Techniques from athletes, performers and Special Forces",
    storyHook: "Rapid activation when energy runs low—when rest isn't an option but energy is required now.",
    voice: "male",
    language: "en",
    thumbnail: `${STORAGE_BASE}/images/6ad3487d-07e9-414e-96cd-7a73d8a12c03.png`,
    audioSrc: `${STORAGE_BASE}/audio/energy-forge.mp3`,
    tags: ['energy', 'activation', 'somatic', 'movement', 'state-shift'],
    steps: 3,
    
    practiceSteps: [
      { title: "Physical Activation", instruction: "Stand tall, shake limbs vigorously for 20 seconds.", duration: 20 },
      { title: "Power Breath", instruction: "10 deep power breaths—full inhale, explosive exhale.", duration: 40 },
      { title: "Movement Integration", instruction: "Jump or march in place, arms overhead, declaring readiness.", duration: 30 }
    ],
    
    structuredTags: {
      meta_skills: { primary: ["energy_regulation"], secondary: ["focus_attention"] },
      sub_skills: { primary: ["activation_control"], secondary: ["somatic_awareness"] },
      soft_skills: ["vitality", "decisiveness", "resilience"],
      usage_occasions: ["midday_energy_dip", "pre_meeting", "afternoon_slump"],
      checkin_tags: { primary: ["sluggish", "fatigued"], secondary: ["foggy"] },
      mastery_category: { primary: "power_up", secondary: [] }
    }
  },
  
  // PAUSE Practices
  {
    id: "box-breathing",
    title: "Combat Breathing — Box Breathing for Instant Calm Under Pressure",
    contentType: "guided-practice",
    category: "pause",
    duration: 4,
    protocol_type: "somatic",
    difficulty: "beginner",
    origin: "Navy SEAL training",
    storyHook: "Used by Navy SEALs to stay calm under extreme pressure—regain control in seconds.",
    usedBy: "Special Forces, Elite Athletes, Emergency Responders",
    thumbnail: `${STORAGE_BASE}/images/76cee14b-c6a7-4d75-8162-8a5ba6f74a9d.png`,
    audioSrc: `${STORAGE_BASE}/audio/box-breathing.mp3`,
    creator: "Navy SEAL training protocol",
    voice: "male",
    language: "en",
    tags: ['water', 'stress-relief', 'performance', 'tactical', 'calm'],
    steps: 5,
    
    practiceSteps: [
      { title: "Setup", instruction: "Sit or stand comfortably. Focus on breath.", duration: 20 },
      { title: "Pattern Introduction", instruction: "Breathe in 4 counts, hold 4, exhale 4, hold 4. This is the 'box'.", duration: 30 },
      { title: "Practice Round 1", instruction: "Complete 3 full box cycles at your own pace.", duration: 60 },
      { title: "Practice Round 2", instruction: "5 more cycles, finding rhythm and calm.", duration: 100 },
      { title: "Integration", instruction: "Return to natural breath. Notice the calm.", duration: 30 }
    ],
    
    structuredTags: {
      meta_skills: { primary: ["emotional_regulation"], secondary: ["self_awareness"] },
      sub_skills: { primary: ["stress_recovery"], secondary: ["breath_control"] },
      soft_skills: ["composure", "resilience", "self_control"],
      usage_occasions: ["pre_high_stakes_moment", "post_conflict", "amid_stress"],
      checkin_tags: { primary: ["anxious", "stressed"], secondary: ["overwhelmed"] },
      mastery_category: { primary: "pause", secondary: [] }
    }
  },
  {
    id: "bhramari-pranayama",
    title: "Instant Reset Through Bhramari Pranayama (Bee Breath)",
    contentType: "guided-practice",
    category: "pause",
    duration: 4,
    protocol_type: "somatic",
    difficulty: "beginner",
    origin: "Ancient yogic calming breath",
    storyHook: "Ancient yogic 'humming bee' breath—instant nervous system reset.",
    usedBy: "Yogis, Meditators, Anxiety Relief",
    thumbnail: `${STORAGE_BASE}/images/909c474b-063c-47f3-aae1-2ef5c7098a8e.png`,
    audioSrc: `${STORAGE_BASE}/audio/bhramari-pranayama.mp3`,
    creator: "Ancient Yogic Calming Breath",
    voice: "female",
    language: "en",
    tags: ['water', 'anxiety-relief', 'gentle', 'calm', 'breathwork'],
    steps: 5,
    
    practiceSteps: [
      { title: "Setup", instruction: "Sit comfortably. Close eyes. Cover ears with thumbs.", duration: 30 },
      { title: "Humming Introduction", instruction: "Inhale deeply. Exhale with a low humming sound like a bee.", duration: 30 },
      { title: "Practice Round 1", instruction: "5 full humming breaths. Feel the vibration.", duration: 60 },
      { title: "Practice Round 2", instruction: "5 more breaths. Let the hum resonate through your skull.", duration: 60 },
      { title: "Integration", instruction: "Lower hands. Notice the deep calm.", duration: 20 }
    ],
    
    structuredTags: {
      meta_skills: { primary: ["emotional_regulation"], secondary: ["self_awareness"] },
      sub_skills: { primary: ["stress_recovery"], secondary: ["nervous_system_regulation"] },
      soft_skills: ["calm", "patience", "self_soothing"],
      usage_occasions: ["post_stress", "anxiety_spike", "evening_wind_down"],
      checkin_tags: { primary: ["anxious", "overwhelmed"], secondary: ["restless"] },
      mastery_category: { primary: "pause", secondary: [] }
    }
  },
  {
    id: "vagus-wind-down",
    title: "The Vagus Wind-Down",
    contentType: "guided-practice",
    category: "pause",
    duration: 5,
    protocol_type: "somatic",
    creator: "Taoist monks and elite combat athletes",
    origin: "Ancient tuning meets modern neuroscience",
    storyHook: "Calm the throat, settle the breath, and signal your nervous system to rest — as taught by Taoist monks and elite combat athletes.",
    voice: "female",
    language: "en",
    thumbnail: `${STORAGE_BASE}/images/b8ffb35c-7a57-47ef-a879-1aff9c47603d.png`,
    audioSrc: `${STORAGE_BASE}/audio/vagus-wind-down.mp3`,
    tags: ['water', 'evening', 'gentle', 'nervous-system', 'sleep-prep', 'calm'],
    steps: 6,
    difficulty: "beginner",
    
    practiceSteps: [
      { title: "Grounding", instruction: "Lie down or sit comfortably. Close eyes. Feel the body.", duration: 30 },
      { title: "Throat Hum", instruction: "Gentle humming in the throat. Feel the vagus nerve activate.", duration: 60 },
      { title: "Extended Exhale", instruction: "Breathe in for 4, out for 8. Repeat 5 times.", duration: 90 },
      { title: "Gargling Breath", instruction: "Breathe with a soft gargling sound in throat. 3 breaths.", duration: 45 },
      { title: "Yawn Release", instruction: "Allow natural yawning. Signal deep relaxation to the body.", duration: 45 },
      { title: "Stillness", instruction: "Rest in complete stillness. Feel the nervous system settle.", duration: 60 }
    ],
    
    structuredTags: {
      meta_skills: { primary: ["emotional_regulation"], secondary: ["self_awareness"] },
      sub_skills: { primary: ["nervous_system_regulation"], secondary: ["stress_recovery"] },
      soft_skills: ["self_soothing", "patience", "receptivity"],
      usage_occasions: ["evening_wind_down", "sleep_preparation", "post_stress"],
      checkin_tags: { primary: ["wired", "restless"], secondary: ["anxious"] },
      mastery_category: { primary: "pause", secondary: [] }
    }
  },
  {
    id: "himalayan-monastery",
    title: "Himalayan Monastery — Sacred Chants for Deep Meditation",
    contentType: "guided-practice",
    category: "pause",
    duration: 8,
    protocol_type: "audio",
    difficulty: "beginner",
    creator: "Tibetan Buddhist monastery traditions",
    origin: "High Himalayan meditation practices",
    storyHook: "Experience the profound stillness of Himalayan monks through sacred chants and bells.",
    voice: "none",
    language: "en",
    thumbnail: `${STORAGE_BASE}/images/cc7c715b-a0d1-4464-b0e1-d338c14452a0.png`,
    audioSrc: `${STORAGE_BASE}/audio/himalayan-monastery.wav`,
    tags: ['meditation', 'sacred', 'spiritual', 'deep-calm'],
    steps: 4,
    
    practiceSteps: [
      { title: "Sacred Space", instruction: "Find a quiet space. Sit in meditation posture.", duration: 60 },
      { title: "Chant Immersion", instruction: "Let the sacred chants wash over you. Don't force anything.", duration: 300 },
      { title: "Bell Contemplation", instruction: "As bells ring, feel each tone dissolve thoughts.", duration: 120 },
      { title: "Stillness", instruction: "Rest in the silence after. Pure presence.", duration: 120 }
    ],
    
    structuredTags: {
      meta_skills: { primary: ["self_awareness"], secondary: ["emotional_regulation"] },
      sub_skills: { primary: ["mindfulness"], secondary: ["spiritual_awareness"] },
      soft_skills: ["presence", "patience", "receptivity"],
      usage_occasions: ["meditation_practice", "spiritual_practice", "evening_wind_down"],
      checkin_tags: { primary: ["scattered", "restless"], secondary: ["seeking_meaning"] },
      mastery_category: { primary: "pause", secondary: ["presence"] }
    }
  },
  
  // PRESENCE Practices
  {
    id: "trataka-single-focus",
    title: "Unlock Flow with Trataka (Candle Gazing)",
    contentType: "guided-practice",
    category: "presence",
    duration: 9,
    protocol_type: "mindset",
    difficulty: "intermediate",
    origin: "Ancient yogic concentration practice",
    storyHook: "Ancient yogic candle-gazing technique—develop razor-sharp focus and enter flow states at will.",
    usedBy: "Yogis, Deep Work Practitioners, Flow State Seekers",
    thumbnail: `${STORAGE_BASE}/images/ae4d66fb-b3ea-4ef5-bfff-f228c447224c.png`,
    audioSrc: `${STORAGE_BASE}/audio/trataka-single-focus.mp3`,
    creator: "Ancient Yogic Concentration Practice",
    voice: "male",
    language: "en",
    tags: ['air', 'focus', 'advanced', 'flow-state', 'concentration'],
    steps: 6,
    
    practiceSteps: [
      { title: "Setup", instruction: "Light a candle. Sit 2-3 feet away at eye level. Dim other lights.", duration: 60 },
      { title: "Initial Gaze", instruction: "Gaze at the flame without blinking. 1-2 minutes.", duration: 120 },
      { title: "Close Eyes", instruction: "Close eyes. See the afterimage. Hold it.", duration: 90 },
      { title: "Repeat Cycle", instruction: "Open eyes, gaze again. Repeat 2 more times.", duration: 180 },
      { title: "Extended Hold", instruction: "Final gaze. Hold as long as possible without strain.", duration: 120 },
      { title: "Integration", instruction: "Blow out candle. Notice the sharpened focus.", duration: 60 }
    ],
    
    structuredTags: {
      meta_skills: { primary: ["focus_attention"], secondary: ["self_awareness"] },
      sub_skills: { primary: ["sustained_attention"], secondary: ["flow_state"] },
      soft_skills: ["concentration", "discipline", "patience"],
      usage_occasions: ["before_deep_work", "focus_practice", "flow_training"],
      checkin_tags: { primary: ["distracted", "scattered"], secondary: ["restless"] },
      mastery_category: { primary: "presence", secondary: [] }
    }
  },
  
  // ============= MICRO PRACTICES =============
  
  // PAUSE Micro Practices
  {
    id: "grounding-touch",
    title: "Instant Calm Through Somatic Touch",
    contentType: "micro-practice",
    category: "pause",
    duration: 2,
    protocol_type: "somatic",
    difficulty: "beginner",
    creator: "Thomas Hanna, founder of Somatics",
    origin: "Somatic awareness and polyvagal theory",
    storyHook: "For moments of anxiety, overwhelm, panic, emotional flooding, or after receiving hard news",
    thumbnail: `${STORAGE_BASE}/images/6ad3487d-07e9-414e-96cd-7a73d8a12c03.png`,
    tags: ['earth', 'anxiety-relief', 'gentle', 'nervous-system'],
    steps: 4,
    subType: "tool",
    essence: "The body can calm the mind faster than thoughts can. When you touch with awareness, you signal safety directly to your nervous system.",
    cue: "\"Touch. Feel. Soften.\"",
    instructions: [
      "Notice the body alarm (3 seconds): You feel the rush: heart pounding, throat tight, chest heavy. Name it: \"My body is on alert.\"",
      "Make contact — the anchor touch (5 seconds): Choose one: Hand on heart, hand on belly, or both hands on thighs.",
      "The settling breath (10 seconds): Inhale for 4, hold for 2, exhale for 6. Say: \"It's safe to soften.\"",
      "Soothing through micro-movement: Notice what your body wants next—maybe a sigh, a yawn, a shoulder drop. Let it happen."
    ],
    whyThisWorks: "Your skin is a direct access point to your autonomic nervous system. Gentle touch releases oxytocin, lowers cortisol, and activates the vagal brake—a physiological safety signal.",
    
    structuredTags: {
      meta_skills: { primary: ["emotional_regulation"], secondary: ["self_awareness"] },
      sub_skills: { primary: ["stress_recovery"], secondary: ["somatic_awareness"] },
      soft_skills: ["self_soothing", "composure", "resilience"],
      usage_occasions: ["anxiety_spike", "post_conflict", "overwhelming_news"],
      checkin_tags: { primary: ["anxious", "panicked"], secondary: ["overwhelmed"] },
      mastery_category: { primary: "pause", secondary: [] }
    }
  },
  {
    id: "fudoshin-immovable-mind",
    title: "Calm in Chaos Through Fudōshin",
    contentType: "micro-practice",
    category: "pause",
    duration: 1,
    protocol_type: "hybrid",
    difficulty: "beginner",
    creator: "Samurai warrior philosophy",
    origin: "Fudōshin (不動心) — The Immovable Mind principle",
    storyHook: "For critical performances, leadership under crisis, public speaking, and confrontation",
    thumbnail: `${STORAGE_BASE}/images/909c474b-063c-47f3-aae1-2ef5c7098a8e.png`,
    tags: ['earth', 'high-pressure', 'leadership', 'performance', 'composure'],
    steps: 4,
    subType: "tool",
    essence: "Your center remains still even when the world around you moves violently. Calm presence in chaos.",
    cue: "\"Still center, moving world.\"",
    instructions: [
      "Root yourself physically (10 seconds): Feet shoulder-width apart. Feel weight drop through your heels.",
      "Find your gravity center (5 seconds): Place hand two inches below navel. Breathe into that spot.",
      "The mountain meditation (15 seconds): Visualize yourself as a mountain—storms pass but you don't flinch.",
      "Micro-adjustments during action: Every 2-3 minutes check: Am I breathing? Is my jaw relaxed?"
    ],
    
    structuredTags: {
      meta_skills: { primary: ["emotional_regulation"], secondary: ["focus_attention"] },
      sub_skills: { primary: ["composure_under_pressure"], secondary: ["grounding"] },
      soft_skills: ["composure", "leadership", "resilience"],
      usage_occasions: ["pre_presentation", "crisis_moment", "high_stakes_meeting"],
      checkin_tags: { primary: ["anxious", "fearful"], secondary: ["overwhelmed"] },
      mastery_category: { primary: "pause", secondary: ["presence"] }
    }
  },
  {
    id: "eye-of-storm",
    title: "Clarity in Chaos Through The Eye",
    contentType: "micro-practice",
    category: "pause",
    duration: 1,
    protocol_type: "mindset",
    difficulty: "beginner",
    creator: "Inspired from Sun Tzu",
    origin: "\"In the midst of chaos, there is also opportunity.\" — Sun Tzu",
    storyHook: "For overwhelming situations, information overload, when multiple demands hit simultaneously",
    thumbnail: `${STORAGE_BASE}/images/cc7c715b-a0d1-4464-b0e1-d338c14452a0.png`,
    tags: ['earth', 'overwhelm', 'information-overload', 'focus', 'mastery'],
    steps: 3,
    subType: "tool",
    instructions: [
      "Name the storm (10 seconds): \"I'm in overwhelm. Too many inputs. I need the eye.\"",
      "The single anchor question (20 seconds): Ask: \"What is the ONE thing that, if handled now, makes everything else easier?\"",
      "Act from the center (ongoing): Do that one thing. Ignore everything else until it's done."
    ],
    
    structuredTags: {
      meta_skills: { primary: ["focus_attention"], secondary: ["decision_making"] },
      sub_skills: { primary: ["priority_setting"], secondary: ["single_tasking"] },
      soft_skills: ["clarity", "decisiveness", "essentialism"],
      usage_occasions: ["information_overload", "multiple_demands", "overwhelm_moment"],
      checkin_tags: { primary: ["overwhelmed", "scattered"], secondary: ["chaotic"] },
      mastery_category: { primary: "pause", secondary: ["presence"] }
    }
  },
  
  // POWER-UP Micro Practices
  {
    id: "phoenix-mindset",
    title: "Momentum Through Phoenix Rising",
    contentType: "micro-practice",
    category: "power-up",
    duration: 1.5,
    protocol_type: "mindset",
    difficulty: "beginner",
    creator: "Ancient mythology meets modern psychology",
    origin: "Phoenix rising from ashes metaphor",
    storyHook: "Turn setbacks into comebacks—rise stronger from every failure",
    thumbnail: `${STORAGE_BASE}/images/b8ffb35c-7a57-47ef-a879-1aff9c47603d.png`,
    tags: ['resilience', 'recovery', 'transformation', 'growth'],
    steps: 3,
    subType: "mindset",
    instructions: [
      "Name the ashes: Acknowledge what broke. \"This failed. I'm in the ashes.\"",
      "Find the ember: Ask: \"What did I learn? What's still alive in me?\"",
      "Rise with it: Take one action that proves you're not done. Start small."
    ],
    
    structuredTags: {
      meta_skills: { primary: ["emotional_regulation"], secondary: ["growth_mindset"] },
      sub_skills: { primary: ["resilience_building"], secondary: ["reframing"] },
      soft_skills: ["resilience", "optimism", "perseverance"],
      usage_occasions: ["post_failure", "setback_recovery", "rejection_processing"],
      checkin_tags: { primary: ["defeated", "discouraged"], secondary: ["doubtful"] },
      mastery_category: { primary: "power_up", secondary: [] }
    }
  },
  {
    id: "ikigai-purpose",
    title: "Meaning Through Ikigai",
    contentType: "micro-practice",
    category: "power-up",
    duration: 2,
    protocol_type: "mindset",
    difficulty: "beginner",
    creator: "Japanese philosophy",
    origin: "Japanese concept of life purpose",
    storyHook: "Connect daily tasks to deeper purpose—fuel intrinsic motivation",
    thumbnail: `${STORAGE_BASE}/images/ae4d66fb-b3ea-4ef5-bfff-f228c447224c.png`,
    tags: ['purpose', 'meaning', 'motivation', 'fulfillment'],
    steps: 4,
    subType: "mindset",
    instructions: [
      "Name the task: What feels meaningless right now?",
      "Find the thread: How does this connect to what matters to you?",
      "Reframe with purpose: \"I'm not just [doing task]. I'm [higher purpose].\"",
      "Hold that frame: Before starting, repeat the purpose frame once."
    ],
    
    structuredTags: {
      meta_skills: { primary: ["self_awareness"], secondary: ["purpose_alignment"] },
      sub_skills: { primary: ["meaning_making"], secondary: ["motivation_regulation"] },
      soft_skills: ["purposefulness", "intrinsic_motivation", "perspective"],
      usage_occasions: ["unmotivated_moment", "tedious_task", "purpose_alignment"],
      checkin_tags: { primary: ["unmotivated", "disconnected"], secondary: ["bored"] },
      mastery_category: { primary: "power_up", secondary: ["presence"] }
    }
  },
  {
    id: "buddhist-phoenix",
    title: "Resilience Through the Buddhist Phoenix",
    contentType: "micro-practice",
    category: "power-up",
    duration: 2,
    protocol_type: "mindset",
    difficulty: "intermediate",
    creator: "Buddhist teaching",
    origin: "\"No mud, no lotus.\" — Thích Nhất Hạnh",
    storyHook: "Beauty emerges from suffering—the lotus grows in muddy water",
    thumbnail: `${STORAGE_BASE}/images/76cee14b-c6a7-4d75-8162-8a5ba6f74a9d.png`,
    tags: ['resilience', 'recovery', 'hardship', 'growth'],
    steps: 4,
    subType: "mindset",
    instructions: [
      "Name the mud: \"I'm in the mud right now. This is where growth happens.\"",
      "Micro-signs of growth: Look for tiny improvements daily.",
      "Reframe suffering as composting: The mud is fuel for wisdom and strength.",
      "Honor the mud: When you emerge, remember you grew because of it."
    ],
    
    structuredTags: {
      meta_skills: { primary: ["emotional_regulation"], secondary: ["growth_mindset"] },
      sub_skills: { primary: ["resilience_building"], secondary: ["meaning_making"] },
      soft_skills: ["resilience", "wisdom", "acceptance"],
      usage_occasions: ["hardship_period", "prolonged_difficulty", "growth_reflection"],
      checkin_tags: { primary: ["discouraged", "suffering"], secondary: ["defeated"] },
      mastery_category: { primary: "power_up", secondary: [] }
    }
  },
  {
    id: "energy-through-reframe",
    title: "Energy Through Reframe",
    contentType: "micro-practice",
    category: "power-up",
    duration: 1.5,
    protocol_type: "mindset",
    difficulty: "beginner",
    creator: "Cognitive reappraisal techniques",
    origin: "Psychology and neuroscience",
    storyHook: "Rapid activation when energy runs low through mental reframing",
    thumbnail: `${STORAGE_BASE}/images/909c474b-063c-47f3-aae1-2ef5c7098a8e.png`,
    tags: ['energy', 'reframe', 'motivation', 'fatigue'],
    steps: 3,
    subType: "mindset",
    instructions: [
      "Name the drain: \"I'm tired. I don't have energy for this.\"",
      "Reframe as activation: \"This is my moment to prove I can show up tired.\"",
      "Channel micro-energy: Stand up. Take 3 power breaths. Move forward."
    ],
    
    structuredTags: {
      meta_skills: { primary: ["energy_regulation"], secondary: ["growth_mindset"] },
      sub_skills: { primary: ["reframing"], secondary: ["motivation_regulation"] },
      soft_skills: ["resilience", "perseverance", "discipline"],
      usage_occasions: ["afternoon_slump", "fatigue_moment", "low_motivation"],
      checkin_tags: { primary: ["fatigued", "sluggish"], secondary: ["unmotivated"] },
      mastery_category: { primary: "power_up", secondary: [] }
    }
  },
  {
    id: "courage-future-self",
    title: "Courage Through The Future Self",
    contentType: "micro-practice",
    category: "power-up",
    duration: 3,
    protocol_type: "mindset",
    difficulty: "beginner",
    creator: "Stoic philosophy meets modern psychology",
    origin: "Regret Minimization Framework",
    storyHook: "Act with courage by consulting your future self",
    thumbnail: `${STORAGE_BASE}/images/cc7c715b-a0d1-4464-b0e1-d338c14452a0.png`,
    tags: ['courage', 'fear', 'decision', 'growth'],
    steps: 5,
    subType: "mindset",
    instructions: [
      "Name the fear: \"I'm afraid to [action]. I might [failure scenario].\"",
      "Time travel: Close eyes. Imagine yourself 10 years from now.",
      "Ask your future self: \"Did I regret taking this risk?\"",
      "Reverse regret: If the answer is \"I wish I had tried\"—that's your compass.",
      "Act: Make the courageous choice your future self would thank you for."
    ],
    
    structuredTags: {
      meta_skills: { primary: ["decision_making"], secondary: ["emotional_regulation"] },
      sub_skills: { primary: ["courage_building"], secondary: ["long_term_thinking"] },
      soft_skills: ["courage", "wisdom", "perspective"],
      usage_occasions: ["difficult_decision", "fear_moment", "risk_assessment"],
      checkin_tags: { primary: ["fearful", "hesitant"], secondary: ["doubtful"] },
      mastery_category: { primary: "power_up", secondary: [] }
    }
  },
  {
    id: "confidence-through-evidence",
    title: "Confidence Through Evidence",
    contentType: "micro-practice",
    category: "power-up",
    duration: 2,
    protocol_type: "mindset",
    difficulty: "beginner",
    creator: "Cognitive Behavioral Therapy",
    origin: "CBT and sports psychology",
    storyHook: "Rebuild self-belief with your own proof",
    thumbnail: `${STORAGE_BASE}/images/06444f60-b3bd-4d38-a749-aea185d789e6.png`,
    tags: ['confidence', 'self-belief', 'performance', 'evidence'],
    steps: 3,
    subType: "mindset",
    instructions: [
      "Name the doubt: \"I don't think I can do this. I'm not [capable/ready/strong enough].\"",
      "Evidence hunt: List 3 times you've done something similar—or harder.",
      "Reframe as proof: \"I've done this before. I can do it again. Here's my evidence: [list].\" Act from that truth."
    ],
    
    structuredTags: {
      meta_skills: { primary: ["self_awareness"], secondary: ["emotional_regulation"] },
      sub_skills: { primary: ["confidence_building"], secondary: ["evidence_based_thinking"] },
      soft_skills: ["confidence", "self_belief", "resilience"],
      usage_occasions: ["self_doubt_moment", "pre_performance", "confidence_building"],
      checkin_tags: { primary: ["doubtful", "insecure"], secondary: ["fearful"] },
      mastery_category: { primary: "power_up", secondary: [] }
    }
  },
  
  // PRESENCE Micro Practices
  {
    id: "single-thread-focus",
    title: "Entry Through The Single Thread",
    contentType: "micro-practice",
    category: "presence",
    duration: 2,
    protocol_type: "mindset",
    difficulty: "beginner",
    creator: "Zen meditation meets deep work",
    origin: "Zen single-pointed concentration",
    storyHook: "Lock attention by choosing one anchor",
    thumbnail: `${STORAGE_BASE}/images/7a5dd5f2-96fb-485c-a58f-0280491740c1.png`,
    tags: ['focus', 'attention', 'deep-work', 'concentration'],
    steps: 4,
    subType: "mindset",
    instructions: [
      "Name the chaos: \"My attention is split. I need one thread.\"",
      "Choose the thread: What is the single most important thing right now?",
      "Pull the thread: Close everything else. One tab. One task. One focus.",
      "Protect the thread: Set a timer. Commit to not switching for 25 minutes."
    ],
    
    structuredTags: {
      meta_skills: { primary: ["focus_attention"], secondary: ["self_awareness"] },
      sub_skills: { primary: ["single_tasking"], secondary: ["sustained_attention"] },
      soft_skills: ["concentration", "discipline", "clarity"],
      usage_occasions: ["before_deep_work", "focus_session", "distraction_moment"],
      checkin_tags: { primary: ["scattered", "distracted"], secondary: ["unfocused"] },
      mastery_category: { primary: "presence", secondary: [] }
    }
  },
  {
    id: "first-move-momentum",
    title: "Momentum Through The First Move",
    contentType: "micro-practice",
    category: "presence",
    duration: 1.5,
    protocol_type: "mindset",
    difficulty: "beginner",
    creator: "Physics meets habit formation",
    origin: "Newton's First Law applied to action",
    storyHook: "Overcome inertia with the smallest possible start",
    thumbnail: `${STORAGE_BASE}/images/afddfc0a-07c8-4659-bfb5-560d510b12c3.png`,
    tags: ['procrastination', 'inertia', 'starting', 'momentum'],
    steps: 3,
    subType: "mindset",
    instructions: [
      "Name the inertia: \"I'm stuck. I don't want to start.\"",
      "Shrink the first move: What's the smallest possible action? (Open file, write one sentence, stand up.)",
      "Move: Do that one tiny thing. Momentum follows."
    ],
    
    structuredTags: {
      meta_skills: { primary: ["action_initiation"], secondary: ["self_awareness"] },
      sub_skills: { primary: ["overcoming_procrastination"], secondary: ["momentum_building"] },
      soft_skills: ["initiative", "perseverance", "discipline"],
      usage_occasions: ["procrastination_moment", "task_avoidance", "stuck_feeling"],
      checkin_tags: { primary: ["procrastinating", "stuck"], secondary: ["unmotivated"] },
      mastery_category: { primary: "presence", secondary: [] }
    }
  },
  {
    id: "depth-subtraction",
    title: "Depth Through Subtraction",
    contentType: "micro-practice",
    category: "presence",
    duration: 2,
    protocol_type: "mindset",
    difficulty: "beginner",
    creator: "Essentialism philosophy",
    origin: "Michelangelo's sculpture metaphor",
    storyHook: "Achieve clarity by removing, not adding",
    thumbnail: `${STORAGE_BASE}/images/4ed33e6d-77b9-47f9-9981-bab218507307.png`,
    tags: ['essentialism', 'priorities', 'subtraction', 'clarity'],
    steps: 4,
    subType: "mindset",
    instructions: [
      "Name the clutter: \"I have too much. I'm doing too many things.\"",
      "The subtraction question: \"What can I remove that won't matter in 6 months?\"",
      "Cut one thing: Remove it from your list/calendar/life. Now.",
      "Feel the space: Notice the clarity. Depth comes from less, not more."
    ],
    
    structuredTags: {
      meta_skills: { primary: ["priority_setting"], secondary: ["decision_making"] },
      sub_skills: { primary: ["essentialism"], secondary: ["clarity_building"] },
      soft_skills: ["clarity", "decisiveness", "essentialism"],
      usage_occasions: ["overwhelm_moment", "priority_setting", "simplification"],
      checkin_tags: { primary: ["overwhelmed", "scattered"], secondary: ["chaotic"] },
      mastery_category: { primary: "presence", secondary: [] }
    }
  },
  {
    id: "eternal-now-presence",
    title: "Presence Through The Eternal Now",
    contentType: "micro-practice",
    category: "presence",
    duration: 1.5,
    protocol_type: "mindset",
    difficulty: "beginner",
    creator: "Buddhist mindfulness",
    origin: "The Power of Now philosophy",
    storyHook: "Anchor in this moment, the only one that exists",
    thumbnail: `${STORAGE_BASE}/images/aa4d150b-e5fe-48d7-aa74-9f082d21ffaa.png`,
    tags: ['mindfulness', 'present-moment', 'awareness', 'attention'],
    steps: 3,
    subType: "mindset",
    instructions: [
      "Notice time travel: \"Am I in the past (ruminating) or future (worrying)?\"",
      "Anchor here: Name 3 things you can see, 2 you can hear, 1 you can feel.",
      "Declare presence: \"Right now, I am here. Everything else is a story.\""
    ],
    
    structuredTags: {
      meta_skills: { primary: ["self_awareness"], secondary: ["focus_attention"] },
      sub_skills: { primary: ["mindfulness"], secondary: ["present_moment_awareness"] },
      soft_skills: ["presence", "awareness", "calm"],
      usage_occasions: ["rumination_spiral", "worry_moment", "mindfulness_practice"],
      checkin_tags: { primary: ["ruminating", "worrying"], secondary: ["distracted"] },
      mastery_category: { primary: "presence", secondary: [] }
    }
  },
  {
    id: "rhythm-pulse",
    title: "Rhythm Through The Pulse",
    contentType: "micro-practice",
    category: "presence",
    duration: 2,
    protocol_type: "mindset",
    difficulty: "beginner",
    creator: "Ultradian rhythms research",
    origin: "Biological performance cycles",
    storyHook: "Sustain performance through strategic oscillation",
    thumbnail: `${STORAGE_BASE}/images/6ad3487d-07e9-414e-96cd-7a73d8a12c03.png`,
    tags: ['recovery', 'ultradian-rhythm', 'breaks', 'sustainability'],
    steps: 4,
    subType: "mindset",
    instructions: [
      "Notice the dip: After 90 minutes, your body signals rest. Don't ignore it.",
      "Take the pulse break: 5-10 minutes. Stand, stretch, breathe, hydrate.",
      "No screens: Let your brain recover. Look out a window or close your eyes.",
      "Return renewed: You'll have another 90 minutes of peak focus."
    ],
    
    structuredTags: {
      meta_skills: { primary: ["energy_regulation"], secondary: ["self_awareness"] },
      sub_skills: { primary: ["recovery_timing"], secondary: ["sustainable_performance"] },
      soft_skills: ["self_care", "sustainability", "awareness"],
      usage_occasions: ["mid_work_session", "fatigue_signal", "break_timing"],
      checkin_tags: { primary: ["fatigued", "drained"], secondary: ["unfocused"] },
      mastery_category: { primary: "presence", secondary: [] }
    }
  },
  {
    id: "mastery-constraint",
    title: "Mastery Through Constraint",
    contentType: "micro-practice",
    category: "presence",
    duration: 2.5,
    protocol_type: "mindset",
    difficulty: "intermediate",
    creator: "Deliberate practice research",
    origin: "Theory of Constraints applied to skill",
    storyHook: "Accelerate learning by limiting options",
    thumbnail: `${STORAGE_BASE}/images/909c474b-063c-47f3-aae1-2ef5c7098a8e.png`,
    tags: ['deliberate-practice', 'skill-building', 'constraint', 'mastery'],
    steps: 4,
    subType: "mindset",
    instructions: [
      "Identify your weakest link: Where do you break down in this skill?",
      "Isolate it: Remove everything else. Practice ONLY that micro-skill.",
      "Add constraint: Make it harder (slower, faster, blindfolded, one-handed).",
      "Reintegrate: Once mastered, bring it back into the full skill. You're now stronger."
    ],
    
    structuredTags: {
      meta_skills: { primary: ["learning_optimization"], secondary: ["focus_attention"] },
      sub_skills: { primary: ["deliberate_practice"], secondary: ["skill_isolation"] },
      soft_skills: ["discipline", "mastery_orientation", "persistence"],
      usage_occasions: ["skill_practice", "training_session", "mastery_building"],
      checkin_tags: { primary: ["plateau"], secondary: ["frustrated"] },
      mastery_category: { primary: "presence", secondary: [] }
    }
  },
  {
    id: "wu-wei-flow",
    title: "Effortless Action Through Wu Wei",
    contentType: "micro-practice",
    category: "presence",
    duration: 2,
    protocol_type: "mindset",
    difficulty: "intermediate",
    creator: "Taoist philosophy",
    origin: "Ancient Chinese philosophy of effortless action",
    storyHook: "Move with the flow, not against it—achieve more by forcing less",
    thumbnail: `${STORAGE_BASE}/images/76cee14b-c6a7-4d75-8162-8a5ba6f74a9d.png`,
    tags: ['flow', 'taoism', 'effortless', 'alignment'],
    steps: 4,
    subType: "mindset",
    instructions: [
      "Notice resistance: Where are you forcing? What feels hard?",
      "Ask the Tao: \"What wants to happen naturally here?\"",
      "Align with it: Stop pushing upstream. Move with the current.",
      "Let action arise: You're not forcing—you're following. That's Wu Wei."
    ],
    
    structuredTags: {
      meta_skills: { primary: ["intuition_development"], secondary: ["self_awareness"] },
      sub_skills: { primary: ["flow_state"], secondary: ["effortless_action"] },
      soft_skills: ["intuition", "flow", "receptivity"],
      usage_occasions: ["resistance_moment", "forcing_situation", "flow_seeking"],
      checkin_tags: { primary: ["forcing", "struggling"], secondary: ["frustrated"] },
      mastery_category: { primary: "presence", secondary: [] }
    }
  },
  {
    id: "mushin-flow",
    title: "Flow Through Mushin (No-Mind)",
    contentType: "micro-practice",
    category: "presence",
    duration: 2,
    protocol_type: "mindset",
    difficulty: "advanced",
    creator: "Zen martial arts",
    origin: "Japanese swordsmanship philosophy",
    storyHook: "Enter the state of no-mind where action flows without thought",
    thumbnail: `${STORAGE_BASE}/images/cc7c715b-a0d1-4464-b0e1-d338c14452a0.png`,
    tags: ['flow', 'zen', 'mastery', 'intuition'],
    steps: 4,
    subType: "mindset",
    instructions: [
      "Notice the thinking: Are you analyzing, judging, hesitating?",
      "Drop the mind: Stop naming, planning, controlling. Just do.",
      "Trust the body: Your training is in your muscles. Let them lead.",
      "Enter Mushin: Action without thought. Pure response. That's mastery."
    ],
    
    structuredTags: {
      meta_skills: { primary: ["intuition_development"], secondary: ["focus_attention"] },
      sub_skills: { primary: ["flow_state"], secondary: ["intuitive_action"] },
      soft_skills: ["intuition", "mastery", "presence"],
      usage_occasions: ["performance_state", "flow_seeking", "mastery_practice"],
      checkin_tags: { primary: ["overthinking", "analyzing"], secondary: ["hesitant"] },
      mastery_category: { primary: "presence", secondary: [] }
    }
  },
  {
    id: "jobs-simplicity",
    title: "Clarity Through Simplicity",
    contentType: "micro-practice",
    category: "presence",
    duration: 1.5,
    protocol_type: "mindset",
    difficulty: "beginner",
    creator: "Steve Jobs philosophy",
    origin: "Apple design principles",
    storyHook: "Simplicity is the ultimate sophistication—cut to what matters",
    thumbnail: `${STORAGE_BASE}/images/ae4d66fb-b3ea-4ef5-bfff-f228c447224c.png`,
    tags: ['simplicity', 'clarity', 'essentialism', 'focus'],
    steps: 3,
    subType: "mindset",
    instructions: [
      "Notice complexity: What's overcomplicated right now?",
      "The Jobs question: \"What can I remove to make this simpler?\"",
      "Cut ruthlessly: Remove features, steps, options. Simplicity is clarity."
    ],
    
    structuredTags: {
      meta_skills: { primary: ["priority_setting"], secondary: ["decision_making"] },
      sub_skills: { primary: ["essentialism"], secondary: ["simplification"] },
      soft_skills: ["clarity", "essentialism", "decisiveness"],
      usage_occasions: ["complexity_moment", "decision_fatigue", "simplification"],
      checkin_tags: { primary: ["overwhelmed", "confused"], secondary: ["scattered"] },
      mastery_category: { primary: "presence", secondary: [] }
    }
  },
  {
    id: "stoic-reflection",
    title: "Stoic Evening Reflection",
    contentType: "micro-practice",
    category: "presence",
    duration: 10,
    protocol_type: "mindset",
    difficulty: "beginner",
    creator: "Stoic Philosophy",
    origin: "Marcus Aurelius daily practice",
    storyHook: "The Roman Emperor's practice of reviewing actions and alignment at day's end",
    thumbnail: `${STORAGE_BASE}/images/06444f60-b3bd-4d38-a749-aea185d789e6.png`,
    tags: ['air', 'evening-ritual', 'gentle', 'clarity'],
    steps: 5,
    subType: "mindset",
    instructions: [
      "Review the day: What went well? Where did I act with virtue?",
      "Name mistakes: Where did I act against my values? No judgment—just observe.",
      "What would wisdom do? If I face this again, what's the better response?",
      "Gratitude: Name 3 things you're grateful for today.",
      "Tomorrow's intention: What one thing will I prioritize tomorrow?"
    ],
    
    structuredTags: {
      meta_skills: { primary: ["self_awareness"], secondary: ["growth_mindset"] },
      sub_skills: { primary: ["self_reflection"], secondary: ["value_alignment"] },
      soft_skills: ["wisdom", "self_awareness", "integrity"],
      usage_occasions: ["evening_ritual", "reflection_practice", "day_review"],
      checkin_tags: { primary: ["reflective"], secondary: ["seeking_growth"] },
      mastery_category: { primary: "presence", secondary: [] }
    }
  }
];
