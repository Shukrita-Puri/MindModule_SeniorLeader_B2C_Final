import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useSwipeHandler } from "@/hooks/useSwipeHandler";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  Volume1,
  VolumeX,
  CheckCircle2,
  Repeat,
  Sparkles,
  Brain,
  Zap,
  ChevronDown
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import TopNavigation from "@/components/simulation/TopNavigation";
import PracticeQueueProgress from "@/components/PracticeQueueProgress";
import PracticeRatingModal from "@/components/PracticeRatingModal";
import { toast } from "sonner";
import { getContentById } from "@/data/practicesAndSoundscapes";
import { trackEngagement } from "@/utils/engagementTracking";
import { submitPracticeRating } from "@/utils/relevanceFeedback";
import { supabase } from "@/integrations/supabase/client";
import { useMentalFitnessTracking } from "@/hooks/useMentalFitnessTracking";
import { cn } from "@/lib/utils";

// Soundscape data now comes from practicesAndSoundscapes.ts
const getSoundscapeData = (id: string) => {
  const content = getContentById(id);
  if (!content || content.contentType !== "soundbath") return null;
  
  return {
    id: content.id,
    title: content.title,
    category: content.category,
    duration: content.duration * 60, // Convert minutes to seconds
    origin: content.origin || content.storyHook,
    fullStory: content.fullStory || "",
    creator: content.creator,
    technique: content.technique || "",
    benefits: content.benefits || [],
    completionQuote: content.completionQuote || "",
    audioSrc: content.audioSrc || ""
  };
};

