import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, MessageCircle, Timer, Zap, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import CoachingModal from "@/components/modals/CoachingModal";
import EmotionBreakdownModal from "@/components/modals/EmotionBreakdownModal";

interface Message {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
  emotion?: "neutral" | "positive" | "negative" | "excited";
  coaching?: string;
}

interface VoiceFirstSimulationProps {
  onEndSession: () => void;
  scenarioContext?: string;
  sessionDuration?: number; // in minutes
}

const VoiceFirstSimulation = ({ 
  onEndSession, 
  scenarioContext = "Let's practice this challenging conversation",
  sessionDuration = 10 
}: VoiceFirstSimulationProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isVoiceMode, setIsVoiceMode] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [currentMessage, setCurrentMessage] = useState("");
  const [aiEmotion, setAiEmotion] = useState<"neutral" | "positive" | "negative" | "excited">("neutral");
  const [showEmotionBreakdown, setShowEmotionBreakdown] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(sessionDuration * 60); // in seconds
  const [responseTimeLeft, setResponseTimeLeft] = useState(30); // 30 seconds per response
  const [isThinking, setIsThinking] = useState(false);
  const [achievements, setAchievements] = useState<string[]>([]);
  
  // Modal states
  const [coachingModal, setCoachingModal] = useState<{
    isOpen: boolean;
    message: string;
    type: "coaching" | "achievement" | "blindspot";
  }>({
    isOpen: false,
    message: "",
    type: "coaching"
  });
  
  const timerRef = useRef<NodeJS.Timeout>();
  const responseTimerRef = useRef<NodeJS.Timeout>();

  const emotionIcons = {
    neutral: "😐",
    positive: "😊", 
    negative: "😠",
    excited: "🎉"
  };

  const emotionColors = {
    neutral: "bg-gray-100 text-gray-700",
    positive: "bg-green-100 text-green-700",
    negative: "bg-red-100 text-red-700",
    excited: "bg-yellow-100 text-yellow-700"
  };

  // Session timer
  useEffect(() => {
    if (timeRemaining > 0) {
      timerRef.current = setTimeout(() => {
        setTimeRemaining(prev => prev - 1);
      }, 1000);
    } else {
      onEndSession();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeRemaining, onEndSession]);

  // Response timer
  useEffect(() => {
    if (responseTimeLeft > 0 && !isThinking) {
      responseTimerRef.current = setTimeout(() => {
        setResponseTimeLeft(prev => prev - 1);
      }, 1000);
    }
    
    // Vibration cue at 5 seconds
    if (responseTimeLeft === 5) {
      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
    }
    
    return () => {
      if (responseTimerRef.current) clearTimeout(responseTimerRef.current);
    };
  }, [responseTimeLeft, isThinking]);

  const handleSendMessage = (message: string) => {
    if (!message.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      text: message,
      sender: "user",
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, newMessage]);
    setCurrentMessage("");
    setIsThinking(true);
    setResponseTimeLeft(30); // Reset response timer
    
    // Simulate AI response with coaching
    setTimeout(() => {
      const responses = [
        { text: "I understand your perspective, but I have some concerns about the timeline. How do you think we can address the resource constraints?", emotion: "neutral" as const, coaching: "Good start! Try adding a specific example to strengthen your point." },
        { text: "That's an interesting point. Let me push back a bit - what if the stakeholders aren't on board with this approach?", emotion: "negative" as const, coaching: "This answer was a bit vague. Consider adding a personal story." },
        { text: "I appreciate your enthusiasm, but I'm wondering about the potential risks. How would you handle pushback from the team?", emotion: "neutral" as const, coaching: "Great empathy! Now try to be more assertive with your solution." },
        { text: "Excellent point! I can see you've really thought this through. What's your next step?", emotion: "positive" as const, coaching: "Fantastic! You're showing real confidence and clarity." },
        { text: "I'm impressed by your approach. This could really work!", emotion: "excited" as const, coaching: "Outstanding work! You've mastered this conversation style." }
      ];
      
      const response = responses[Math.floor(Math.random() * responses.length)];
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.text,
        sender: "ai",
        timestamp: new Date(),
        emotion: response.emotion,
        coaching: response.coaching
      };
      
      setMessages(prev => [...prev, aiMessage]);
      setAiEmotion(response.emotion);
      setIsThinking(false);
      
      // Show coaching modal instead of toast
      if (response.coaching) {
        const modalType = response.emotion === "negative" ? "blindspot" : "coaching";
        setCoachingModal({
          isOpen: true,
          message: response.coaching,
          type: modalType
        });
      }
      
      // Check for achievements
      if (response.emotion === "excited" && !achievements.includes("excellent-response")) {
        setAchievements(prev => [...prev, "excellent-response"]);
        setCoachingModal({
          isOpen: true,
          message: "🎉 Achievement Unlocked: Excellent Response! You've mastered this conversation style.",
          type: "achievement"
        });
      }
      
    }, 2000);
  };

  const toggleVoiceMode = () => {
    setIsVoiceMode(!isVoiceMode);
  };

  const startListening = () => {
    setIsListening(true);
    // In a real app, this would start speech recognition
    setTimeout(() => {
      setIsListening(false);
    }, 3000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercentage = ((sessionDuration * 60 - timeRemaining) / (sessionDuration * 60)) * 100;
  const responseProgress = ((30 - responseTimeLeft) / 30) * 100;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header with Timer */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-4">
          <Badge variant="secondary" className="text-xs">
            High Intensity
          </Badge>
          
          <Button
            onClick={onEndSession}
            variant="destructive"
            size="sm"
            className="px-4 py-2 text-sm rounded-lg hover:scale-105 active:scale-95 transition-all duration-200"
          >
            End Session
          </Button>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Session Timer */}
          <div className="flex items-center gap-2">
            <Timer size={16} className="text-muted-foreground" />
            <span className="text-sm font-mono text-foreground">
              {formatTime(timeRemaining)}
            </span>
          </div>
          
          {/* Response Timer Circle */}
          <div className="relative w-8 h-8">
            <svg className="w-8 h-8 transform -rotate-90">
              <circle
                cx="16"
                cy="16"
                r="14"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                className="text-muted-foreground/20"
              />
              <circle
                cx="16"
                cy="16"
                r="14"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 14}`}
                strokeDashoffset={`${2 * Math.PI * 14 * (1 - responseProgress / 100)}`}
                className={cn(
                  "transition-all duration-1000",
                  responseTimeLeft <= 5 ? "text-red-500" : "text-primary"
                )}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-mono">
              {responseTimeLeft}
            </span>
          </div>
        </div>
      </div>

      {/* Messages Area - Mobile Optimized */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-120 min-h-0">

        {/* Messages */}
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex",
              message.sender === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[85%] p-3 rounded-lg",
                message.sender === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border"
              )}
            >
              <p className="text-sm">{message.text}</p>
              <p className="text-xs opacity-70 mt-1">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-card border border-border p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-100"></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-200"></div>
                <span className="text-sm text-muted-foreground ml-2">Thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Bar - Mobile First */}
      <div className="fixed bottom-24 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border p-3 pb-4 z-40 shadow-lg">
        <div className="flex items-center gap-3 max-w-xl mx-auto">
          {/* Text Input Area */}
          <div className="flex-1">
            {!isVoiceMode ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(currentMessage);
                    }
                  }}
                  placeholder="Type your response..."
                  className="flex-1 px-3 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground text-sm touch-manipulation"
                />
                <Button
                  onClick={() => handleSendMessage(currentMessage)}
                  disabled={!currentMessage.trim()}
                  size="sm"
                  className="px-4 py-3 min-h-[48px] touch-manipulation"
                >
                  Send
                </Button>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-2">
                <Button
                  onClick={startListening}
                  disabled={isListening}
                  className={cn(
                    "min-w-[56px] min-h-[56px] w-14 h-14 rounded-full transition-all duration-300 shadow-lg touch-manipulation",
                    isListening 
                      ? "bg-red-500 hover:bg-red-600 scale-110 animate-pulse" 
                      : "bg-primary hover:bg-primary/90 hover:scale-105 active:scale-95"
                  )}
                >
                  {isListening ? (
                    <div className="w-4 h-4 bg-white rounded-full animate-pulse"></div>
                  ) : (
                    <Mic size={24} />
                  )}
                </Button>
                <p className="text-xs mt-1">
                  {isListening ? "Listening..." : "Tap to speak"}
                </p>
              </div>
            )}
          </div>

          {/* Voice Mode Toggle */}
          <Button
            onClick={toggleVoiceMode}
            variant="secondary"
            size="lg"
            className="min-w-[48px] min-h-[48px] w-12 h-12 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 touch-manipulation"
          >
            {isVoiceMode ? (
              <MessageCircle size={20} className="text-primary" />
            ) : (
              <Mic size={20} className="text-primary" />
            )}
          </Button>

          {/* AI Avatar with Emotion */}
          <div className="relative">
            <Button
              onClick={() => setShowEmotionBreakdown(!showEmotionBreakdown)}
              className={cn(
                "min-w-[48px] min-h-[48px] w-12 h-12 rounded-full text-base shadow-lg transition-all duration-300 touch-manipulation",
                emotionColors[aiEmotion]
              )}
            >
              {emotionIcons[aiEmotion]}
            </Button>
            
          </div>
        </div>
      </div>

      {/* Modals */}
      <CoachingModal
        message={coachingModal.message}
        type={coachingModal.type}
        isOpen={coachingModal.isOpen}
        onClose={() => setCoachingModal(prev => ({ ...prev, isOpen: false }))}
      />

      <EmotionBreakdownModal
        emotion={aiEmotion}
        exchangeCount={messages.length}
        isOpen={showEmotionBreakdown}
        onClose={() => setShowEmotionBreakdown(false)}
      />
    </div>
  );
};

export default VoiceFirstSimulation;