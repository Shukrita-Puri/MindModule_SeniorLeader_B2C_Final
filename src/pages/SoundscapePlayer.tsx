import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { GradientProgress } from "@/components/ui/gradient-progress";
import { GoldCard } from "@/components/ui/gold-card";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX,
  BookOpen,
  CheckCircle2,
  Repeat
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import TopNavigation from "@/components/simulation/TopNavigation";
import { toast } from "sonner";

interface SoundscapeData {
  id: string;
  title: string;
  category: string;
  duration: number;
  origin: string;
  fullStory: string;
  creator: string;
  technique: string;
  benefits: string[];
  completionQuote: string;
}

const soundscapeData: Record<string, SoundscapeData> = {
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
  }
};

const SoundscapePlayer = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(70);
  const [isMuted, setIsMuted] = useState(false);
  const [isStoryOpen, setIsStoryOpen] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [actualDuration, setActualDuration] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const soundscape = id ? soundscapeData[id] : null;
  const displayDuration = actualDuration || soundscape?.duration || 0;

  const getCategoryPath = () => {
    const locationState = location.state as { category?: string } | null;
    const category = locationState?.category;
    
    if (category === 'pause') return '/recalibrate/pause';
    if (category === 'power-up') return '/recalibrate/power-up';
    if (category === 'presence') return '/recalibrate/presence';
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

  const handleAudioEnded = () => {
    if (isLooping && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => {
        console.error("Audio loop error:", err);
        setIsPlaying(false);
      });
    } else {
      setIsPlaying(false);
      setIsComplete(true);
    }
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const newTime = Math.floor(e.currentTarget.currentTime);
    setCurrentTime(newTime);
    console.log("Time update:", newTime, "Duration:", displayDuration, "Progress:", progress);
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const duration = Math.floor(e.currentTarget.duration);
    setActualDuration(duration);
    console.log("Audio loaded, duration:", duration);
  };

  const handleAudioError = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    toast.error("Failed to load audio file");
    console.error("Audio error:", e);
    setIsPlaying(false);
  };

  const progress = displayDuration > 0 ? (currentTime / displayDuration) * 100 : 0;

  if (isComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-mocha/5 to-background flex flex-col items-center justify-center px-6">
        <div className="max-w-2xl text-center space-y-6">
          <CheckCircle2 className="h-20 w-20 text-gold mx-auto" />
          <h1 className="text-4xl md:text-5xl font-serif bg-gradient-to-r from-gold via-gold-light to-gold bg-clip-text text-transparent">
            Journey Complete
          </h1>
          
          <div className="bg-card/50 backdrop-blur-sm rounded-xl p-8 border border-gold/20">
            <p className="text-xl italic text-muted-foreground mb-6">
              "{soundscape.completionQuote}"
            </p>
            
            <div className="space-y-4 text-sm text-muted-foreground">
              <p>Session: {soundscape.title}</p>
              <p>Duration: {formatTime(displayDuration)}</p>
            </div>
          </div>

          <div className="flex gap-4 justify-center flex-wrap">
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
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-mocha/5 to-background flex flex-col">
      <TopNavigation backPath={getCategoryPath()} />

      {/* Main Player Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12 pt-20">
        {/* Title */}
        <div className="text-center mb-8 max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-serif bg-gradient-to-r from-gold via-gold-light to-gold bg-clip-text text-transparent mb-2">
            {soundscape.title}
          </h1>
          <p className="text-muted-foreground">{soundscape.origin}</p>
        </div>

        <GoldCard variant="glowing" className="w-full max-w-2xl p-6 md:p-8 mb-8">
          {/* Visual Element */}
          <div className="mb-8">
            <div className="relative w-48 h-48 md:w-64 md:h-64 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-br from-gold/20 via-primary/20 to-accent/20 rounded-full blur-3xl animate-pulse" />
              <div className="relative">
                <WaveformVisualizer 
                  isActive={isPlaying} 
                  color="primary" 
                  className="scale-150"
                />
              </div>
            </div>
          </div>

          {/* Timer and Progress */}
          <div className="w-full space-y-3 mb-8">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(displayDuration)}</span>
            </div>
            <GradientProgress value={progress} className="h-2 md:h-2.5" />
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-6 mb-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleSkip(-15)}
              className="h-12 w-12 rounded-full"
            >
              <SkipBack className="h-5 w-5" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePlayPause}
              className="h-16 w-16 rounded-full bg-primary/10 hover:bg-primary/20"
            >
              {isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6 ml-0.5" />
              )}
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleSkip(15)}
              className="h-12 w-12 rounded-full"
            >
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>

          {/* Volume Control */}
          <div className="w-full max-w-sm mx-auto flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleMuteToggle}
              className="h-10 w-10 rounded-full shrink-0"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            <Slider
              value={[isMuted ? 0 : volume]}
              onValueChange={handleVolumeChange}
              max={100}
              step={1}
              className="flex-1"
            />
            <Button
              variant={isLooping ? "default" : "ghost"}
              size="icon"
              onClick={() => setIsLooping(!isLooping)}
              title={isLooping ? "Loop enabled" : "Enable loop"}
              className={isLooping ? "bg-gold/20 text-gold hover:bg-gold/30 h-10 w-10 rounded-full shrink-0" : "h-10 w-10 rounded-full shrink-0"}
            >
              <Repeat className="h-4 w-4" />
            </Button>
          </div>
        </GoldCard>

        {/* Hidden Audio Element */}
        <audio
          ref={audioRef}
          src={`/soundscapes/${id === 'tibetan-bowls' || id === 'cathedral-choir-flow' ? `${id}.mp3` : `${id}.wav`}`}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleAudioEnded}
          onError={handleAudioError}
          preload="metadata"
        />

        {/* Storytelling Panel */}
        <div className="w-full max-w-2xl">
          <Collapsible open={isStoryOpen} onOpenChange={setIsStoryOpen}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full rounded-full h-11 text-sm md:text-base font-medium border-gold/30 hover:border-gold/60 hover:bg-gold/10 hover:scale-[1.02] transition-all duration-300 ease-out shadow-sm hover:shadow-md"
              >
                {isStoryOpen ? "Hide" : "Show"} Origin Story
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <GoldCard variant="subtle" className="p-6 space-y-4">
                <div>
                  <h3 className="text-gold font-semibold mb-2">Origin & History</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {soundscape.fullStory}
                  </p>
                </div>
                
                <div>
                  <h3 className="text-gold font-semibold mb-2">How to Practice</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {soundscape.technique}
                  </p>
                </div>
                
                <div>
                  <h3 className="text-gold font-semibold mb-2">Benefits</h3>
                  <ul className="space-y-2">
                    {soundscape.benefits.map((benefit, index) => (
                      <li key={index} className="text-muted-foreground text-sm flex items-start gap-2">
                        <span className="text-gold mt-1">•</span>
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                <p className="text-xs text-muted-foreground italic pt-4 border-t border-border">
                  {soundscape.creator}
                </p>
              </GoldCard>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
  );
};

export default SoundscapePlayer;