// Legacy soundscape data for backwards compatibility
const soundscapeData: Record<string, any> = {
  "tibetan-bowls": {
    id: "tibetan-bowls",
    title: "Tibetan Bowl Resonance",
    category: "presence",
    duration: 480,
    origin: "Ancient Himalayan Tradition",
    fullStory: "For over 5000 years, Tibetan monks have used singing bowls to achieve profound meditative states. The bowls produce harmonic overtones that synchronize brainwaves and create a sense of timeless awareness. Each bowl is hand-hammered from seven sacred metals, representing the seven celestial bodies known to ancient cultures. The vibrations penetrate deep into the body, releasing tension and creating alignment between mind, body, and spirit.",
    creator: "Curated from Tibetan Buddhist lineages",
    technique: "The bowls are played using a circular motion that creates sustained, layered tones. Allow the sounds to wash over you without analysis—simply rest in the harmonic field.",
    benefits: [
      "Reduces stress and anxiety through harmonic resonance",
      "Enhances meditation depth and duration",
      "Balances the nervous system",
      "Promotes cellular relaxation"
    ],
    completionQuote: "In stillness, all sounds arise and dissolve. You are the space in which they dance."
  },
  "gamma-frequency": {
    id: "gamma-frequency",
    title: "40Hz Gamma Focus",
    category: "power-up",
    duration: 720,
    origin: "MIT Neuroscience Protocol",
    fullStory: "Researchers at MIT's McGovern Institute discovered that 40Hz gamma frequency stimulation enhances cognitive function, memory consolidation, and neural synchronization. This specific frequency has been shown to increase attention span, improve processing speed, and support the brain's natural cleaning mechanisms. Used by knowledge workers, researchers, and students worldwide for peak mental performance.",
    creator: "Based on MIT neuroscience research",
    technique: "The 40Hz tone creates a carrier wave for focused attention. Let your awareness ride this frequency like a laser beam, cutting through mental fog with precision.",
    benefits: [
      "Enhances cognitive processing speed",
      "Improves working memory capacity",
      "Increases sustained attention",
      "Supports brain's natural detoxification"
    ],
    completionQuote: "Clarity is not found—it is revealed when the mind stops searching."
  },
  "navy-seal-calm": {
    id: "navy-seal-calm",
    title: "Pre-Mission Calm",
    category: "pause",
    duration: 300,
    origin: "Navy SEAL Protocol",
    fullStory: "Navy SEALs face life-or-death situations that require absolute composure under extreme pressure. This protocol combines rhythmic tones with binaural beats designed to rapidly shift the nervous system from sympathetic (fight-or-flight) to parasympathetic (rest-and-digest) activation. The result is a state of calm alertness—relaxed but ready. Surgeons, athletes, and diplomats use this same approach before critical moments.",
    creator: "Military performance protocol",
    technique: "Breathe naturally as the soundscape guides your nervous system downward. Notice tension releasing from your jaw, shoulders, and chest. You're becoming simultaneously calmer and more alert.",
    benefits: [
      "Rapidly reduces physiological stress markers",
      "Enhances decision-making under pressure",
      "Maintains alertness while releasing tension",
      "Improves emotional regulation"
    ],
    completionQuote: "True power lies not in force, but in the stillness before action."
  },
  "forest-bathing": {
    id: "forest-bathing",
    title: "Forest Bathing",
    category: "presence",
    duration: 900,
    origin: "Japanese Shinrin-yoku",
    fullStory: "In the 1980s, Japanese researchers discovered that spending time immersed in forest environments significantly reduces stress hormones, lowers blood pressure, and boosts immune function. This practice, called Shinrin-yoku (forest bathing), has become a cornerstone of preventive healthcare in Japan. This soundscape recreates the acoustic signature of old-growth forests—gentle rustling leaves, distant bird calls, and the subtle white noise of wind through trees.",
    creator: "Traditional Japanese practice",
    technique: "Imagine yourself standing in an ancient forest. Feel the cool air on your skin, smell the earth and pine. Let the forest sounds transport you to a place of deep natural belonging.",
    benefits: [
      "Lowers cortisol and stress hormones",
      "Boosts natural killer cell activity (immunity)",
      "Reduces blood pressure and heart rate",
      "Enhances mood and emotional wellbeing"
    ],
    completionQuote: "Nature does not hurry, yet everything is accomplished."
  },
  "athlete-activation": {
    id: "athlete-activation",
    title: "Athletic Activation",
    category: "power-up",
    duration: 360,
    origin: "Olympic Performance Protocol",
    fullStory: "Olympic athletes use pre-competition soundscapes to enter an optimal arousal state—energized but not anxious, focused but not tight. This protocol uses rhythmic beats at 120-140 BPM paired with motivational tones to activate the sympathetic nervous system gradually. Studies show this approach improves reaction time, power output, and competitive mindset. Used by swimmers, sprinters, and combat athletes before major competitions.",
    creator: "Sports psychology protocol",
    technique: "Feel energy building in your body with each beat. Your muscles are waking up, your mind is sharpening. You're becoming a coiled spring—ready to explode into action.",
    benefits: [
      "Optimizes pre-performance arousal levels",
      "Enhances reaction time and explosiveness",
      "Builds competitive confidence",
      "Improves mind-body coordination"
    ],
    completionQuote: "Champions are not made in the arena—they are revealed there."
  },
  "vedic-om": {
    id: "vedic-om",
    title: "Vedic Om Chanting",
    category: "presence",
    duration: 600,
    origin: "Ancient Indian Tradition",
    fullStory: "The sacred syllable 'Om' has been chanted for over 3000 years in Vedic traditions. Modern research shows that chanting Om creates a vibrational frequency that resonates through the body, synchronizing breath, heart rate, and brainwaves. The three sounds (A-U-M) represent the waking, dreaming, and deep sleep states—with the silence after representing pure consciousness. This soundscape features traditional Vedic chanting that creates a sonic field for deep meditation.",
    creator: "Traditional Vedic lineage",
    technique: "Allow the Om vibrations to penetrate your entire being. Feel your body resonating with the ancient sound. You're connecting to thousands of years of unbroken practice.",
    benefits: [
      "Synchronizes breath and heart rhythms",
      "Creates deep meditative absorption",
      "Connects to ancient wisdom lineages",
      "Balances left and right brain hemispheres"
    ],
    completionQuote: "The self is not heard but is the hearer; not seen but is the seer; not known but is the knower."
  },
  "himalayan-monastery": {
    id: "himalayan-monastery",
    title: "Himalayan Mountain Monastery",
    category: "pause",
    duration: 82,
    origin: "Tibetan Buddhist Monasteries",
    fullStory: "High upon a snow-laden summit, where silence reigns supreme and the air itself feels sacred, there stands a monastery carved from volcanic stone—austere, eternal, unyielding. Within its echoing chambers, sound becomes devotion. This soundbath is a study in reverence—a confluence of monastic chant, ethereal chime, and resonant void. It evokes a sanctified stillness, a gravity beyond words, where each vibration carries the weight of prayer. The tonality is ascetic yet sumptuous—a ritual in frequency, composed not for entertainment but for elevation. Every element—from the solemn voices to the mystic timepiece pulse—was sculpted with intention, not assembled from loops. The atmosphere recalls ancient orders and forgotten vows, an auditory architecture of faith and frost.",
    creator: "Mystical monastic atmosphere composition",
    technique: "Enter this space as one enters a temple: slowly, without thought. Allow the chants to unfurl across your awareness, the chimes to mark the passage of invisible hours. The frequencies align with alpha waves, guiding consciousness toward the lucid threshold between thought and stillness. There is no melody to follow, only resonance—a continuous unfolding of tone that invites the listener to dissolve.",
    benefits: [
      "Transcendental Calm — The layered voices and harmonic gongs induce a monastic serenity, emptying the mind of noise",
      "Cognitive Clarity — Alpha-wave entrainment refines perception, expanding awareness into luminous focus",
      "Somatic Resonance — The frequencies move through the body like ritual smoke, loosening the architecture of tension",
      "Temporal Suspension — Time becomes circular, like prayer beads—infinite, patient, absolute"
    ],
    completionQuote: "This is not a song; it is a sanctuary."
  },
  "cathedral-choir-flow": {
    id: "cathedral-choir-flow",
    title: "Cathedral Choir Flow",
    category: "presence",
    duration: 198,
    origin: "Sacred Cathedral Resonance",
    fullStory: "Step into a grand cathedral, where sunlight spills across vaulted ceilings and every stone resonates with history. Within this vast space, sound takes on dimension: a choir of voices rises and falls, interwoven with bells, subtle percussion, and reverberant harmonics. This soundbath captures the interplay of clarity and calm. Each note carries intention, creating a sonic environment that encourages focus, mindfulness, and rejuvenation. Movement and stillness coexist here—the architecture of sound itself becomes a guide for alignment, energy, and presence.",
    creator: "Sacred harmonic composition",
    technique: "Sit or move comfortably. Allow the choir's harmonics to wash over you, expanding your awareness without effort. The sustained tones of the instruments anchor your attention, while gentle rhythmic elements create a natural pulse for meditation, stretching, or mindful flow. This is flow in sound: a space to cultivate focus, clarity, and a calm, centered energy. Let the vibrations guide your breathing and your attention, bringing body and mind into alignment.",
    benefits: [
      "Enhanced Focus — Layered harmonics and rhythmic pulses sharpen attention and support deep concentration",
      "Mindful Presence — Sustained tones create a sense of spatial and mental clarity, ideal for meditation or contemplative work",
      "Energetic Alignment — Resonances move through the body, encouraging balance and subtle energetic flow",
      "Flow Induction — The gentle interplay of voices and instruments fosters a natural state of ease and continuity"
    ],
    completionQuote: "This soundbath is a sanctuary of resonance. It is not performance, but presence. A space where listening cultivates calm, energy, and sustained focus."
  },
  "ina-night-fields": {
    id: "ina-night-fields",
    title: "Ina Night Fields (Tsukiyomi)",
    category: "presence",
    duration: 242,
    origin: "Nagano Countryside, Japan",
    fullStory: "In the quiet heart of Nagano's countryside, where the land folds gently into mist and memory, night hums in perfect rhythm. Through the open window of a farmhouse in Ina—wooden beams breathing the scent of cedar and cool earth—the living orchestra of the fields begins. This soundscape is not composed; it is discovered. The world performs itself here—crickets tracing invisible constellations in the dark, cicadas pulsing like a heartbeat beneath the sky. Every sound is a brushstroke in a landscape of restraint and reverence, painted in tones of dew, soil, and starlight. It is a portrait of solitude, but never loneliness—the still vitality of a night that listens back.",
    creator: "Natural field recording",
    technique: "Sit as though beside that farmhouse window. Do not seek melody or meaning—let the field speak for itself. The crickets' dialogue is subtle yet precise, an organic metronome for the attentive mind. Their rhythm invites a state of soft focus, where thought dissolves into perception. The beauty lies not in the sound itself, but in the space it reveals.",
    benefits: [
      "Lucid Stillness — The ambient field tones foster calm concentration, grounding attention in the present moment",
      "Textural Awareness — Layers of natural resonance awaken sensory detail—wind, timber, wing, breath",
      "Organic Focus — The steady pulse of insect song becomes a meditative anchor for creative or contemplative work",
      "Temporal Drift — Minutes expand into a gentle continuum; productivity becomes peace"
    ],
    completionQuote: "No instruments. No synthesis. Only the night itself—ancient in rhythm, immediate in presence."
  },
  "earth-resonance-power": {
    id: "earth-resonance-power",
    title: "Earth Resonance",
    category: "power-up",
    duration: 145,
    origin: "Ancient Sound Traditions",
    fullStory: "Morning hums awake—the first breath of a living street. Between the rustle of canvas stalls and the pulse of passing footsteps, a single vibration begins to bloom. The didgeridoo exhales, low and molten, stirring the ground beneath your awareness. Its drone is elemental—an ancient frequency of life-force and motion. Around it, singing bowls emerge like light on water—luminous, crystalline, harmonizing the earthbound tone with higher resonance. What begins as a street performance becomes something else: a spontaneous alignment of rhythm, breath, and intention. The marketplace becomes a temple; the listener becomes a participant. This soundbath is an energize and flow practice—a transition from root to crown, from kinetic activation to focused presence.",
    creator: "Street performance meets sacred ritual",
    technique: "Phase I — Energize: Begin upright. Feel your spine like a column of sound. The didgeridoo's breath ignites movement—sway, stretch, or pulse in time with its resonance. Let the vibrations gather in your lower body, awakening dormant strength and vitality. This is the sound of grounding—primal, circular, continuous. As the bowls begin to shimmer through the drone, imagine energy rising—not rushed, but inevitable—a slow ignition of the inner current. Phase II — Flow / Focus: Allow stillness to return. Breathe with the bowls now—light, deliberate, clear. Their tones become a bridge between motion and mind. Here, attention sharpens without effort. Focus is no longer forced—it flows.",
    benefits: [
      "Energizing Resonance — Didgeridoo frequencies awaken the body's core, stimulating breath and circulation",
      "Dynamic Grounding — Low drones anchor physical presence, fostering strength and stability before focus",
      "Cognitive Flow — Singing bowls elevate awareness into a tranquil yet alert state, ideal for creative work",
      "Spatial Clarity — The binaural field enhances immersion, engaging both hemispheres for unified attention"
    ],
    completionQuote: "From earth to sky, from stillness to motion—you are the instrument through which all frequencies flow."
  },
  "earth-resonance-presence": {
    id: "earth-resonance-presence",
    title: "Earth Resonance",
    category: "presence",
    duration: 145,
    origin: "Ancient Sound Traditions",
    fullStory: "Morning hums awake—the first breath of a living street. Between the rustle of canvas stalls and the pulse of passing footsteps, a single vibration begins to bloom. The didgeridoo exhales, low and molten, stirring the ground beneath your awareness. Its drone is elemental—an ancient frequency of life-force and motion. Around it, singing bowls emerge like light on water—luminous, crystalline, harmonizing the earthbound tone with higher resonance. What begins as a street performance becomes something else: a spontaneous alignment of rhythm, breath, and intention. The marketplace becomes a temple; the listener becomes a participant. This soundbath is an energize and flow practice—a transition from root to crown, from kinetic activation to focused presence.",
    creator: "Street performance meets sacred ritual",
    technique: "Phase I — Energize: Begin upright. Feel your spine like a column of sound. The didgeridoo's breath ignites movement—sway, stretch, or pulse in time with its resonance. Let the vibrations gather in your lower body, awakening dormant strength and vitality. This is the sound of grounding—primal, circular, continuous. As the bowls begin to shimmer through the drone, imagine energy rising—not rushed, but inevitable—a slow ignition of the inner current. Phase II — Flow / Focus: Allow stillness to return. Breathe with the bowls now—light, deliberate, clear. Their tones become a bridge between motion and mind. Here, attention sharpens without effort. Focus is no longer forced—it flows.",
    benefits: [
      "Energizing Resonance — Didgeridoo frequencies awaken the body's core, stimulating breath and circulation",
      "Dynamic Grounding — Low drones anchor physical presence, fostering strength and stability before focus",
      "Cognitive Flow — Singing bowls elevate awareness into a tranquil yet alert state, ideal for creative work",
      "Spatial Clarity — The binaural field enhances immersion, engaging both hemispheres for unified attention"
    ],
    completionQuote: "From earth to sky, from stillness to motion—you are the instrument through which all frequencies flow."
  },
  "warrior-drums-power": {
    id: "warrior-drums-power",
    title: "Ancestral Pulse",
    category: "power-up",
    duration: 240,
    origin: "Ancient Warrior Traditions",
    fullStory: "There is a moment before every battle—ancient or modern—when silence is no longer calm, but charged. The air thickens with intent. Muscles remember what they were made for. The heartbeat becomes a weapon. Warrior Drums captures that moment—the breath before impact, the gathering of courage before stepping into the unknown. Built with elemental simplicity, these drums are not performance but invocation: a primal pulse designed to awaken the archetype of the warrior within. Each strike echoes across time—not from the field of medieval conquest, but from the inner arena of the present day: pre-exam, pre-stage, pre-meeting, pre-challenge. Wherever courage is needed, this rhythm becomes your ally. The sound is pure percussion—no melody, no distraction—only movement, weight, and purpose.",
    creator: "Ritual of preparation and power",
    technique: "Stand tall. Breathe deep into the belly. Let the first rhythm set your pulse—slow, grounded, deliberate. With each beat, shed hesitation. The drums are your spine now, your heart's external voice. As the tempo builds, feel the energy rise through your core—focus sharpening, blood alive, mind narrowing to a single, unwavering point. This is your pre-war ritual: Not for destruction, but for precision. Not for rage, but for power under control. When the final strikes fade, you are not exhausted—you are aligned. Centered. Electric. Ready.",
    benefits: [
      "Primal Activation — Deep drum resonance stimulates the body's natural rhythm, awakening strength and alertness",
      "Focus Under Pressure — The repetition induces a trance-like state, enhancing concentration and reaction time",
      "Controlled Aggression — The sound invites power without chaos—intensity tempered by clarity",
      "Embodied Confidence — The drums anchor attention in the body, grounding anxiety into physical readiness"
    ],
    completionQuote: "This is the sound of preparation—of the mind sharpening its blade, of fear transforming into fuel. No armies. No banners. Just you—and the drums."
  },
  "warrior-drums-presence": {
    id: "warrior-drums-presence",
    title: "Ancestral Pulse",
    category: "presence",
    duration: 240,
    origin: "Ancient Warrior Traditions",
    fullStory: "There is a moment before every battle—ancient or modern—when silence is no longer calm, but charged. The air thickens with intent. Muscles remember what they were made for. The heartbeat becomes a weapon. Warrior Drums captures that moment—the breath before impact, the gathering of courage before stepping into the unknown. Built with elemental simplicity, these drums are not performance but invocation: a primal pulse designed to awaken the archetype of the warrior within. Each strike echoes across time—not from the field of medieval conquest, but from the inner arena of the present day: pre-exam, pre-stage, pre-meeting, pre-challenge. Wherever courage is needed, this rhythm becomes your ally. The sound is pure percussion—no melody, no distraction—only movement, weight, and purpose.",
    creator: "Ritual of preparation and power",
    technique: "Stand tall. Breathe deep into the belly. Let the first rhythm set your pulse—slow, grounded, deliberate. With each beat, shed hesitation. The drums are your spine now, your heart's external voice. As the tempo builds, feel the energy rise through your core—focus sharpening, blood alive, mind narrowing to a single, unwavering point. This is your pre-war ritual: Not for destruction, but for precision. Not for rage, but for power under control. When the final strikes fade, you are not exhausted—you are aligned. Centered. Electric. Ready.",
    benefits: [
      "Primal Activation — Deep drum resonance stimulates the body's natural rhythm, awakening strength and alertness",
      "Focus Under Pressure — The repetition induces a trance-like state, enhancing concentration and reaction time",
      "Controlled Aggression — The sound invites power without chaos—intensity tempered by clarity",
      "Embodied Confidence — The drums anchor attention in the body, grounding anxiety into physical readiness"
    ],
    completionQuote: "This is the sound of preparation—of the mind sharpening its blade, of fear transforming into fuel. No armies. No banners. Just you—and the drums."
  }
};

