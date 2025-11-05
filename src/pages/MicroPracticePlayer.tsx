import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Pause, RotateCcw, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import TopNavigation from "@/components/simulation/TopNavigation";
import { trackSanctuaryEvent, createSessionEvent } from "@/utils/sanctuaryEventTracking";
import { getContentById } from "@/data/practicesAndSoundscapes";

const MicroPracticePlayer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const category = (location.state as any)?.category || 'presence';
  
  const practice = getContentById(id || '');
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (practice) {
      setTimeLeft(practice.duration * 60); // Convert to seconds
    }
  }, [practice]);

  useEffect(() => {
    let interval: number;
    
    if (isPlaying && timeLeft > 0) {
      interval = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => clearInterval(interval);
  }, [isPlaying, timeLeft]);

  const handlePlay = () => {
    if (!hasStarted && practice) {
      // Track session start
      trackSanctuaryEvent(createSessionEvent(
        'session_start',
        practice.id,
        'micro-practice',
        category as any,
        practice.tags
      ));
      setHasStarted(true);
    }
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
    if (practice) {
      trackSanctuaryEvent(createSessionEvent(
        'session_pause',
        practice.id,
        'micro-practice',
        category as any,
        practice.tags,
        practice.duration * 60 - timeLeft
      ));
    }
  };

  const handleRestart = () => {
    if (practice) {
      setTimeLeft(practice.duration * 60);
      setIsPlaying(false);
      setCompleted(false);
    }
  };

  const handleComplete = () => {
    setIsPlaying(false);
    setCompleted(true);
    if (practice) {
      trackSanctuaryEvent(createSessionEvent(
        'session_complete',
        practice.id,
        'micro-practice',
        category as any,
        practice.tags,
        practice.duration * 60,
        4 // Default effectiveness
      ));
      toast.success("Practice complete! Well done.");
    }
  };

  const handleExit = () => {
    if (hasStarted && !completed && practice) {
      trackSanctuaryEvent(createSessionEvent(
        'session_skip',
        practice.id,
        'micro-practice',
        category as any,
        practice.tags,
        practice.duration * 60 - timeLeft
      ));
    }
    navigate(-1);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!practice) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Practice not found</p>
      </div>
    );
  }

  const progress = practice.duration > 0 
    ? ((practice.duration * 60 - timeLeft) / (practice.duration * 60)) * 100 
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-mocha via-background to-background">
      <TopNavigation backPath={`/micro-practices`} />
      
      <div className="max-w-2xl mx-auto px-6 py-12 pt-24">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-serif text-foreground mb-2">{practice.title}</h1>
          <p className="text-muted-foreground">{practice.creator}</p>
        </div>

        {/* Timer Card */}
        <Card className="bg-card/50 backdrop-blur-sm border-gold/20 mb-6">
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <div className="text-7xl font-bold text-gold mb-2">
                {formatTime(timeLeft)}
              </div>
              <p className="text-sm text-muted-foreground">
                {completed ? 'Complete!' : isPlaying ? 'In progress...' : 'Ready to begin'}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="h-2 bg-muted rounded-full overflow-hidden mb-6">
              <div
                className="h-full bg-gradient-to-r from-gold via-gold-light to-gold transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
              {!completed && (
                <>
                  {!isPlaying ? (
                    <Button
                      size="lg"
                      onClick={handlePlay}
                      className="bg-gold hover:bg-gold/90"
                    >
                      <Play className="h-5 w-5 mr-2" />
                      {hasStarted ? 'Resume' : 'Start'}
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={handlePause}
                    >
                      <Pause className="h-5 w-5 mr-2" />
                      Pause
                    </Button>
                  )}
                  
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleRestart}
                  >
                    <RotateCcw className="h-5 w-5 mr-2" />
                    Restart
                  </Button>
                </>
              )}
              
              {completed && (
                <Button
                  size="lg"
                  onClick={() => navigate(-1)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  Done
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card className="bg-card/30 border-border/50">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-3">Instructions</h3>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {practice.storyHook}
            </p>
          </CardContent>
        </Card>

        {/* Exit Button */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-6 text-muted-foreground hover:text-foreground"
          onClick={handleExit}
        >
          <X className="h-4 w-4 mr-2" />
          Exit Practice
        </Button>
      </div>
    </div>
  );
};

export default MicroPracticePlayer;
