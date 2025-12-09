import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, X, MessageSquare, Clock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import SleekLineAnimation from "@/components/SleekLineAnimation";
import { useDialogueSession } from "@/hooks/useDialogueSession";
import CoachingToaster from "./CoachingToaster";

interface TextFirstDialogueProps {
  scenarioId: string;
  personaId: string;
  coachPersonality?: string;
  personalityStyle?: string;
  voiceStyle?: string;
  additionalContext?: string;
  attachments?: Array<{ name: string; type: string; content?: string }>;
  practiceDuration?: number;
  coachingStyle?: string;
  onEndSession: () => void;
  aiPersona?: {
    name: string;
    role: string;
  };
}

const TextFirstDialogue = ({
  scenarioId,
  personaId,
  coachPersonality = 'supportive',
  personalityStyle = 'warm-supportive',
  voiceStyle,
  additionalContext,
  attachments = [],
  practiceDuration = 15,
  coachingStyle = 'supportive',
  onEndSession,
  aiPersona = { name: "Conversation Partner", role: "Professional" }
}: TextFirstDialogueProps) => {
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [currentMessage, setCurrentMessage] = useState("");
  const [timeRemaining, setTimeRemaining] = useState(practiceDuration * 60);
  const [activeIntervention, setActiveIntervention] = useState<any>(null);
  const timerRef = useRef<NodeJS.Timeout>();

  const dialogueSession = useDialogueSession();
  const { 
    messages, 
    isLoading, 
    interventions,
    sessionStatus,
    startSession,
    sendMessage,
    endSession
  } = dialogueSession;

  // Get current intervention (latest one)
  const currentIntervention = interventions.length > 0 ? interventions[interventions.length - 1] : null;

  // Start session on mount
  useEffect(() => {
    const mappedCoachingStyle = (coachingStyle === 'supportive' || coachingStyle === 'challenging' || coachingStyle === 'minimal') 
      ? coachingStyle 
      : 'supportive';
    
    startSession(scenarioId, personaId, mappedCoachingStyle, {
      personalityStyle,
      voiceStyle,
      additionalContext,
      attachments,
      practiceDuration,
      coachingStyle: mappedCoachingStyle
    });
  }, []);

  // Session timer countdown - pauses when coaching popup is active
  useEffect(() => {
    if (sessionStatus === 'active' && timeRemaining > 0 && !activeIntervention) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            handleEndSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionStatus, activeIntervention]);

  // Handle coaching interventions
  useEffect(() => {
    if (currentIntervention) {
      setActiveIntervention(currentIntervention);
    }
  }, [currentIntervention]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSendMessage = async (message: string) => {
    if (!message.trim() || isLoading) return;
    setCurrentMessage("");
    await sendMessage(message);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(currentMessage);
    }
  };

  const handleEndSession = async () => {
    await endSession();
    onEndSession();
  };

  const toggleListening = () => {
    if (isListening) {
      setIsListening(false);
      // In a real implementation, this would capture voice input
      // For now, simulate with placeholder
      const placeholderResponse = "I think my experiences have shaped who I am today...";
      handleSendMessage(placeholderResponse);
    } else {
      setIsListening(true);
    }
  };

  // Get latest AI message
  const latestAiMessage = messages
    .filter(m => m.role === 'persona' || m.role === 'coach')
    .slice(-1)[0];

  const isAISpeaking = isLoading && messages[messages.length - 1]?.role === 'user';

  return (
    <div className="h-full bg-gradient-to-br from-background via-muted/30 to-secondary/20 font-editorial relative overflow-hidden flex flex-col">
      {/* Main Split Content */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* AI Persona Section - Top with Cyan theme */}
        <div className="flex-1 flex items-end justify-center py-2 px-4 relative overflow-hidden transition-all duration-500 min-h-0">
          {/* Depth layer - cyan radial gradient background */}
          <div className={cn(
            "absolute inset-0 bg-[radial-gradient(ellipse_at_center_bottom,_var(--tw-gradient-stops))] transition-all duration-500",
            isAISpeaking 
              ? "from-cyan-500/20 via-cyan-400/15 to-transparent brightness-110" 
              : "from-cyan-500/10 via-cyan-400/5 to-transparent"
          )} />
          
          {/* Additional cyan tint overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 via-transparent to-background/20 pointer-events-none" />
          
          {/* Content */}
          <div className="relative z-10 w-full text-center space-y-3">
            {/* Timer - Compact, positioned above persona */}
            <div className="flex justify-center">
              <div className="flex items-center gap-1.5 px-3 py-1 bg-card/60 backdrop-blur-sm rounded-full border border-border/30">
                <Clock size={12} className="text-muted-foreground" />
                <span className={cn(
                  "font-mono text-sm font-medium",
                  timeRemaining < 60 ? "text-destructive" : "text-foreground"
                )}>
                  {formatTime(timeRemaining)}
                </span>
              </div>
            </div>

            {/* Persona Name */}
            <div className="space-y-1">
              <h2 className="text-3xl md:text-4xl font-heading font-semibold text-foreground drop-shadow-sm">
                {aiPersona.name}
              </h2>
              <p className="text-xs md:text-sm text-muted-foreground/80">
                {aiPersona.role}
              </p>
            </div>

            {/* Sleek moving line animation */}
            <SleekLineAnimation 
              isActive={isAISpeaking}
              color="primary"
            />
            
            {/* AI Thinking State */}
            {isLoading && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
                <span>Thinking...</span>
              </div>
            )}

            {/* Latest AI message - full text display */}
            {latestAiMessage && (
              <div className={cn(
                "px-4 py-3 text-sm md:text-base text-foreground/90 italic max-h-40 overflow-y-auto mx-auto max-w-2xl transition-opacity duration-300",
                isLoading && "opacity-50"
              )}>
                <p className="leading-relaxed">"{latestAiMessage.content}"</p>
              </div>
            )}
          </div>
        </div>

        {/* User Section - Bottom */}
        <div className="flex-1 flex items-start justify-center py-2 px-4 pb-20 relative overflow-hidden transition-all duration-500 min-h-0">
          {/* Depth layer - radial gradient */}
          <div className={cn(
            "absolute inset-0 bg-[radial-gradient(ellipse_at_center_top,_var(--tw-gradient-stops))] transition-all duration-500",
            isListening 
              ? "from-accent/15 via-accent/20 to-transparent brightness-110" 
              : "from-accent/5 via-accent/8 to-transparent"
          )} />
          
          {/* Additional depth overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-transparent via-background/5 to-background/20 pointer-events-none" />
          
          {/* Content */}
          <div className="relative z-10 w-full text-center space-y-4">
            {/* User Label */}
            <h2 className="text-3xl md:text-4xl font-heading font-semibold text-foreground drop-shadow-sm">
              You
            </h2>

            {/* Sleek moving line for user speaking */}
            <SleekLineAnimation 
              isActive={isListening}
              color="accent"
            />

            {/* Text Mode (Default) */}
            {!isVoiceMode ? (
              <div className="space-y-2 max-w-md mx-auto">
                <textarea
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your response..."
                  className="w-full h-20 p-3 bg-card/40 backdrop-blur-xl rounded-2xl border border-border/50 text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary shadow-lg"
                  disabled={isLoading}
                  aria-label="Type your response"
                />
                
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => handleSendMessage(currentMessage)}
                    disabled={!currentMessage.trim() || isLoading}
                    className="w-full rounded-full"
                  >
                    <Send size={16} className="mr-2" />
                    Send Response
                  </Button>
                  
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={() => setIsVoiceMode(true)}
                      className="text-xs text-muted-foreground/70 hover:text-foreground transition-colors underline"
                    >
                      Switch to voice
                    </button>
                    <button
                      onClick={handleEndSession}
                      className="text-xs text-destructive/70 hover:text-destructive transition-colors"
                    >
                      End session
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Voice Mode Controls */
              <div className="flex items-center justify-center gap-8 mt-6">
                {/* Switch to Text Icon */}
                <button
                  onClick={() => setIsVoiceMode(false)}
                  className="w-14 h-14 rounded-full bg-muted/60 backdrop-blur-sm border border-white/10 flex items-center justify-center transition-all duration-200 hover:scale-105 hover:bg-muted/80"
                  aria-label="Switch to text mode"
                >
                  <MessageSquare size={24} className="text-foreground" />
                </button>

                {/* Microphone Icon (Center, Primary) */}
                <button
                  onClick={toggleListening}
                  disabled={isLoading}
                  className={cn(
                    "w-16 h-16 rounded-full flex items-center justify-center backdrop-blur-xl shadow-2xl border border-white/10 transition-all duration-300",
                    isListening 
                      ? "bg-gradient-to-br from-accent/90 to-destructive/90 scale-110 shadow-accent/50 animate-glow" 
                      : "bg-gradient-to-br from-forest/90 to-forest/70 hover:scale-105 active:scale-95 shadow-forest/30",
                    isLoading && "opacity-50 cursor-not-allowed"
                  )}
                  aria-label={isListening ? "Stop speaking" : "Start speaking"}
                >
                  {isListening ? (
                    <MicOff size={28} className="text-white" />
                  ) : (
                    <Mic size={28} className="text-white" />
                  )}
                </button>

                {/* End Session Icon */}
                <button
                  onClick={handleEndSession}
                  className="w-14 h-14 rounded-full bg-destructive/80 backdrop-blur-sm border border-white/10 text-white flex items-center justify-center transition-all duration-200 hover:scale-105 hover:bg-destructive/90"
                  aria-label="End session"
                >
                  <X size={24} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Coaching Intervention Toast with Blur Overlay */}
      {activeIntervention && (
        <>
          <div className="fixed inset-0 bg-background/50 backdrop-blur-sm z-40" onClick={() => setActiveIntervention(null)} />
          <CoachingToaster
            intervention={activeIntervention}
            personality={coachingStyle as 'supportive' | 'challenging' | 'minimal'}
            onDismiss={() => setActiveIntervention(null)}
          />
        </>
      )}
    </div>
  );
};

export default TextFirstDialogue;