const SoundscapePlayer = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Try to get soundscape from new data structure first, fallback to legacy
  const soundscape = id ? (getSoundscapeData(id) || soundscapeData[id]) : null;
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(70);
  const [isMuted, setIsMuted] = useState(false);
  const [showStory, setShowStory] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [actualDuration, setActualDuration] = useState<number | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Practice Queue State
  const [practiceQueue, setPracticeQueue] = useState<any[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [isInQueue, setIsInQueue] = useState(false);

  const displayDuration = actualDuration || soundscape?.duration || 0;

  useEffect(() => {
    // Check if this is part of a practice queue
    const queue = localStorage.getItem('practiceQueue');
    if (queue) {
      try {
        const parsed = JSON.parse(queue);
        setPracticeQueue(parsed);
        // Find current index
        const index = parsed.findIndex((p: any) => p.id === id);
        if (index !== -1) {
          setCurrentQueueIndex(index);
          setIsInQueue(true);
        }
      } catch (e) {
        console.error('Error parsing practice queue:', e);
      }
    }
  }, [id]);

  const getCategoryPath = () => {
    // Use the soundscape's actual category to determine back path
    if (!soundscape) return '/soundscapes';
    
    const category = soundscape.category;
    if (category === 'pause') return '/recalibrate/pause';
    if (category === 'power-up') return '/recalibrate/power-up';
    if (category === 'presence') return '/recalibrate/presence';
    if (category === 'flow') return '/recalibrate/flow';
    return '/soundscapes';
  };

  // Sync audio state on mount
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
      audioRef.current.muted = isMuted;
    }
  }, []);

  // Update audio volume and mute state
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  if (!soundscape) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Soundscape not found</p>
          <Button onClick={() => navigate("/soundscapes")}>
            Return to Library
          </Button>
        </div>
      </div>
    );
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      // Track engagement when audio starts (only on first play)
      if (!isComplete) {
        const practiceQueue = JSON.parse(localStorage.getItem('practiceQueue') || 'null');
        const isPartOfRitual = practiceQueue && practiceQueue.some((p: any) => p.id === id);
        
        if (isPartOfRitual) {
          trackEngagement('daily_ritual_soundscape');
          
          // Update daily ritual history
          const today = new Date().toISOString().split('T')[0];
          const history = JSON.parse(localStorage.getItem('dailyRitualHistory') || '[]');
          
          const todayRecord = history.find((r: any) => r.date === today);
          if (todayRecord) {
            todayRecord.componentsCompleted = Math.min(todayRecord.componentsCompleted + 1, 3);
            todayRecord.timestamps.push(new Date().toISOString());
            
            if (todayRecord.componentsCompleted === 3) {
              todayRecord.completionStatus = 'full';
            } else if (todayRecord.componentsCompleted > 0) {
              todayRecord.completionStatus = 'partial';
            }
            
            localStorage.setItem('dailyRitualHistory', JSON.stringify(history));
          }
        } else if (soundscape?.category === 'pause') {
          trackEngagement('pause_session');
        } else if (soundscape?.category === 'power-up') {
          trackEngagement('renew_session');
        } else if (soundscape?.category === 'presence' || soundscape?.category === 'flow') {
          trackEngagement('flow_session');
        }
      }
      
      audioRef.current.play().catch(err => {
        toast.error("Failed to play audio");
        console.error("Audio play error:", err);
      });
      setIsPlaying(true);
      toast.success(isComplete ? "Replaying soundscape" : "Soundscape started");
      if (isComplete) {
        setIsComplete(false);
      }
    }
  };

  const handleSkip = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(
      0, 
      Math.min(audioRef.current.currentTime + seconds, audioRef.current.duration || displayDuration)
    );
  };

  const handleVolumeChange = (value: number[]) => {
    setVolume(value[0]);
    if (audioRef.current) {
      audioRef.current.volume = value[0] / 100;
    }
    if (value[0] > 0 && isMuted) setIsMuted(false);
  };

  const handleMuteToggle = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    if (audioRef.current) {
      audioRef.current.muted = newMutedState;
    }
  };

  const handleAudioEnded = async () => {
    if (isLooping && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => {
        console.error("Audio loop error:", err);
        setIsPlaying(false);
      });
    } else {
      setIsPlaying(false);
      
      // Save practice session to database
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && soundscape) {
          const practiceQueue = JSON.parse(localStorage.getItem('practiceQueue') || 'null');
          const isPartOfRitual = practiceQueue && practiceQueue.some((p: any) => p.id === id);
          
          const { data, error } = await supabase.from('practice_sessions').insert({
            user_id: user.id,
            content_id: soundscape.id,
            content_type: 'soundbath',
            category: soundscape.category,
            duration_seconds: displayDuration,
            started_at: new Date(Date.now() - displayDuration * 1000).toISOString(),
            completed_at: new Date().toISOString(),
            completed: true,
            part_of_ritual: isPartOfRitual,
            metadata: { title: soundscape.title }
          }).select('id').single();
          
          if (data) {
            setSessionId(data.id);
          }
          
          // Update ritual completion if part of ritual
          if (isPartOfRitual) {
            const today = new Date().toISOString().split('T')[0];
            
            // Step 1: Upsert the specific completion field WITHOUT setting status
            await supabase
              .from('daily_ritual_completions')
              .upsert({
                user_id: user.id,
                ritual_date: today,
                soundscape_completed: true,
                soundscape_completed_at: new Date().toISOString()
                // DON'T set completion_status here
              }, {
                onConflict: 'user_id,ritual_date'
              });
            
            // Step 2: Query FRESH data AFTER the upsert
            const { data: freshRitualData } = await supabase
              .from('daily_ritual_completions')
              .select('*')
              .eq('user_id', user.id)
              .eq('ritual_date', today)
              .single();
            
            // Step 3: Calculate completion using FRESH data
            if (freshRitualData) {
              const completed = [
                freshRitualData.soundscape_completed,
                freshRitualData.guided_practice_completed,
                freshRitualData.micro_exercise_completed
              ].filter(Boolean).length;
              
              const totalRecommended = freshRitualData.recommended_practices_count || 3;
              
              // Step 4: Update status atomically
              const newStatus = completed === totalRecommended && completed > 0 
                ? 'full' 
                : completed > 0 
                  ? 'partial' 
                  : 'skipped';
              
              await supabase
                .from('daily_ritual_completions')
                .update({ completion_status: newStatus })
                .eq('user_id', user.id)
                .eq('ritual_date', today);
              
              console.log('🎯 Soundscape completed:', {
                type: 'soundscape',
                completedCount: completed,
                totalRecommended,
                newStatus,
                timestamp: new Date().toISOString()
              });
            }
          }
        }
      } catch (error) {
        console.error('Failed to save practice session:', error);
      }
      
      // Show rating modal instead of completion screen
      setShowRatingModal(true);
      
      // If in queue, auto-navigate to next after 2 seconds
      if (isInQueue && currentQueueIndex < practiceQueue.length - 1) {
        setTimeout(() => handleQueueComplete(), 2000);
      }
    }
  };

  // Queue Handlers
  const handleQueueSkip = () => {
    if (currentQueueIndex < practiceQueue.length - 1) {
      navigateToNext();
    }
  };

  const handleQueuePause = () => {
    // Clear queue and return home
    localStorage.removeItem('practiceQueue');
    toast.success('Ritual paused');
    navigate('/executive-home');
  };

  const handleQueueComplete = () => {
    // Store completion
    const history = JSON.parse(localStorage.getItem("practiceHistory") || "[]");
    history.push({
      id: soundscape?.id,
      title: soundscape?.title,
      type: "soundbath",
      outcome: soundscape?.category,
      completedAt: new Date().toISOString(),
      duration: Math.floor(displayDuration / 60)
    });
    localStorage.setItem("practiceHistory", JSON.stringify(history));

    // Navigate to next or complete ritual
    if (currentQueueIndex < practiceQueue.length - 1) {
      navigateToNext();
    } else {
      // Ritual complete
      localStorage.removeItem('practiceQueue');
      toast.success('🎉 Ritual complete!');
      navigate('/executive-home');
    }
  };

  const navigateToNext = () => {
    const next = practiceQueue[currentQueueIndex + 1];
    if (next.contentType === 'soundbath') {
      navigate(`/soundscapes/${next.id}`, { state: { category: next.category } });
    } else if (next.contentType === 'guided-practice') {
      navigate(`/guided-practices/${next.id}`, { state: { category: next.category } });
    } else if (next.contentType === 'micro-practice') {
      navigate(`/micro-practice/${next.id}`, { state: { category: next.category } });
    }
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const newTime = Math.floor(e.currentTarget.currentTime);
    setCurrentTime(newTime);
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const duration = Math.floor(e.currentTarget.duration);
    setActualDuration(duration);
  };

  const handleAudioError = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    toast.error("Failed to load audio file");
    console.error("Audio error:", e);
    setIsPlaying(false);
  };

  const progress = displayDuration > 0 ? (currentTime / displayDuration) * 100 : 0;

  const handleRatingSubmit = async (rating: number, feedback?: string) => {
    if (soundscape) {
      await submitPracticeRating(sessionId, soundscape.id, 'soundbath', rating, feedback);
      toast.success("Thank you for your feedback!");
    }
    setShowRatingModal(false);
    setIsComplete(true);
  };

  const handleRatingSkip = () => {
    setShowRatingModal(false);
    setIsComplete(true);
  };

  if (showRatingModal && soundscape) {
    return (
      <PracticeRatingModal
        contentId={soundscape.id}
        contentType="soundbath"
        contentTitle={soundscape.title}
        category={soundscape.category}
        sessionId={sessionId}
        onSubmit={handleRatingSubmit}
        onSkip={handleRatingSkip}
      />
    );
  }

  if (isComplete) {
    return (
      <>
        <TopNavigation backPath={getCategoryPath()} />
        <div className="min-h-screen bg-gradient-to-b from-background via-mocha/5 to-background flex flex-col items-center justify-center px-4 md:px-6 pt-20">
        <div className="max-w-2xl text-center space-y-4 md:space-y-6">
          <CheckCircle2 className="h-16 w-16 md:h-20 md:w-20 text-gold mx-auto" />
          <h1 className="text-2xl md:text-4xl font-serif bg-gradient-to-r from-gold via-gold-light to-gold bg-clip-text text-transparent">
            Journey Complete
          </h1>
          
          <div className="bg-card/50 backdrop-blur-sm rounded-xl p-4 md:p-8 border border-gold/20">
            <p className="text-base md:text-xl italic text-muted-foreground mb-4 md:mb-6">
              "{soundscape.completionQuote}"
            </p>
            
            <div className="space-y-2 md:space-y-4 text-xs md:text-sm text-muted-foreground">
              <p>Session: {soundscape.title}</p>
              <p>Duration: {formatTime(displayDuration)}</p>
            </div>
          </div>

          <div className="flex gap-3 md:gap-4 justify-center flex-wrap">
            <Button onClick={() => {
              setIsComplete(false);
              setCurrentTime(0);
              setIsPlaying(true);
            }}>
              Practice Again
            </Button>
            <Button variant="outline" onClick={() => navigate("/soundscapes")}>
              Explore More
            </Button>
            <Button variant="outline" onClick={() => navigate("/executive-home")}>
              Return Home
            </Button>
          </div>
        </div>
      </div>
      </>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Full-screen background */}
      <div className="fixed inset-0 -z-10">
        <img
          src={getContentById(id!)?.thumbnail}
          alt={soundscape.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-orange-900/20 to-black/60" />
      </div>

      {/* Transparent navigation */}
      <TopNavigation 
        backPath={getCategoryPath()} 
        transparent 
      />
      
      {isInQueue && (
        <PracticeQueueProgress
          currentIndex={currentQueueIndex}
          totalCount={practiceQueue.length}
          queue={practiceQueue}
          onSkip={handleQueueSkip}
          onPause={handleQueuePause}
          onComplete={handleQueueComplete}
        />
      )}

      {/* Content overlay */}
      <div className="relative flex flex-col items-center justify-center min-h-screen px-4 pt-24 pb-8">
        <div className="w-full max-w-2xl space-y-8 flex flex-col items-center">
          {/* Title Section */}
          <div className="text-center space-y-3">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              {soundscape.title}
            </h1>
            {soundscape.origin && (
              <p className="text-sm md:text-base text-white/80 font-light tracking-wide max-w-xl mx-auto">
                {soundscape.origin}
              </p>
            )}
          </div>

          {/* Large Play Button */}
          <div className="flex flex-col items-center gap-4">
            <Button
              onClick={handlePlayPause}
              className={`rounded-full w-24 h-24 md:w-32 md:h-32 bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 shadow-[0_0_40px_rgba(249,115,22,0.5)] hover:shadow-[0_0_60px_rgba(249,115,22,0.7)] hover:scale-105 transition-all duration-300 ${
                isPlaying ? 'animate-pulse' : ''
              }`}
            >
              {isPlaying ? (
                <Pause className="w-10 h-10 md:w-12 md:h-12 text-white" />
              ) : (
                <Play className="w-10 h-10 md:w-12 md:h-12 ml-1 text-white" />
              )}
            </Button>
            {!isPlaying && (
              <p className="text-white/70 text-sm md:text-base font-light tracking-wide animate-fade-in">
                Tap to begin
              </p>
            )}
          </div>

          {/* Transport Controls */}
          <div className="flex items-center justify-center gap-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleSkip(-15)}
              disabled={currentTime === 0}
              className="text-white hover:text-orange-400 hover:bg-white/10 backdrop-blur-sm transition-colors"
            >
              <SkipBack className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleSkip(15)}
              disabled={currentTime >= displayDuration}
              className="text-white hover:text-orange-400 hover:bg-white/10 backdrop-blur-sm transition-colors"
            >
              <SkipForward className="w-5 h-5" />
            </Button>
          </div>

          {/* Progress Bar */}
          <div className="w-full space-y-3">
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/20 backdrop-blur-sm">
              <div
                className="h-full transition-all duration-300 ease-out rounded-full bg-gradient-to-r from-orange-400 to-orange-600"
                style={{ width: `${progress}%` }}
              />
              <div
                className="absolute top-0 h-full w-20 blur-xl opacity-50 transition-all duration-300 bg-orange-500/30"
                style={{ left: `${Math.max(0, progress - 10)}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-sm text-white/90">
              <span className="font-mono">{formatTime(currentTime)}</span>
              <span className="px-3 py-1 rounded-full bg-black/40 backdrop-blur-md text-white text-xs font-medium">
                {soundscape.duration} min session
              </span>
              <span className="font-mono">{formatTime(displayDuration)}</span>
            </div>
          </div>

          {/* Volume Controls */}
          <div className="flex items-center gap-4 w-full max-w-md mx-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMuteToggle}
              className="text-white hover:text-orange-400 hover:bg-white/10"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-5 h-5" />
              ) : volume < 50 ? (
                <Volume1 className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </Button>
            <div className="flex-1 relative">
              <Slider
                value={[isMuted ? 0 : volume]}
                onValueChange={handleVolumeChange}
                max={100}
                step={1}
                className="[&_[role=slider]]:bg-orange-500 [&_[role=slider]]:border-white"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsLooping(!isLooping)}
              className={cn(
                "text-white hover:bg-white/10",
                isLooping && "bg-orange-500/30 text-orange-400"
              )}
            >
              <Repeat className="w-5 h-5" />
            </Button>
          </div>

          {/* Origin Story Collapsible */}
          {soundscape.fullStory && (
            <Collapsible open={showStory} onOpenChange={setShowStory} className="w-full">
              <div className="space-y-4">
                <CollapsibleTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20 hover:border-orange-400/50 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-orange-400" />
                      Origin Story
                    </span>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 transition-transform duration-200",
                        showStory && "rotate-180"
                      )}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-6">
                    {/* Full Story */}
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold flex items-center gap-2 text-orange-400">
                        <Sparkles className="w-5 h-5" />
                        The Story
                      </h3>
                      <p className="text-sm text-white/80 leading-relaxed">
                        {soundscape.fullStory}
                      </p>
                    </div>

                    {/* Technique */}
                    {soundscape.technique && (
                      <div className="space-y-3">
                        <h3 className="text-lg font-semibold flex items-center gap-2 text-orange-400">
                          <Brain className="w-5 h-5" />
                          How to Practice
                        </h3>
                        <p className="text-sm text-white/80 leading-relaxed">
                          {soundscape.technique}
                        </p>
                      </div>
                    )}

                    {/* Benefits */}
                    {soundscape.benefits && soundscape.benefits.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-lg font-semibold flex items-center gap-2 text-orange-400">
                          <Zap className="w-5 h-5" />
                          Benefits
                        </h3>
                        <ul className="space-y-2">
                          {soundscape.benefits.map((benefit, index) => (
                            <li key={index} className="flex items-start gap-2 text-sm text-white/80">
                              <span className="text-orange-400 mt-1">•</span>
                              <span>{benefit}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Completion Quote */}
                    {soundscape.completionQuote && (
                      <div className="pt-4 border-t border-white/10">
                        <p className="text-sm italic text-white/70 text-center leading-relaxed">
                          "{soundscape.completionQuote}"
                        </p>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}
        </div>
      </div>

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={
          soundscape?.audioSrc ||
          (id === 'earth-resonance-power' || id === 'earth-resonance-presence' 
            ? '/soundscapes/earth-resonance.mp3'
            : id === 'warrior-drums-power' || id === 'warrior-drums-presence'
            ? '/soundscapes/warrior-drums.mp3'
            : `/soundscapes/${id === 'tibetan-bowls' || id === 'cathedral-choir-flow' || id === 'ina-night-fields' ? `${id}.mp3` : `${id}.wav`}`)
        }
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleAudioEnded}
        onError={handleAudioError}
        preload="metadata"
      />
    </div>
  );
};

export default SoundscapePlayer;
