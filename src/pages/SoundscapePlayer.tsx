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
import { Card, CardContent } from "@/components/ui/card";
import TopNavigation from "@/components/simulation/TopNavigation";
import PracticeQueueProgress from "@/components/PracticeQueueProgress";
import PracticeRatingModal from "@/components/PracticeRatingModal";
import { toast } from "sonner";
import { getContentById } from "@/data/practicesAndSoundscapes";
import { trackEngagement } from "@/utils/engagementTracking";
import { submitPracticeRating, markPlanCompleteForFeedback, setPlanFeedbackFlag } from "@/utils/relevanceFeedback";
import { updateRitualCompletion } from "@/utils/dailyRituals";
import { trackSanctuaryEvent } from "@/utils/sanctuaryEventTracking";
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
    introSummary: content.introSummary || "",
    fullStory: content.fullStory || "",
    creator: content.creator,
    technique: content.technique || "",
    benefits: content.benefits || [],
    completionQuote: content.completionQuote || "",
    audioSrc: content.audioSrc || "",
    thumbnail: content.thumbnail
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
    technique: "The bowls are played using a circular motion that creates sustained, layered tones. Allow the sounds to wash over you without analysis–simply rest in the harmonic field.",
    benefits: [
      "Reduces stress and anxiety through harmonic resonance",
      "Enhances meditation depth and duration",
      "Balances the nervous system",
      "Promotes cellular relaxation"
    ],
    completionQuote: "In stillness, all sounds arise and dissolve. You are the space in which they dance."
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
  const [hasStarted, setHasStarted] = useState(false);
  // actualDurationMinutes removed – now using formatTime(displayDuration) directly
  const audioRef = useRef<HTMLAudioElement>(null);

  // Practice Queue State
  const [practiceQueue, setPracticeQueue] = useState<any[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [isInQueue, setIsInQueue] = useState(false);

  const displayDuration = actualDuration || soundscape?.duration || 0;

  // Swipe handler for queue navigation
  useSwipeHandler({
    onSwipeLeft: () => {
      if (isInQueue && currentQueueIndex < practiceQueue.length - 1) {
        navigateToNext();
      }
    },
    onSwipeRight: () => {
      if (isInQueue && currentQueueIndex > 0) {
        const prev = practiceQueue[currentQueueIndex - 1];
        if (prev.contentType === 'soundbath') {
          navigate(`/soundscapes/${prev.id}`, { state: { category: prev.category } });
        }
      }
    }
  });

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

  // Check if navigated from ritual
  const fromRitual = location.state?.fromRitual || false;
  const fromIntervention = location.state?.fromIntervention || false;

  const getCategoryPath = () => {
    // If from daily ritual or JIT intervention, return to executive home
    if (fromRitual || fromIntervention) return '/executive-home';
    
    // Use the soundscape's actual category to determine back path
    if (!soundscape) return '/recalibrate';
    
    const category = soundscape.category;
    if (category === 'pause') return '/recalibrate/pause';
    if (category === 'power-up') return '/recalibrate/power-up';
    if (category === 'presence') return '/recalibrate/presence';
    if (category === 'flow') return '/recalibrate/presence';
    return '/recalibrate';
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
          <Button onClick={() => navigate("/recalibrate")}>
            Return to Recalibrate
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

    if (!hasStarted) {
      setHasStarted(true);
    }

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
    setIsPlaying(false);
    
    if (isLooping) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        await audioRef.current.play();
        setIsPlaying(true);
      }
      return;
    }

    // Save practice session and track for insights
    try {
      if (soundscape) {
        // Check if this practice is in today's queue (source of truth for ritual membership)
        const currentQueue = JSON.parse(localStorage.getItem('practiceQueue') || '[]');
        const isInCurrentQueue = Array.isArray(currentQueue) && currentQueue.some((p: any) => p.id === id);
        const shouldTrackRitual = isInQueue || isInCurrentQueue;

        // Single consolidated tracking call (writes to both sanctuary_events + practice_sessions)
        const result = await trackSanctuaryEvent({
          eventType: 'session_complete',
          contentId: soundscape.id,
          contentType: 'soundbath',
          category: soundscape.category as 'pause' | 'power-up' | 'presence',
          tags: [],
          duration: displayDuration,
          timestamp: new Date().toISOString(),
          contextData: {
            timeOfDay: new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening',
            dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' })
          },
          partOfRitual: shouldTrackRitual,
          metadata: { title: soundscape.title }
        });

        if (result.data?.practiceSessionId) {
          setSessionId(result.data.practiceSessionId);
        }

        // Update ritual completion if part of recommended plan or queue
        if (shouldTrackRitual) {
          console.log('[SoundscapePlayer] Calling updateRitualCompletion:', { id, queueLength: practiceQueue?.length });
          await updateRitualCompletion('soundscape', id, practiceQueue);
          console.log('[SoundscapePlayer] updateRitualCompletion complete');
        }
      }
    } catch (error) {
      console.error('Failed to save practice session:', error);
    }
    
    // Skip individual rating modal when in a plan queue — plan-level feedback fires at the end
    if (isInQueue) {
      handleQueueComplete();
    } else {
      setShowRatingModal(true);
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
    // Navigate to next or complete ritual
    if (currentQueueIndex < practiceQueue.length - 1) {
      navigateToNext();
    } else {
      // Ritual complete - check for JIT intervention data for coach navigation
      localStorage.removeItem('practiceQueue');
      const jitData = localStorage.getItem('jitInterventionData');
      if (jitData) {
        try {
          const { coachPrompt, flowType, eventTitle } = JSON.parse(jitData);
          localStorage.removeItem('jitInterventionData');
          toast.success('Practices complete! Opening Coach...');
          navigate('/coach', {
            state: {
              flowType,
              initialPrompt: coachPrompt,
              fromIntervention: true,
              eventTitle,
              entryContext: { entryPoint: 'practice_complete', lastAction: 'completed soundscape practice', triggeredBy: null }
            }
          });
          return;
        } catch (e) {
          console.error('Error parsing JIT data:', e);
        }
      }
      const ritualMode = localStorage.getItem('ritualMode');
      setPlanFeedbackFlag((ritualMode === 'jit' ? 'jit' : 'tod'));
      localStorage.removeItem('ritualMode');
      toast.success('🎉 Plan complete!');
      navigate('/executive-home');
    }
  };

  const navigateToNext = () => {
    const next = practiceQueue[currentQueueIndex + 1];
    if (!next) return;
    
    localStorage.setItem('queueIndex', String(currentQueueIndex + 1));
    
    if (next.contentType === 'soundbath') {
      navigate(`/soundscapes/${next.id}`, { state: { category: next.category, fromRitual: true } });
    } else if (next.contentType === 'guided-practice') {
      navigate(`/guided-practices/${next.id}`, { state: { category: next.category, fromRitual: true } });
    } else if (next.contentType === 'micro-practice') {
      navigate(`/micro-practice/${next.id}/cards`, { state: { category: next.category, fromRitual: true } });
    } else if (next.contentType === 'coach') {
      // Handle Coach cards - navigate to coach page with context
      navigate('/coach', { 
        state: { 
          flowType: next.id === 'coach-prepare' ? 'prepare' : 'integrate',
          initialPrompt: next.id === 'coach-prepare' 
            ? "I have an important moment coming up. Help me mentally prepare and visualize success."
            : "Let's close out today. First, take a deep breath and let your shoulders drop. Now, what's one thing you did right today? Share your small win.",
          fromRitual: true 
        } 
      });
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
    
    // Check for coach continuity - practice was launched from coach
    const fromCoach = location.state?.fromCoach;
    const coachSessionId = location.state?.coachSessionId || sessionStorage.getItem('returnCoachSessionId');
    
    if (fromCoach && coachSessionId) {
      // Clear stored coach return data
      sessionStorage.removeItem('returnToCoach');
      sessionStorage.removeItem('returnCoachSessionId');
      
      toast.success('Practice complete! Returning to Coach...');
      navigate('/coach', {
        state: {
          resumeSession: true,
          previousSessionId: coachSessionId
        }
      });
      return;
    }
    
    // If in queue and not last, navigate to next
    if (isInQueue && currentQueueIndex < practiceQueue.length - 1) {
      navigateToNext();
      return;
    }
    
    // If in queue and last item, complete ritual
    if (isInQueue) {
      markPlanCompleteForFeedback();
      // Check for JIT intervention data for coach navigation
      const jitData = localStorage.getItem('jitInterventionData');
      if (jitData) {
        try {
          const { coachPrompt, flowType, eventTitle } = JSON.parse(jitData);
          localStorage.removeItem('jitInterventionData');
          toast.success('Practices complete! Opening Coach...');
          navigate('/coach', {
            state: {
              flowType,
              initialPrompt: coachPrompt,
              fromIntervention: true,
              eventTitle
            }
          });
          return;
        } catch (e) {
          console.error('Error parsing JIT data:', e);
        }
      }
      toast.success('🎉 Plan complete!');
      navigate('/executive-home');
      return;
    }
    
    // Standalone practice - check for JIT data
    const jitData = localStorage.getItem('jitInterventionData');
    if (jitData) {
      try {
        const { coachPrompt, flowType, eventTitle } = JSON.parse(jitData);
        localStorage.removeItem('jitInterventionData');
        toast.success('Practice complete! Opening Coach...');
        navigate('/coach', {
          state: {
            flowType,
            initialPrompt: coachPrompt,
            fromIntervention: true,
            eventTitle
          }
        });
        return;
      } catch (e) {
        console.error('Error parsing JIT data:', e);
      }
    }
    navigate(getCategoryPath());
  };

  const handleRatingSkip = () => {
    setShowRatingModal(false);
    
    // Check for coach continuity
    const fromCoach = location.state?.fromCoach;
    const coachSessionId = location.state?.coachSessionId || sessionStorage.getItem('returnCoachSessionId');
    
    if (fromCoach && coachSessionId) {
      sessionStorage.removeItem('returnToCoach');
      sessionStorage.removeItem('returnCoachSessionId');
      
      navigate('/coach', {
        state: {
          resumeSession: true,
          previousSessionId: coachSessionId
        }
      });
      return;
    }
    
    // If in queue and not last, navigate to next
    if (isInQueue && currentQueueIndex < practiceQueue.length - 1) {
      navigateToNext();
      return;
    }
    
    // If in queue and last item, complete ritual
    if (isInQueue) {
      markPlanCompleteForFeedback();
      // Check for JIT intervention data for coach navigation
      const jitData = localStorage.getItem('jitInterventionData');
      if (jitData) {
        try {
          const { coachPrompt, flowType, eventTitle } = JSON.parse(jitData);
          localStorage.removeItem('jitInterventionData');
          toast.success('Practices complete! Opening Coach...');
          navigate('/coach', {
            state: {
              flowType,
              initialPrompt: coachPrompt,
              fromIntervention: true,
              eventTitle
            }
          });
          return;
        } catch (e) {
          console.error('Error parsing JIT data:', e);
        }
      }
      toast.success('🎉 Plan complete!');
      navigate('/executive-home');
      return;
    }
    
    // Standalone practice - check for JIT data
    const jitData = localStorage.getItem('jitInterventionData');
    if (jitData) {
      try {
        const { coachPrompt, flowType, eventTitle } = JSON.parse(jitData);
        localStorage.removeItem('jitInterventionData');
        toast.success('Practice complete! Opening Coach...');
        navigate('/coach', {
          state: {
            flowType,
            initialPrompt: coachPrompt,
            fromIntervention: true,
            eventTitle
          }
        });
        return;
      } catch (e) {
        console.error('Error parsing JIT data:', e);
      }
    }
    navigate(getCategoryPath());
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

  // Completion screen removed – post-practice navigates directly to category page

  return (
    <div className="relative min-h-screen overflow-hidden animate-page-enter">
      {/* Full-screen background with luxury filter */}
      <div className="fixed inset-0 -z-10">
        <img
          src={soundscape.thumbnail || getContentById(id!)?.thumbnail}
          alt={soundscape.title}
          className="w-full h-full object-cover"
          style={{ filter: (soundscape.category === 'presence' || soundscape.category === 'flow') ? 'saturate(0.6) sepia(15%) hue-rotate(85deg) brightness(0.9) contrast(1.1)' : 'brightness(0.85) contrast(1.1) saturate(1.2)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-taupe-rich/30 to-black/50" />
      </div>

      {/* Light navigation */}
      <TopNavigation 
        backPath={getCategoryPath()}
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

      {!hasStarted ? (
        /* Initial State - Center everything */
        <div className="relative flex flex-col items-center justify-center min-h-screen px-6">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-5xl font-headline text-white mb-4 leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
              {soundscape.title}
            </h1>
            <p className="text-white/80 text-sm md:text-base font-body leading-relaxed max-w-md mx-auto drop-shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
              {soundscape.origin}
            </p>
          </div>

          {/* Large play button */}
          <Button
            onClick={handlePlayPause}
            className={cn(
              "w-24 h-24 md:w-32 md:h-32 rounded-full mb-6",
              "bg-gradient-to-br from-saffron via-gold to-gold",
              "hover:scale-110 active:scale-95 transition-all duration-500 ease-out",
              "shadow-[0_0_40px_rgba(212,175,55,0.6)]",
              "hover:shadow-[0_0_80px_rgba(212,175,55,0.9)]",
              "animate-[pulse_3s_ease-in-out_infinite]"
            )}
          >
            <Play className="w-10 h-10 md:w-12 md:h-12 text-white ml-1 transition-transform duration-300" />
          </Button>

          <p className="text-white/80 text-sm md:text-base font-hint tracking-wide mb-8">
            Tap to begin
          </p>

          {/* Pre-Practice Instructions Collapsible */}
          {(soundscape.technique || (soundscape.benefits && soundscape.benefits.length > 0)) && (
            <div className="w-full max-w-md">
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full bg-gradient-to-r from-taupe/20 to-gold/10 backdrop-blur-md border border-gold/30 text-white hover:from-taupe/30 hover:to-gold/20 hover:border-gold/50"
                  >
                    <span className="flex items-center gap-2 text-xs font-hint">
                      Technique & Instructions
                      <ChevronDown className="w-3 h-3 transition-transform [&[data-state=open]]:rotate-180" />
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="mt-2 rounded-3xl p-6 bg-white/15 backdrop-blur-md border border-white/40 space-y-3 max-h-[40vh] overflow-y-auto">
                      {soundscape.technique && (
                        <div>
                          <h3 className="text-xs uppercase tracking-wide text-white/50 font-body font-semibold mb-1">Technique</h3>
                          <p className="text-white/80 text-xs leading-relaxed font-body">{soundscape.technique}</p>
                        </div>
                      )}
                      {soundscape.benefits && soundscape.benefits.length > 0 && (
                        <div>
                          <h3 className="text-xs uppercase tracking-wide text-white/50 font-body font-semibold mb-1">Benefits</h3>
                          <ul className="space-y-1">
                            {soundscape.benefits.map((benefit: string, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-white/80 text-xs font-body">
                                <span className="text-white/50 mt-0.5">•</span>
                                <span>{benefit}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>
      ) : (
        /* Playing State - Title at top, controls at bottom */
        <>
          <div className="relative z-20 pt-24 px-4 text-center">
            <h1 className="text-xl md:text-2xl font-headline text-white mb-2 leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
              {soundscape.title}
            </h1>
            <p className="text-white/80 text-xs md:text-sm font-body leading-relaxed drop-shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
              {soundscape.origin}
            </p>
          </div>

          {/* Bottom control bar */}
          <div className="fixed bottom-0 left-0 right-0 bg-white/15 backdrop-blur-md border-t border-white/40 rounded-t-2xl px-4 py-3 pb-safe">
            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex items-center gap-3">
                <span className="text-xs text-white/90 font-hint min-w-[40px]">
                  {formatTime(currentTime)}
                </span>
                
                <div className="flex-1 relative">
                  <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-gold via-saffron to-gold transition-all duration-500 ease-out relative overflow-hidden"
                      style={{ width: `${progress}%` }}
                    >
                      {isPlaying && (
                        <div 
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"
                          style={{ backgroundSize: '200% 100%' }}
                        />
                      )}
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={displayDuration}
                    value={currentTime}
                    onChange={(e) => {
                      const time = Number(e.target.value);
                      setCurrentTime(time);
                      if (audioRef.current) {
                        audioRef.current.currentTime = time;
                      }
                    }}
                    className="absolute inset-0 w-full h-1.5 opacity-0 cursor-pointer"
                  />
                </div>

                <span className="text-xs text-white/90 font-hint min-w-[40px] text-right">
                  {formatTime(displayDuration)}
                </span>
              </div>
            </div>

            {/* Single row controls - reordered */}
            <div className="flex items-center justify-center gap-2 md:gap-3 mb-3">
              {/* Skip Back 15s */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSkip(-15)}
                disabled={currentTime === 0}
                className="text-white/80 hover:text-gold hover:bg-gold/10"
              >
                <SkipBack className="w-5 h-5" />
              </Button>

              {/* Play/Pause - slightly larger */}
              <Button
                onClick={handlePlayPause}
                className="w-12 h-12 rounded-full bg-gradient-to-br from-saffron via-gold to-gold hover:scale-110 active:scale-95 transition-all duration-300 shadow-[0_0_20px_rgba(212,175,55,0.4)] hover:shadow-[0_0_30px_rgba(212,175,55,0.7)]"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 text-white transition-all duration-200" />
                ) : (
                  <Play className="w-6 h-6 text-white ml-0.5 transition-all duration-200" />
                )}
              </Button>

              {/* Skip Forward 15s */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSkip(15)}
                disabled={!audioRef.current || currentTime >= (actualDuration || displayDuration) - 1}
                className="text-white/80 hover:text-gold hover:bg-gold/10"
              >
                <SkipForward className="w-5 h-5" />
              </Button>

              {/* Volume Icon */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMuteToggle}
                className="text-white/80 hover:text-gold hover:bg-gold/10"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-5 h-5" />
                ) : volume < 50 ? (
                  <Volume1 className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </Button>

              {/* Volume Slider - adjacent to volume icon */}
              <div className="w-20 md:w-32">
                <Slider
                  value={[isMuted ? 0 : volume]}
                  onValueChange={handleVolumeChange}
                  max={100}
                  step={1}
                  className="[&_[role=slider]]:bg-gold [&_[role=slider]]:border-white [&_[role=slider]]:shadow-[0_0_10px_rgba(212,175,55,0.5)]"
                />
              </div>

              {/* Spacer for visual separation */}
              <div className="w-3 md:w-6" />

              {/* Loop Toggle - far right */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsLooping(!isLooping)}
                className={cn(
                  "text-white/80 hover:text-gold hover:bg-gold/10",
                  isLooping && "text-gold bg-gold/10"
                )}
              >
                <Repeat className="w-5 h-5" />
              </Button>
            </div>

            {/* Origin Story */}
            {soundscape.fullStory && (
              <Collapsible open={showStory} onOpenChange={setShowStory}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full bg-gradient-to-r from-taupe/20 to-gold/10 backdrop-blur-md border border-gold/30 text-white hover:from-taupe/30 hover:to-gold/20 hover:border-gold/50"
                  >
                    <span className="flex items-center gap-2 text-xs font-hint">
                      Origin Story
                      <ChevronDown className={cn(
                        "w-3 h-3 transition-transform",
                        showStory && "rotate-180"
                      )} />
                    </span>
                  </Button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <Card className="mt-2 bg-gradient-to-b from-taupe-rich/40 via-black/70 to-black/80 backdrop-blur-xl border border-gold/20 rounded-xl">
                    <CardContent className="pt-4 pb-3 space-y-3 max-h-[40vh] overflow-y-auto">
                      <div>
                        <h3 className="text-gold font-body font-semibold text-sm mb-1">The Story</h3>
                        <p className="text-white/80 text-xs leading-relaxed font-body">
                          {soundscape.fullStory}
                        </p>
                      </div>

                      {soundscape.technique && (
                        <div>
                          <h3 className="text-gold font-body font-semibold text-sm mb-1">Technique</h3>
                          <p className="text-white/80 text-xs leading-relaxed font-body">
                            {soundscape.technique}
                          </p>
                        </div>
                      )}

                      {soundscape.benefits && soundscape.benefits.length > 0 && (
                        <div>
                          <h3 className="text-gold font-body font-semibold text-sm mb-1">Benefits</h3>
                          <ul className="space-y-1">
                            {soundscape.benefits.map((benefit, index) => (
                              <li key={index} className="flex items-start gap-2 text-white/80 text-xs font-body">
                                <span className="text-gold mt-0.5">•</span>
                                <span>{benefit}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {soundscape.completionQuote && (
                        <div className="pt-2 border-t border-gold/10">
                          <p className="text-gold/80 text-xs italic font-body">
                            "{soundscape.completionQuote}"
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </>
      )}

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
